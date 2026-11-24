import { createState } from "gnim"
import { execAsync } from "ags/process"
import { ddcDisplayIndex, detectExternalMonitorName } from "./config"

const [internalBright, setInternalBright] = createState(30)
const [externalBright, setExternalBright] = createState(100)
const [hasExternal, setHasExternal] = createState(false)
const [externalName, setExternalName] = createState("External Display")

export const laptopBrightness = internalBright
export const externalBrightness = externalBright
export const externalDisplayConnected = hasExternal
export const externalDisplayName = externalName

export async function updateInternalBrightness() {
  try {
    const out = await execAsync(["brightnessctl", "-m"])
    // intel_backlight,backlight,28801,30%,96000
    const parts = out.trim().split(",")
    if (parts.length >= 4) {
      const val = parseInt(parts[3].replace("%", ""), 10)
      if (!isNaN(val)) {
        setInternalBright(val)
      }
    }
  } catch {}
}

export async function setInternalBrightness(val: number) {
  const clamped = Math.max(1, Math.min(100, Math.round(val)))
  setInternalBright(clamped)
  try {
    await execAsync(["brightnessctl", "set", `${clamped}%`])
  } catch {}
}

export async function checkMonitors() {
  try {
    const out = await execAsync(["hyprctl", "monitors", "-j"])
    const monitors = JSON.parse(out)
    const ext = detectExternalMonitorName(monitors)
    if (ext) {
      setExternalName(ext)
      setHasExternal(true)
      return true
    }
    setHasExternal(false)
    return false
  } catch {
    setHasExternal(false)
    return false
  }
}

export async function updateExternalBrightness() {
  const connected = await checkMonitors()
  if (!connected) return

  try {
    const out = await execAsync(["ddcutil", "--display", ddcDisplayIndex, "getvcp", "10"])
    // VCP code 0x10 (Brightness                    ): current value =   100, max value =   100
    const match = out.match(/current value\s*=\s*(\d+)/)
    if (match) {
      const val = parseInt(match[1], 10)
      if (!isNaN(val)) {
        setExternalBright(val)
      }
    }
  } catch {}
}

// Debounced DDC/CI setter (150ms)
let ddcTimer: any = null
export function setExternalBrightnessDebounced(val: number) {
  const clamped = Math.max(0, Math.min(100, Math.round(val)))
  setExternalBright(clamped)

  if (ddcTimer) {
    clearTimeout(ddcTimer)
  }
  ddcTimer = setTimeout(async () => {
    try {
      await execAsync(["ddcutil", "--display", ddcDisplayIndex, "setvcp", "10", clamped.toString()])
    } catch (e) {
      console.error("ddcutil set error:", e)
    }
  }, 150)
}

// Initial fetch
updateInternalBrightness()
checkMonitors().then((connected) => {
  if (connected) updateExternalBrightness()
})

setInterval(() => {
  updateInternalBrightness()
}, 3000)

// Check external monitors periodically (every 10s)
setInterval(() => {
  checkMonitors().then((connected) => {
    if (connected) updateExternalBrightness()
  })
}, 10000)
