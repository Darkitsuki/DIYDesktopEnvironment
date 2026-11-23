import { createState } from "gnim"
import { execAsync } from "ags/process"

export interface AudioState {
  volume: number // 0 - 100
  muted: boolean
}

export interface MicState {
  volume: number // 0 - 100
  muted: boolean
  available: boolean
}

const [speakerState, setSpeakerState] = createState<AudioState>({ volume: 50, muted: false })
const [micState, setMicState] = createState<MicState>({ volume: 50, muted: false, available: false })

export const speaker = speakerState
export const mic = micState

export async function updateSpeaker() {
  try {
    const out = await execAsync(["wpctl", "get-volume", "@DEFAULT_AUDIO_SINK@"])
    // Format: "Volume: 0.45" or "Volume: 0.45 [MUTED]"
    const match = out.match(/Volume:\s+([0-9.]+)(?:\s+\[MUTED\])?/)
    if (match) {
      const vol = Math.min(100, Math.round(parseFloat(match[1]) * 100))
      const muted = out.includes("[MUTED]")
      setSpeakerState({ volume: vol, muted })
    }
  } catch {}
}

export async function setSpeakerVolume(vol: number) {
  const clamped = Math.max(0, Math.min(100, Math.round(vol)))
  setSpeakerState((prev) => ({ ...prev, volume: clamped }))
  try {
    await execAsync(["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", `${clamped}%`])
  } catch {}
}

export async function toggleSpeakerMute() {
  try {
    await execAsync(["wpctl", "set-mute", "@DEFAULT_AUDIO_SINK@", "toggle"])
    await updateSpeaker()
  } catch {}
}

export async function updateMic() {
  try {
    const out = await execAsync(["wpctl", "get-volume", "@DEFAULT_AUDIO_SOURCE@"])
    const match = out.match(/Volume:\s+([0-9.]+)(?:\s+\[MUTED\])?/)
    if (match) {
      const vol = Math.min(100, Math.round(parseFloat(match[1]) * 100))
      const muted = out.includes("[MUTED]")
      setMicState({ volume: vol, muted, available: true })
    } else {
      setMicState((prev) => ({ ...prev, available: false }))
    }
  } catch {
    setMicState((prev) => ({ ...prev, available: false }))
  }
}

export async function setMicVolume(vol: number) {
  const clamped = Math.max(0, Math.min(100, Math.round(vol)))
  setMicState((prev) => ({ ...prev, volume: clamped }))
  try {
    await execAsync(["wpctl", "set-volume", "@DEFAULT_AUDIO_SOURCE@", `${clamped}%`])
  } catch {}
}

export async function toggleMicMute() {
  try {
    await execAsync(["wpctl", "set-mute", "@DEFAULT_AUDIO_SOURCE@", "toggle"])
    await updateMic()
  } catch {}
}

// Initial fetch
updateSpeaker()
updateMic()
setInterval(() => {
  updateSpeaker()
  updateMic()
}, 2000)
