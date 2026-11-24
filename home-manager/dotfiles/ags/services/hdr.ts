import { createState } from "gnim"
import { execAsync } from "ags/process"
import { configuredExternalMonitor, hasScript, scriptPath } from "./config"

export interface HdrStatus {
  active: boolean
  disconnected: boolean
  text: string
  subtitle: string
  tooltip: string
}

const defaultLabel = configuredExternalMonitor || "External Display"

const [hdrState, setHdrState] = createState<HdrStatus>({
  active: false,
  disconnected: true,
  text: "N/A",
  subtitle: defaultLabel,
  tooltip: "HDR control unavailable",
})

export const hdr = hdrState

export async function updateHdr() {
  if (!hasScript("hypr-hdr-toggle")) {
    setHdrState({
      active: false,
      disconnected: true,
      text: "N/A",
      subtitle: defaultLabel,
      tooltip: "Optional script hypr-hdr-toggle not installed",
    })
    return
  }

  try {
    const out = await execAsync([scriptPath("hypr-hdr-toggle"), "--status"])
    const data = JSON.parse(out)
    // {"text": " SDR", "class": "off", "tooltip": "..."}
    const isDisconnected = data.class === "disconnected"
    const isActive = data.class === "on"
    setHdrState({
      active: isActive,
      disconnected: isDisconnected,
      text: isActive ? "HDR" : isDisconnected ? "N/A" : "SDR",
      subtitle: defaultLabel,
      tooltip: data.tooltip || "",
    })
  } catch {
    setHdrState({
      active: false,
      disconnected: true,
      text: "N/A",
      subtitle: defaultLabel,
      tooltip: `${defaultLabel}: Unavailable`,
    })
  }
}

export async function toggleHdr() {
  const bin = scriptPath("hypr-hdr-toggle")
  if (!hasScript("hypr-hdr-toggle")) {
    try {
      await execAsync(["notify-send", "-u", "low", "HDR", `Optional script not installed: ${bin}`])
    } catch {}
    return
  }
  try {
    await execAsync([bin, "--toggle"])
    await updateHdr()
  } catch (e) {
    console.error("toggleHdr error:", e)
  }
}

updateHdr()
setInterval(updateHdr, 3000)
