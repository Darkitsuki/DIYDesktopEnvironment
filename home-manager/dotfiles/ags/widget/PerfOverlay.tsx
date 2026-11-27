import app from "ags/gtk4/app"
import { Astal, Gdk, Gtk } from "ags/gtk4"
import { createState } from "gnim"
import { execAsync } from "ags/process"
import GLib from "gi://GLib?version=2.0"
import Cairo from "cairo"

interface MetricState {
  text: string
  cssClass: "normal" | "warning" | "critical" | "suspended"
}

interface FpsState extends MetricState {
  tooltip: string
}

const GPU_RUNTIME_STATUS_PATH = "/sys/bus/pci/devices/0000:01:00.0/power/runtime_status"

// ----------------------------------------------------
// CPU Usage: /proc/stat delta
// ----------------------------------------------------
function readCpuStat(): { idle: number; total: number } | null {
  try {
    const [ok, bytes] = GLib.file_get_contents("/proc/stat")
    if (ok) {
      const line = new TextDecoder().decode(bytes).split("\n")[0]
      const parts = line.trim().split(/\s+/).slice(1).map(Number)
      if (parts.length >= 4) {
        const idle = parts[3] + (parts[4] || 0)
        const total = parts.reduce((acc, val) => acc + val, 0)
        return { idle, total }
      }
    }
  } catch {}
  return null
}

// ----------------------------------------------------
// CPU Temperature: hwmon coretemp/k10temp or thermal_zone
// ----------------------------------------------------
let cachedCpuTempPath: string | null = null

function getCpuTempPath(): string | null {
  if (cachedCpuTempPath && GLib.file_test(cachedCpuTempPath, GLib.FileTest.EXISTS)) {
    return cachedCpuTempPath
  }

  for (let i = 0; i < 16; i++) {
    const namePath = `/sys/class/hwmon/hwmon${i}/name`
    if (GLib.file_test(namePath, GLib.FileTest.EXISTS)) {
      try {
        const [ok, bytes] = GLib.file_get_contents(namePath)
        if (ok) {
          const name = new TextDecoder().decode(bytes).trim()
          if (name === "coretemp" || name === "k10temp") {
            const tempFile = `/sys/class/hwmon/hwmon${i}/temp1_input`
            if (GLib.file_test(tempFile, GLib.FileTest.EXISTS)) {
              cachedCpuTempPath = tempFile
              return cachedCpuTempPath
            }
          }
        }
      } catch {}
    }
  }

  for (let i = 0; i < 12; i++) {
    const typePath = `/sys/class/thermal/thermal_zone${i}/type`
    if (GLib.file_test(typePath, GLib.FileTest.EXISTS)) {
      try {
        const [ok, bytes] = GLib.file_get_contents(typePath)
        if (ok) {
          const type = new TextDecoder().decode(bytes).trim().toLowerCase()
          if (
            type.includes("x86_pkg_temp") ||
            type.includes("coretemp") ||
            type.includes("k10temp") ||
            type.includes("acpitz")
          ) {
            const tempFile = `/sys/class/thermal/thermal_zone${i}/temp`
            if (GLib.file_test(tempFile, GLib.FileTest.EXISTS)) {
              cachedCpuTempPath = tempFile
              return cachedCpuTempPath
            }
          }
        }
      } catch {}
    }
  }

  return null
}

function readCpuTempC(): number | null {
  try {
    const path = getCpuTempPath()
    if (path) {
      const [ok, bytes] = GLib.file_get_contents(path)
      if (ok) {
        const raw = parseInt(new TextDecoder().decode(bytes).trim(), 10)
        if (!isNaN(raw)) {
          return raw > 1000 ? Math.round(raw / 1000) : raw
        }
      }
    }
  } catch {}
  return null
}

