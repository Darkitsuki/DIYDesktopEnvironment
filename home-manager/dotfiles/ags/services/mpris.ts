import { createState } from "gnim"
import { execAsync } from "ags/process"

export interface PlayerInfo {
  available: boolean
  status: "Playing" | "Paused" | "Stopped"
  title: string
  artist: string
  artUrl: string
}

const [mprisState, setMprisState] = createState<PlayerInfo>({
  available: false,
  status: "Stopped",
  title: "",
  artist: "",
  artUrl: "",
})

export const mpris = mprisState

export async function updateMpris() {
  try {
    const out = await execAsync([
      "playerctl",
      "metadata",
      "--format",
      "{{status}};;;{{title}};;;{{artist}};;;{{mpris:artUrl}}",
    ])
    const parts = out.trim().split(";;;")
    if (parts.length >= 3 && (parts[0] === "Playing" || parts[0] === "Paused")) {
      setMprisState({
        available: true,
        status: parts[0] as "Playing" | "Paused",
        title: parts[1] || "Unknown Track",
        artist: parts[2] || "Unknown Artist",
        artUrl: parts[3] || "",
      })
      return
    }
    setMprisState((prev) => ({ ...prev, available: false, status: "Stopped" }))
  } catch {
    setMprisState((prev) => ({ ...prev, available: false, status: "Stopped" }))
  }
}

export async function mediaPrevious() {
  try {
    await execAsync(["playerctl", "previous"])
    await updateMpris()
  } catch {}
}

export async function mediaPlayPause() {
  try {
    await execAsync(["playerctl", "play-pause"])
    await updateMpris()
  } catch {}
}

export async function mediaNext() {
  try {
    await execAsync(["playerctl", "next"])
    await updateMpris()
  } catch {}
}

updateMpris()
setInterval(updateMpris, 1500)
