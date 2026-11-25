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

export interface SinkInput {
  index: number
  appName: string
  mediaName: string
  iconName: string
  volume: number // 0 - 100
  mute: boolean
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

interface PactlVolumeChannel {
  value_percent?: string
}

interface PactlSinkInput {
  index?: number
  mute?: boolean
  volume?: Record<string, PactlVolumeChannel>
  properties?: Record<string, string | undefined>
}

const [speakerState, setSpeakerState] = createState<AudioState>({ volume: 50, muted: false })
const [micState, setMicState] = createState<MicState>({ volume: 50, muted: false, available: false })
const [sinkDevices, setSinkDevices] = createState<AudioDevice[]>([])
const [sourceDevices, setSourceDevices] = createState<AudioDevice[]>([])
const [streamList, setStreamList] = createState<SinkInput[]>([])

export const speaker = speakerState
export const mic = micState
export const sinks = sinkDevices
export const sources = sourceDevices
export const sinkInputs = streamList

function getHardwareDeviceName(node: PactlNode): string {
  const props = node.properties || {}
  const devDesc = (props["device.description"] || "").trim()
  const cardName = (props["alsa.card_name"] || "").trim()
  const product = (props["device.product.name"] || "").trim()
  const alias = (props["device.alias"] || "").trim()
  const nick = (props["node.nick"] || "").trim()
  const bus = (props["device.bus"] || "").toLowerCase()

  if (bus === "bluetooth" || (node.name || "").startsWith("bluez_")) {
    return devDesc || alias || product || nick || "Bluetooth Audio"
  }

  if (cardName === "sof-hda-dsp" || /alder lake|sof-hda-dsp/i.test(devDesc)) {
    return "Built-in Audio"
  }

  if (cardName === "HDA NVidia" || /GA107|NVIDIA/i.test(devDesc)) {
    return nick && !/^HDMI/i.test(nick) ? nick : "NVIDIA HDMI"
  }

  return devDesc || product || cardName || nick || ""
}

function getActivePort(node: PactlNode): PactlPort | undefined {
  return node.ports?.find((p) => p.name === node.active_port)
}

function hasOnlyUnavailablePorts(node: PactlNode): boolean {
  const ports = node.ports
  if (!ports || ports.length === 0) return false
  return ports.every((p) => p.availability === "not available")
}

function isMonitorSource(node: PactlNode): boolean {
  if (node.monitor_of !== null && node.monitor_of !== undefined) return true
  if ((node.name || "").endsWith(".monitor")) return true
  if (node.properties?.["device.class"] === "monitor") return true
  return false
}

function formatSinkLabel(node: PactlNode): { label: string; dedupKey: string } {
  const activePort = getActivePort(node)
  const portTitle = (activePort?.description || "").trim()
  const hwName = getHardwareDeviceName(node)
  const rawDesc = (node.description || node.name || "Unknown Output").trim()
  const nick = (node.properties?.["node.nick"] || "").trim()

  let primary = portTitle || rawDesc
  if (activePort?.type === "HDMI" && nick && !/^HDMI\s*\d*$/i.test(nick)) {
    primary = `${nick} (HDMI)`
  } else if (!portTitle) {
    primary = rawDesc
      .replace(/^Alder Lake PCH-P High Definition Audio Controller\s*/i, "")
      .replace(/^GA107 High Definition Audio Controller\s*/i, "")
      .replace(/^High Definition Audio Controller\s*/i, "")
      .trim() || rawDesc
  }

  let label = primary
  if (
    hwName &&
    !primary.toLowerCase().includes(hwName.toLowerCase()) &&
    !hwName.toLowerCase().includes(primary.toLowerCase())
  ) {
    label = `${primary} · ${hwName}`
  }

  const dedupKey = `${primary}|${hwName || rawDesc}`.toLowerCase().replace(/\s+/g, " ").trim()
  return { label, dedupKey }
}

function formatSourceLabel(node: PactlNode): { label: string; dedupKey: string } {
  const activePort = getActivePort(node)
  const portTitle = (activePort?.description || "").trim()
  const hwName = getHardwareDeviceName(node)
  const rawDesc = (node.description || node.name || "Unknown Microphone").trim()

  let primary = portTitle
  if (!primary) {
    primary = rawDesc
      .replace(/^Alder Lake PCH-P High Definition Audio Controller\s*/i, "")
      .replace(/^High Definition Audio Controller\s*/i, "")
      .trim() || rawDesc
  }

  let label = primary
  if (
    hwName &&
    !primary.toLowerCase().includes(hwName.toLowerCase()) &&
    !hwName.toLowerCase().includes(primary.toLowerCase())
  ) {
    label = `${primary} · ${hwName}`
  } else if (!hwName && rawDesc && rawDesc !== primary) {
    label = `${primary} · ${rawDesc}`
  }

  const dedupKey = `${primary}|${hwName || rawDesc}`.toLowerCase().replace(/\s+/g, " ").trim()
  return { label, dedupKey }
}

function getDeviceIcon(node: PactlNode, isInput: boolean): string {
  const name = (node.name || "").toLowerCase()
  const bus = (node.properties?.["device.bus"] || "").toLowerCase()
  const desc = (node.description || "").toLowerCase()
  const activePort = getActivePort(node)
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
  const activePort = getActivePort(node)
  if (activePort?.description) {
    const avail = activePort.availability ? ` (${activePort.availability})` : ""
    return `${desc}\nPort: ${activePort.description}${avail}`
  }
  return desc
}

function deduplicateDevices(items: Array<AudioDevice & { dedupKey: string }>): AudioDevice[] {
  const map = new Map<string, AudioDevice>()
  for (const item of items) {
    const existing = map.get(item.dedupKey)
    if (!existing || (item.isDefault && !existing.isDefault) || (item.available && !existing.available && !existing.isDefault)) {
      const { dedupKey: _key, ...clean } = item
      map.set(item.dedupKey, clean)
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => Number(b.isDefault) - Number(a.isDefault) || Number(b.available) - Number(a.available),
  )
}

function parseAverageVolumePercent(volumeMap?: Record<string, PactlVolumeChannel>): number {
  if (!volumeMap) return 100
  const percentages: number[] = []
  for (const ch of Object.values(volumeMap)) {
    const raw = ch?.value_percent
    if (typeof raw === "string") {
      const parsed = parseInt(raw.replace("%", ""), 10)
      if (!isNaN(parsed)) {
        percentages.push(parsed)
      }
    }
  }
  if (percentages.length === 0) return 100
  const avg = percentages.reduce((acc, v) => acc + v, 0) / percentages.length
  return Math.max(0, Math.min(100, Math.round(avg)))
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
    const candidateSinks = parsedSinks
      .filter((s): s is PactlNode & { name: string } => {
        if (typeof s.name !== "string" || !s.name) return false
        const isDefault = s.name === defaultSink
        return isDefault || !hasOnlyUnavailablePorts(s)
      })
      .map((s) => {
        const { label, dedupKey } = formatSinkLabel(s)
        return {
          name: s.name,
          label,
          description: buildTooltip(s, label),
          icon: getDeviceIcon(s, false),
          isDefault: s.name === defaultSink,
          available: !hasOnlyUnavailablePorts(s),
          dedupKey,
        }
      })
    setSinkDevices(deduplicateDevices(candidateSinks))

    const parsedSources = JSON.parse(sourcesRaw) as PactlNode[]
    const candidateSources = parsedSources
      .filter((s): s is PactlNode & { name: string } => {
        if (typeof s.name !== "string" || !s.name || isMonitorSource(s)) return false
        const isDefault = s.name === defaultSource
        return isDefault || !hasOnlyUnavailablePorts(s)
      })
      .map((s) => {
        const { label, dedupKey } = formatSourceLabel(s)
        return {
          name: s.name,
          label,
          description: buildTooltip(s, label),
          icon: getDeviceIcon(s, true),
          isDefault: s.name === defaultSource,
          available: !hasOnlyUnavailablePorts(s),
          dedupKey,
        }
      })
    setSourceDevices(deduplicateDevices(candidateSources))
  } catch (e) {
    console.error("Failed to refresh audio devices:", e)
  }
}

export async function refreshSinkInputs() {
  try {
    const raw = await execAsync(["pactl", "-f", "json", "list", "sink-inputs"])
    const parsed = JSON.parse(raw) as PactlSinkInput[]
    const mapped: SinkInput[] = parsed
      .filter((item): item is PactlSinkInput & { index: number } => typeof item.index === "number")
      .map((item) => {
        const props = item.properties || {}
        const appName = (
          props["application.name"] ||
          props["node.name"] ||
          `Stream #${item.index}`
        ).trim()
        const rawMedia = (props["media.name"] || "").trim()
        const mediaName =
          rawMedia && rawMedia.toLowerCase() !== appName.toLowerCase() ? rawMedia : ""
        const iconName = (props["application.icon_name"] || "").trim()
        return {
          index: item.index,
          appName,
          mediaName,
          iconName,
          volume: parseAverageVolumePercent(item.volume),
          mute: Boolean(item.mute),
        }
      })
    setStreamList(mapped)
  } catch (e) {
    console.error("Failed to refresh sink-inputs:", e)
  }
}

export async function refreshAllAudio() {
  await Promise.all([
    updateSpeaker(),
    updateMic(),
    refreshAudioDevices(),
    refreshSinkInputs(),
  ])
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

export async function setSinkInputVolume(index: number, vol: number) {
  const clamped = Math.max(0, Math.min(100, Math.round(vol)))
  setStreamList((prev) =>
    prev.map((s) => (s.index === index ? { ...s, volume: clamped } : s)),
  )
  try {
    await execAsync(["pactl", "set-sink-input-volume", String(index), `${clamped}%`])
  } catch {}
}

export async function toggleSinkInputMute(index: number) {
  try {
    await execAsync(["pactl", "set-sink-input-mute", String(index), "toggle"])
    await refreshSinkInputs()
  } catch {}
}

// Subscribe to PipeWire/PulseAudio device, stream & volume changes
let audioRefreshPending = false
function scheduleAudioRefresh() {
  if (audioRefreshPending) return
  audioRefreshPending = true
  setTimeout(() => {
    audioRefreshPending = false
    refreshAllAudio()
  }, 80)
}

function startPactlAudioMonitor() {
  try {
    const proc = subprocess(
      ["pactl", "subscribe"],
      (line) => {
        if (/on (sink|source|sink-input|card|server)\b/.test(line)) {
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
refreshAllAudio()
startPactlAudioMonitor()

setInterval(() => {
  updateSpeaker()
  updateMic()
}, 2000)