// ----------------------------------------------------
// RAM Usage: /proc/meminfo
// ----------------------------------------------------
function readRamMetric(): MetricState {
  try {
    const [ok, bytes] = GLib.file_get_contents("/proc/meminfo")
    if (ok) {
      const text = new TextDecoder().decode(bytes)
      let totalKb = 0
      let availKb = 0
      for (const line of text.split("\n")) {
        if (line.startsWith("MemTotal:")) {
          totalKb = parseInt(line.replace(/[^0-9]/g, ""), 10)
        } else if (line.startsWith("MemAvailable:")) {
          availKb = parseInt(line.replace(/[^0-9]/g, ""), 10)
        }
        if (totalKb > 0 && availKb > 0) break
      }
      if (totalKb > 0) {
        const usedKb = totalKb - availKb
        const percent = Math.round((usedKb / totalKb) * 100)
        const usedGiB = (usedKb / (1024 * 1024)).toFixed(1)
        const totalGiB = (totalKb / (1024 * 1024)).toFixed(1)
        const cssClass = percent >= 90 ? "critical" : percent >= 80 ? "warning" : "normal"
        return {
          text: `${usedGiB}/${totalGiB} GiB (${percent}%)`,
          cssClass,
        }
      }
    }
  } catch {}
  return { text: "--/-- GiB", cssClass: "suspended" }
}

// ----------------------------------------------------
// GPU Telemetry: D3cold-safe nvidia-smi query
// ----------------------------------------------------
function readGpuRuntimeStatus(): string | null {
  try {
    if (!GLib.file_test(GPU_RUNTIME_STATUS_PATH, GLib.FileTest.EXISTS)) return null
    const [ok, bytes] = GLib.file_get_contents(GPU_RUNTIME_STATUS_PATH)
    if (ok) {
      return new TextDecoder().decode(bytes).trim()
    }
  } catch {}
  return null
}

async function readGpuMetric(): Promise<MetricState> {
  const runtimeStatus = readGpuRuntimeStatus()
  if (runtimeStatus === "suspended") {
    return { text: "GPU D3cold", cssClass: "suspended" }
  }
  if (runtimeStatus !== null && runtimeStatus !== "active") {
    return { text: `GPU ${runtimeStatus}`, cssClass: "suspended" }
  }

  try {
    const out = await execAsync([
      "nvidia-smi",
      "--query-gpu=utilization.gpu,temperature.gpu,power.draw,clocks.current.graphics",
      "--format=csv,noheader,nounits",
    ])
    const line = out.trim().split("\n")[0] || ""
    const parts = line.split(",").map((s) => s.trim())
    if (parts.length < 4) {
      return { text: "GPU --", cssClass: "suspended" }
    }

    const util = Math.round(parseFloat(parts[0]))
    const temp = Math.round(parseFloat(parts[1]))
    const power = parseFloat(parts[2])
    const clk = Math.round(parseFloat(parts[3]))

    if ([util, temp, power, clk].some((v) => isNaN(v))) {
      return { text: "GPU --", cssClass: "suspended" }
    }

    // Flag HP Victus EC power throttling (~30W cap under heavy GPU load)
    const ecThrottled = util >= 70 && power <= 32
    const cssClass =
      temp >= 88
        ? "critical"
        : temp >= 75 || ecThrottled
        ? "warning"
        : "normal"

    return {
      text: `GPU ${util}% · ${temp}°C · ${Math.round(power)}W · ${clk}MHz`,
      cssClass,
    }
  } catch {
    return { text: "GPU --", cssClass: "suspended" }
  }
}

// ----------------------------------------------------
// Monitor Nominal Refresh Rate: Hyprland active monitor
// ----------------------------------------------------
async function readMonitorTargetHz(): Promise<number | null> {
  try {
    const out = await execAsync(["hyprctl", "monitors", "-j"])
    const monitors = JSON.parse(out)
    if (Array.isArray(monitors)) {
      const active =
        monitors.find((m) => m && m.focused && !m.disabled) ??
        monitors.find((m) => m && !m.disabled)
      if (active && typeof active.refreshRate === "number" && active.refreshRate > 0) {
        return Math.round(active.refreshRate)
      }
    }
  } catch {}
  return null
}

