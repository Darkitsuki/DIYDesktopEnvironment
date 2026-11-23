import { createState } from "gnim"
import { execAsync } from "ags/process"

export interface HdrStatus {
  active: boolean
  disconnected: boolean
  text: string
  tooltip: string
}

const [hdrState, setHdrState] = createState<HdrStatus>({
  active: false,
  disconnected: false,
  text: "SDR",
  tooltip: "HDMI-A-2: SDR Mode",
})

export const hdr = hdrState

export async function updateHdr() {
  try {
    const out = await execAsync(["/home/your-username/.local/bin/hypr-hdr-toggle", "--status"])
    const data = JSON.parse(out)
    // {"text": " SDR", "class": "off", "tooltip": "..."}
    const isDisconnected = data.class === "disconnected"
    const isActive = data.class === "on"
    setHdrState({
      active: isActive,
      disconnected: isDisconnected,
      text: isActive ? "HDR" : "SDR",
      tooltip: data.tooltip || "",
    })
  } catch {
    setHdrState({
      active: false,
      disconnected: true,
      text: "N/A",
      tooltip: "HDMI-A-2 Disconnected",
    })
  }
}

export async function toggleHdr() {
  try {
    await execAsync(["/home/your-username/.local/bin/hypr-hdr-toggle", "--toggle"])
    await updateHdr()
  } catch (e) {
    console.error("toggleHdr error:", e)
  }
}

updateHdr()
setInterval(updateHdr, 3000)
