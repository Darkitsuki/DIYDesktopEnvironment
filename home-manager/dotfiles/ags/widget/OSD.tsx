import app from "ags/gtk4/app"
import { Astal, Gtk } from "ags/gtk4"
import { createState } from "gnim"
import { execAsync, subprocess } from "ags/process"
import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"

interface OsdState {
  icon: string
  label: string
  value: number
  muted: boolean
}

interface BacklightDevice {
  brightnessPath: string
  maxBrightness: number
}

function findBacklightDevice(): BacklightDevice | null {
  const baseDir = "/sys/class/backlight"
  try {
    const dir = Gio.File.new_for_path(baseDir)
    if (!dir.query_exists(null)) return null

    const enumerator = dir.enumerate_children(
      "standard::name",
      Gio.FileQueryInfoFlags.NONE,
      null,
    )
    let info: Gio.FileInfo | null
    while ((info = enumerator.next_file(null)) !== null) {
      const name = info.get_name()
      const brightnessPath = `${baseDir}/${name}/brightness`
      const maxPath = `${baseDir}/${name}/max_brightness`
      if (
        GLib.file_test(brightnessPath, GLib.FileTest.EXISTS) &&
        GLib.file_test(maxPath, GLib.FileTest.EXISTS)
      ) {
        const [ok, bytes] = GLib.file_get_contents(maxPath)
        if (ok) {
          const maxBrightness = parseInt(new TextDecoder().decode(bytes).trim(), 10)
          if (!isNaN(maxBrightness) && maxBrightness > 0) {
            return { brightnessPath, maxBrightness }
          }
        }
      }
    }
  } catch (e) {
    console.error("OSD backlight discovery error:", e)
  }
  return null
}

function readBrightnessPercent(device: BacklightDevice): number | null {
  try {
    const [ok, bytes] = GLib.file_get_contents(device.brightnessPath)
    if (ok) {
      const current = parseInt(new TextDecoder().decode(bytes).trim(), 10)
      if (!isNaN(current)) {
        return Math.min(100, Math.max(0, Math.round((current / device.maxBrightness) * 100)))
      }
    }
  } catch {}
  return null
}

function getVolumeIcon(volume: number, muted: boolean): string {
  if (muted) return "󰝟"
  if (volume > 60) return "󰕾"
  if (volume > 20) return "󰖀"
  return "󰕿"
}

function getBrightnessIcon(percent: number): string {
  if (percent >= 70) return "󰃠"
  if (percent >= 35) return "󰃟"
  return "󰃞"
}

export default function OSD() {
  const [visible, setVisible] = createState(false)
  const [state, setState] = createState<OsdState>({
    icon: "󰕾",
    label: "Volume",
    value: 0,
    muted: false,
  })

  let hideTimer: ReturnType<typeof setTimeout> | null = null

  const showOsd = (next: OsdState) => {
    setState(next)
    setVisible(true)
    if (hideTimer) clearTimeout(hideTimer)
    hideTimer = setTimeout(() => {
      setVisible(false)
      hideTimer = null
    }, 1800)
  }

  // ----------------------------------------------------
  // Audio Sink Monitor (wpctl + pactl subscribe)
  // ----------------------------------------------------
  let lastVolume: number | null = null
  let lastMuted: boolean | null = null
  let audioCheckPending = false

  const checkAudio = async (notify: boolean) => {
    try {
      const out = await execAsync(["wpctl", "get-volume", "@DEFAULT_AUDIO_SINK@"])
      const match = out.match(/Volume:\s+([0-9.]+)(?:\s+\[MUTED\])?/)
      if (!match) return

      const volume = Math.min(100, Math.max(0, Math.round(parseFloat(match[1]) * 100)))
      const muted = out.includes("[MUTED]")

      if (lastVolume === null || lastMuted === null) {
        lastVolume = volume
        lastMuted = muted
        return
      }

      if (volume !== lastVolume || muted !== lastMuted) {
        lastVolume = volume
        lastMuted = muted
        if (notify) {
          showOsd({
            icon: getVolumeIcon(volume, muted),
            label: muted ? "Muted" : "Volume",
            value: volume,
            muted,
          })
        }
      }
    } catch {}
  }

  const scheduleAudioCheck = () => {
    if (audioCheckPending) return
    audioCheckPending = true
    setTimeout(() => {
      audioCheckPending = false
      checkAudio(true)
    }, 25)
  }

  const startPactlSubscriber = () => {
    try {
      const proc = subprocess(
        ["pactl", "subscribe"],
        (line) => {
          if (/on (sink|server)\b/.test(line)) {
            scheduleAudioCheck()
          }
        },
        () => {},
      )
      proc.connect("exit", () => {
        setTimeout(startPactlSubscriber, 2000)
      })
    } catch (e) {
      console.error("OSD pactl subscribe error:", e)
    }
  }

  checkAudio(false)
  startPactlSubscriber()

  // ----------------------------------------------------
  // Internal Backlight Monitor (Gio.FileMonitor + lightweight sysfs check)
  // ----------------------------------------------------
  const backlightDevice = findBacklightDevice()
  let lastBrightness: number | null = backlightDevice
    ? readBrightnessPercent(backlightDevice)
    : null
  let backlightMonitor: Gio.FileMonitor | null = null

  const checkBacklight = (notify: boolean) => {
    if (!backlightDevice) return
    const percent = readBrightnessPercent(backlightDevice)
    if (percent === null) return

    if (lastBrightness === null) {
      lastBrightness = percent
      return
    }

    if (percent !== lastBrightness) {
      lastBrightness = percent
      if (notify) {
        showOsd({
          icon: getBrightnessIcon(percent),
          label: "Brightness",
          value: percent,
          muted: false,
        })
      }
    }
  }

  if (backlightDevice) {
    try {
      const file = Gio.File.new_for_path(backlightDevice.brightnessPath)
      backlightMonitor = file.monitor_file(Gio.FileMonitorFlags.NONE, null)
      backlightMonitor.connect("changed", () => {
        checkBacklight(true)
      })
    } catch (e) {
      console.error("OSD backlight file monitor error:", e)
    }

    // Sysfs files do not always emit inotify events across all drivers;
    // an in-process GLib file read every 250ms spawns zero processes.
    setInterval(() => {
      checkBacklight(true)
    }, 250)
  }

  return (
    <window
      name="osd"
      namespace="osd"
      visible={visible}
      anchor={Astal.WindowAnchor.BOTTOM}
      marginBottom={48}
      exclusivity={Astal.Exclusivity.IGNORE}
      keymode={Astal.Keymode.NONE}
      layer={Astal.Layer.OVERLAY}
      application={app}
      cssClasses={["osd-window"]}
    >
      <box
        cssClasses={state.as((s) => ["osd-pill", s.muted ? "muted" : "active"])}
        spacing={12}
        valign={Gtk.Align.CENTER}
      >
        <label
          label={state.as((s) => s.icon)}
          cssClasses={["osd-icon"]}
          valign={Gtk.Align.CENTER}
        />
        <label
          label={state.as((s) => s.label)}
          cssClasses={["osd-label"]}
          valign={Gtk.Align.CENTER}
        />
        <levelbar
          cssClasses={["osd-bar"]}
          minValue={0}
          maxValue={100}
          value={state.as((s) => s.value)}
          mode={Gtk.LevelBarMode.CONTINUOUS}
          hexpand
          valign={Gtk.Align.CENTER}
        />
        <label
          label={state.as((s) => `${s.value}%`)}
          cssClasses={["osd-value"]}
          halign={Gtk.Align.END}
          valign={Gtk.Align.CENTER}
        />
      </box>
    </window>
  )
}