export default function PerfOverlay() {
  const [cpu, setCpu] = createState<MetricState>({ text: "CPU --% · --°C", cssClass: "normal" })
  const [gpu, setGpu] = createState<MetricState>({ text: "GPU D3cold", cssClass: "suspended" })
  const [ram, setRam] = createState<MetricState>({ text: "--/-- GiB", cssClass: "normal" })
  const [fps, setFps] = createState<FpsState>({
    text: "-- FPS",
    tooltip: "Measuring FPS...",
    cssClass: "normal",
  })

  let prevIdle = 0
  let prevTotal = 0
  let lastCpuUsage: number | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let seedTimer: ReturnType<typeof setTimeout> | null = null
  let gpuInFlight = false
  let monitorInFlight = false

  let targetHz: number | null = null
  let tickId: number | null = null
  let frameStartUs = 0
  let frameCount = 0
  let lastMeasuredFps: number | null = null
  let lastFrameTimeMs: string | null = null

  const updateFpsDisplay = () => {
    if (lastMeasuredFps === null) {
      setFps({
        text: "-- FPS",
        tooltip: targetHz !== null ? `Measuring FPS (Target: ${targetHz}Hz)` : "Measuring FPS...",
        cssClass: "normal",
      })
      return
    }

    const thresholdHz = targetHz ?? 60
    const cssClass: FpsState["cssClass"] =
      lastMeasuredFps < thresholdHz * 0.6
        ? "critical"
        : lastMeasuredFps < thresholdHz * 0.85
        ? "warning"
        : "normal"

    const targetStr = targetHz !== null ? `${targetHz}Hz` : "--Hz"
    setFps({
      text: `${lastMeasuredFps} FPS`,
      tooltip: `${lastMeasuredFps} FPS (Target: ${targetStr} · ${lastFrameTimeMs ?? "--"} ms)`,
      cssClass,
    })
  }

  const updateCpuMetric = () => {
    const stat = readCpuStat()
    if (stat) {
      if (prevTotal > 0) {
        const deltaIdle = stat.idle - prevIdle
        const deltaTotal = stat.total - prevTotal
        if (deltaTotal > 0) {
          lastCpuUsage = Math.max(
            0,
            Math.min(100, Math.round(((deltaTotal - deltaIdle) / deltaTotal) * 100)),
          )
        }
      }
      prevIdle = stat.idle
      prevTotal = stat.total
    }

    const tempC = readCpuTempC()
    const usageStr = lastCpuUsage !== null ? `${lastCpuUsage}%` : "--%"
    const tempStr = tempC !== null ? `${tempC}°C` : "--°C"
    const cssClass: MetricState["cssClass"] =
      (tempC !== null && tempC >= 88) || (lastCpuUsage !== null && lastCpuUsage >= 90)
        ? "critical"
        : (tempC !== null && tempC >= 75) || (lastCpuUsage !== null && lastCpuUsage >= 75)
        ? "warning"
        : "normal"

    setCpu({ text: `CPU ${usageStr} · ${tempStr}`, cssClass })
  }

  const pollAll = () => {
    if (!win.visible) return

    updateCpuMetric()
    setRam(readRamMetric())

    if (!gpuInFlight) {
      gpuInFlight = true
      readGpuMetric()
        .then((next) => {
          if (win.visible) setGpu(next)
        })
        .finally(() => {
          gpuInFlight = false
        })
    }

    if (!monitorInFlight) {
      monitorInFlight = true
      readMonitorTargetHz()
        .then((hz) => {
          if (win.visible && hz !== null && hz !== targetHz) {
            targetHz = hz
            updateFpsDisplay()
          }
        })
        .finally(() => {
          monitorInFlight = false
        })
    }
  }

  const stopFpsTicker = () => {
    if (tickId !== null) {
      win.remove_tick_callback(tickId)
      tickId = null
    }
    frameStartUs = 0
    frameCount = 0
    lastMeasuredFps = null
    lastFrameTimeMs = null
    updateFpsDisplay()
  }

  const startFpsTicker = () => {
    stopFpsTicker()
    tickId = win.add_tick_callback((_self, frameClock) => {
      if (!win.visible) {
        tickId = null
        return GLib.SOURCE_REMOVE
      }

      const nowUs = frameClock.get_frame_time()
      if (frameStartUs === 0) {
        frameStartUs = nowUs
        frameCount = 0
        return GLib.SOURCE_CONTINUE
      }

      frameCount += 1
      const elapsed = nowUs - frameStartUs
      if (elapsed >= 1_000_000) {
        const measured = Math.round((frameCount * 1_000_000) / elapsed)
        lastMeasuredFps = measured
        lastFrameTimeMs = measured > 0 ? (elapsed / frameCount / 1000).toFixed(1) : "--"
        frameStartUs = nowUs
        frameCount = 0
        updateFpsDisplay()
      }

      return GLib.SOURCE_CONTINUE
    })
  }

  const stopPolling = () => {
    if (pollTimer !== null) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    if (seedTimer !== null) {
      clearTimeout(seedTimer)
      seedTimer = null
    }
    prevIdle = 0
    prevTotal = 0
    lastCpuUsage = null
  }

  const startPolling = () => {
    stopPolling()
    const initial = readCpuStat()
    if (initial) {
      prevIdle = initial.idle
      prevTotal = initial.total
    }
    pollAll()
    seedTimer = setTimeout(() => {
      seedTimer = null
      if (win.visible) updateCpuMetric()
    }, 250)
    pollTimer = setInterval(pollAll, 1000)
  }

  const win = (
    <window
      name="perf-overlay"
      namespace="perf-overlay"
      visible={false}
      anchor={Astal.WindowAnchor.TOP | Astal.WindowAnchor.RIGHT}
      marginTop={46}
      marginRight={12}
      layer={Astal.Layer.OVERLAY}
      exclusivity={Astal.Exclusivity.IGNORE}
      keymode={Astal.Keymode.NONE}
      resizable={false}
      canTarget={false}
      canFocus={false}
      application={app}
      cssClasses={["perf-overlay-window"]}
    >
      <box
        orientation={Gtk.Orientation.HORIZONTAL}
        spacing={10}
        valign={Gtk.Align.CENTER}
        canTarget={false}
        canFocus={false}
        cssClasses={["perf-overlay-pill"]}
      >
        <box spacing={5} valign={Gtk.Align.CENTER} canTarget={false} cssClasses={cpu.as((c) => ["perf-item", c.cssClass])}>
          <label label="" canTarget={false} cssClasses={["perf-icon"]} />
          <label label={cpu.as((c) => c.text)} canTarget={false} cssClasses={["perf-value"]} />
        </box>

        <label label="│" canTarget={false} cssClasses={["perf-sep"]} />

        <box spacing={5} valign={Gtk.Align.CENTER} canTarget={false} cssClasses={gpu.as((g) => ["perf-item", g.cssClass])}>
          <label label="󰢮" canTarget={false} cssClasses={["perf-icon"]} />
          <label label={gpu.as((g) => g.text)} canTarget={false} cssClasses={["perf-value"]} />
        </box>

        <label label="│" canTarget={false} cssClasses={["perf-sep"]} />

        <box spacing={5} valign={Gtk.Align.CENTER} canTarget={false} cssClasses={ram.as((r) => ["perf-item", r.cssClass])}>
          <label label="󰍛" canTarget={false} cssClasses={["perf-icon"]} />
          <label label={ram.as((r) => r.text)} canTarget={false} cssClasses={["perf-value"]} />
        </box>

        <label label="│" canTarget={false} cssClasses={["perf-sep"]} />

        <box
          spacing={5}
          valign={Gtk.Align.CENTER}
          canTarget={false}
          tooltipText={fps.as((f) => f.tooltip)}
          cssClasses={fps.as((f) => ["perf-item", f.cssClass])}
        >
          <label label="󰍹" canTarget={false} cssClasses={["perf-icon"]} />
          <label label={fps.as((f) => f.text)} canTarget={false} cssClasses={["perf-value", "perf-fps-value"]} />
        </box>
      </box>
    </window>
  ) as Astal.Window

  let connectedSurface: Gdk.Surface | null = null
  const applyClickThrough = () => {
    const surface = win.get_surface()
    if (!surface) return
    surface.set_input_region(new Cairo.Region())
    if (connectedSurface !== surface) {
      connectedSurface = surface
      surface.connect("layout", () => {
        surface.set_input_region(new Cairo.Region())
      })
    }
  }

  win.connect("realize", applyClickThrough)
  win.connect("map", applyClickThrough)
  win.connect("destroy", () => {
    stopPolling()
    stopFpsTicker()
  })
  win.connect("notify::visible", () => {
    if (win.visible) {
      applyClickThrough()
      startPolling()
      startFpsTicker()
    } else {
      stopPolling()
      stopFpsTicker()
    }
  })

  return win
}
