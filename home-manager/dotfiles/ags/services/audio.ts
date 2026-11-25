import { createState } from "gnim"
import { execAsync, subprocess } from "ags/process"

export interface AudioState {
  volume: number // 0 - 100
  muted: boolean
}

export interface MicState {
  volume: number // 0 - 100
  muted: boolean
  available: boolean
}

export interface AudioDevice {
  name: string
  label: string
  description: string
  icon: string
  isDefault: boolean
  available: boolean
}

interface PactlPort {
  name?: string
  description?: string
  type?: string
  availability?: string
}

interface PactlNode {
  name?: string
  description?: string
  active_port?: string | null
  ports?: PactlPort[]
  monitor_of?: number | string | null
  properties?: Record<string, string | undefined>
}

const [speakerState, setSpeakerState] = createState<AudioState>({ volume: 50, muted: false })
const [micState, setMicState] = createState<MicState>({ volume: 50, muted: false, available: false })
const [sinkDevices, setSinkDevices] = createState<AudioDevice[]>([])
const [sourceDevices, setSourceDevices] = createState<AudioDevice[]>([])

export const speaker = speakerState
export const mic = micState
export const sinks = sinkDevices
export const sources = sourceDevices

function formatDeviceLabel(node: PactlNode, isInput: boolean): string {
  const desc = (node.description || node.name || "Unknown Device").trim()
  const nick = (node.properties?.["node.nick"] || "").trim()
  const activePort = node.ports?.find((p) => p.name === node.active_port)
  const portDesc = (activePort?.description || "").trim()

  let cleaned = desc
    .replace(/^Alder Lake PCH-P High Definition Audio Controller\s*/i, "")
    .replace(/^GA107 High Definition Audio Controller\s*/i, "")
    .replace(/^High Definition Audio Controller\s*/i, "")
    .replace(/\s+Output\s*\(Stereo\)$/i, "")
    .trim()

  if (!isInput && activePort?.type === "HDMI" && nick && !/^HDMI\s*\d*$/i.test(nick)) {
    cleaned = `${nick} (HDMI)`
  } else if (!cleaned && nick) {
    cleaned = nick
  } else if (!cleaned) {
    cleaned = desc
  }

  if (
    portDesc &&
    portDesc.toLowerCase() !== "hdmi / displayport" &&
    !cleaned.toLowerCase().includes(portDesc.toLowerCase()) &&
    !portDesc.toLowerCase().includes(cleaned.toLowerCase())
  ) {
    cleaned = `${cleaned} (${portDesc})`
  }

  return cleaned
}

function getDeviceIcon(node: PactlNode, isInput: boolean): string {
  const name = (node.name || "").toLowerCase()
  const bus = (node.properties?.["device.bus"] || "").toLowerCase()
  const desc = (node.description || "").toLowerCase()
  const activePort = node.ports?.find((p) => p.name === node.active_port)
  const portType = (activePort?.type || "").toLowerCase()

  if (bus === "bluetooth" || name.startsWith("bluez_")) {
    return "󰂯"
  }
  if (isInput) {
    if (portType.includes("headset") || desc.includes("headset")) {
      return "󰋎"
    }
    return "󰍬"
  }
  if (portType === "headphones" || portType === "headset" || /headphone|headset/.test(desc)) {
    return "󰋋"
  }
  if (portType === "hdmi" || /hdmi|displayport/.test(desc)) {
    return "󰍹"
  }
  return "󰓃"
}

function buildTooltip(node: PactlNode, label: string): string {
  const desc = (node.description || node.name || label).trim()
  const activePort = node.ports?.find((p) => p.name === node.active_port)
  if (activePort?.description) {
    const avail = activePort.availability ? ` (${activePort.availability})` : ""
    return `${desc}\nPort: ${activePort.description}${avail}`
  }
  return desc
}

