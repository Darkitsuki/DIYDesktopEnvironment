import GLib from "gi://GLib?version=2.0"

function envNonEmpty(name: string): string {
  const val = GLib.getenv(name)
  return val ? val.trim() : ""
}

export const homeDir = GLib.get_home_dir()
export const scriptsDir = envNonEmpty("DIY_SCRIPTS_DIR") || `${homeDir}/.local/bin`
export const configuredPrimaryMonitor = envNonEmpty("DIY_PRIMARY_MONITOR")
export const configuredExternalMonitor = envNonEmpty("DIY_EXTERNAL_MONITOR")
export const ddcDisplayIndex = envNonEmpty("DIY_EXTERNAL_DDC_DISPLAY") || "1"
export const configuredBatteryDevice = envNonEmpty("DIY_BATTERY_DEVICE")

export function scriptPath(name: string): string {
  return `${scriptsDir}/${name}`
}

export function hasScript(name: string): boolean {
  return GLib.file_test(scriptPath(name), GLib.FileTest.IS_EXECUTABLE)
}

export function detectExternalMonitorName(monitors: any[]): string | null {
  if (!Array.isArray(monitors)) return null
  if (configuredExternalMonitor) {
    const match = monitors.find((m) => m.name === configuredExternalMonitor && !m.disabled)
    return match ? match.name : null
  }
  const external = monitors.find((m) => {
    if (!m || m.disabled || typeof m.name !== "string") return false
    if (configuredPrimaryMonitor && m.name === configuredPrimaryMonitor) return false
    return !m.name.startsWith("eDP") && !m.name.startsWith("LVDS")
  })
  return external ? external.name : null
}
