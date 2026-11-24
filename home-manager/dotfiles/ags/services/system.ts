import { createState } from "gnim"
import { execAsync } from "ags/process"
import GLib from "gi://GLib?version=2.0"

export interface BatteryInfo {
  percent: number
  charging: boolean
  icon: string
}

export function getBatteryInfo(): BatteryInfo {
  try {
    let percent = 100
    let charging = false

    const [hasCap, capBytes] = GLib.file_get_contents("/sys/class/power_supply/BAT0/capacity")
    if (hasCap) {
      percent = parseInt(new TextDecoder().decode(capBytes).trim(), 10) || 100
    }

    const [hasStat, statBytes] = GLib.file_get_contents("/sys/class/power_supply/BAT0/status")
    if (hasStat) {
      const status = new TextDecoder().decode(statBytes).trim().toLowerCase()
      charging = status === "charging" || status === "full"
    }

    let icon = "󰁹"
    if (charging) {
      icon = "󰂄"
    } else if (percent >= 90) {
      icon = "󰁹"
    } else if (percent >= 70) {
      icon = "󰂁"
    } else if (percent >= 50) {
      icon = "󰁾"
    } else if (percent >= 30) {
      icon = "󰁼"
    } else if (percent >= 15) {
      icon = "󰁺"
    } else {
      icon = "󰂃"
    }

    return { percent, charging, icon }
  } catch {
    return { percent: 100, charging: false, icon: "󰁹" }
  }
}

export function getUptime(): string {
  try {
    const [ok, bytes] = GLib.file_get_contents("/proc/uptime")
    if (ok) {
      const text = new TextDecoder().decode(bytes).trim()
      const totalSeconds = parseInt(text.split(" ")[0], 10) || 0
      const hours = Math.floor(totalSeconds / 3600)
      const minutes = Math.floor((totalSeconds % 3600) / 60)
      if (hours > 0) {
        return `${hours}h ${minutes}m`
      }
      return `${minutes}m`
    }
  } catch {}
  return "0m"
}

// DND State
const [dndState, setDndState] = createState(false)
export const dnd = dndState

export async function toggleDnd() {
  const next = !dndState.peek()
  setDndState(next)
  try {
    // Try dunst
    await execAsync(["sh", "-c", "command -v dunstctl >/dev/null 2>&1 && dunstctl set-paused toggle || true"])
    // Try mako
    await execAsync(["sh", "-c", "command -v makoctl >/dev/null 2>&1 && makoctl mode -t do-not-disturb || true"])
  } catch {}
}

export async function takeScreenshot() {
  try {
    await execAsync(["sh", "-c", 'grim -g "$(slurp)" - | wl-copy && notify-send -u low "Screenshot" "Area copied to clipboard"'])
  } catch (e) {
    console.error("Screenshot error:", e)
  }
}

export async function reloadAgs() {
  try {
    await execAsync(["sh", "-c", "ags quit && sleep 0.2 && ags run &"])
  } catch (e) {
    console.error("Reload AGS error:", e)
  }
}

export async function openPowerMenu() {
  try {
    await execAsync([
      "sh",
      "-c",
      'choice=$(printf "Shutdown\\nReboot\\nSuspend\\nHibernate\\nLock" | wofi --dmenu --prompt "Power Menu" --width 260 --height 230); case "$choice" in Shutdown) systemctl poweroff ;; Reboot) systemctl reboot ;; Suspend) systemctl suspend ;; Hibernate) systemctl hibernate ;; Lock) loginctl lock-session ;; esac',
    ])
  } catch (e) {
    console.error("Power menu error:", e)
  }
}

// Keep Awake (hypridle pause/resume) State
const [keepAwakeState, setKeepAwakeState] = createState(false)
export const keepAwake = keepAwakeState

export async function isKeepAwakeActive(): Promise<boolean> {
  try {
    const out = await execAsync(["sh", "-c", "systemctl --user is-active hypridle.service 2>/dev/null || true"])
    return out.trim() !== "active"
  } catch {
    return false
  }
}

export async function updateKeepAwake() {
  const active = await isKeepAwakeActive()
  setKeepAwakeState(active)
}

export async function toggleKeepAwake(): Promise<boolean> {
  try {
    const isAwake = await isKeepAwakeActive()
    if (!isAwake) {
      await execAsync([
        "sh",
        "-c",
        'systemctl --user stop hypridle.service && notify-send -u low -t 2000 "Keep Awake: ON" "hypridle paused — screen will stay awake" 2>/dev/null || true',
      ])
      setKeepAwakeState(true)
      return true
    } else {
      await execAsync([
        "sh",
        "-c",
        'systemctl --user start hypridle.service && notify-send -u low -t 2000 "Keep Awake: OFF" "hypridle resumed (auto-lock 5m)" 2>/dev/null || true',
      ])
      setKeepAwakeState(false)
      return false
    }
  } catch (e) {
    console.error("toggleKeepAwake error:", e)
    await updateKeepAwake()
    return keepAwakeState.peek()
  }
}

export async function lockScreen(): Promise<void> {
  try {
    await execAsync(["sh", "-c", "nohup sh -c 'pidof hyprlock || hyprlock' >/dev/null 2>&1 &"])
  } catch (e) {
    console.error("lockScreen error:", e)
  }
}

updateKeepAwake()
setInterval(updateKeepAwake, 3000)