function isMonitorSource(node: PactlNode): boolean {
  if (node.monitor_of !== null && node.monitor_of !== undefined) return true
  if ((node.name || "").endsWith(".monitor")) return true
  if (node.properties?.["device.class"] === "monitor") return true
  return false
}

function isPortAvailable(node: PactlNode): boolean {
  const activePort = node.ports?.find((p) => p.name === node.active_port)
  return activePort?.availability !== "not available"
}

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

export async function refreshAudioDevices() {
  try {
    const [sinksRaw, sourcesRaw, defaultSinkRaw, defaultSourceRaw] = await Promise.all([
      execAsync(["pactl", "-f", "json", "list", "sinks"]),
      execAsync(["pactl", "-f", "json", "list", "sources"]),
      execAsync(["pactl", "get-default-sink"]).catch(() => ""),
      execAsync(["pactl", "get-default-source"]).catch(() => ""),
    ])

    const defaultSink = defaultSinkRaw.trim()
    const defaultSource = defaultSourceRaw.trim()

    const parsedSinks = JSON.parse(sinksRaw) as PactlNode[]
    const mappedSinks: AudioDevice[] = parsedSinks
      .filter((s): s is PactlNode & { name: string } => typeof s.name === "string" && s.name.length > 0)
      .map((s) => {
        const label = formatDeviceLabel(s, false)
        return {
          name: s.name,
          label,
          description: buildTooltip(s, label),
          icon: getDeviceIcon(s, false),
          isDefault: s.name === defaultSink,
          available: isPortAvailable(s),
        }
      })
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || Number(b.available) - Number(a.available))
    setSinkDevices(mappedSinks)

    const parsedSources = JSON.parse(sourcesRaw) as PactlNode[]
    const mappedSources: AudioDevice[] = parsedSources
      .filter(
        (s): s is PactlNode & { name: string } =>
          typeof s.name === "string" && s.name.length > 0 && !isMonitorSource(s),
      )
      .map((s) => {
        const label = formatDeviceLabel(s, true)
        return {
          name: s.name,
          label,
          description: buildTooltip(s, label),
          icon: getDeviceIcon(s, true),
          isDefault: s.name === defaultSource,
          available: isPortAvailable(s),
        }
      })
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || Number(b.available) - Number(a.available))
    setSourceDevices(mappedSources)
  } catch (e) {
    console.error("Failed to refresh audio devices:", e)
  }
}

export async function setDefaultSink(name: string) {
  try {
    await execAsync(["pactl", "set-default-sink", name])
    await Promise.all([refreshAudioDevices(), updateSpeaker()])
  } catch (e) {
    console.error("Failed to set default sink:", e)
  }
}

export async function setDefaultSource(name: string) {
  try {
    await execAsync(["pactl", "set-default-source", name])
    await Promise.all([refreshAudioDevices(), updateMic()])
  } catch (e) {
    console.error("Failed to set default source:", e)
  }
}

// Subscribe to PipeWire/PulseAudio device & volume changes
let audioRefreshPending = false
function scheduleAudioRefresh() {
  if (audioRefreshPending) return
  audioRefreshPending = true
  setTimeout(() => {
    audioRefreshPending = false
    updateSpeaker()
    updateMic()
    refreshAudioDevices()
  }, 100)
}

function startPactlAudioMonitor() {
  try {
    const proc = subprocess(
      ["pactl", "subscribe"],
      (line) => {
        if (/on (sink|source|card|server)\b/.test(line)) {
          scheduleAudioRefresh()
        }
      },
      () => {},
    )
    proc.connect("exit", () => {
      setTimeout(startPactlAudioMonitor, 2000)
    })
  } catch (e) {
    console.error("Audio service pactl subscribe error:", e)
  }
}

// Initial fetch
updateSpeaker()
updateMic()
refreshAudioDevices()
startPactlAudioMonitor()

setInterval(() => {
  updateSpeaker()
  updateMic()
}, 2000)
