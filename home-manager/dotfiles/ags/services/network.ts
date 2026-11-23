import { createState } from "gnim"
import { execAsync } from "ags/process"

export interface WifiState {
  enabled: boolean
  connected: boolean
  ssid: string
}

export interface BluetoothState {
  enabled: boolean
  connectedDevice: string
}

const [wifiState, setWifiState] = createState<WifiState>({
  enabled: true,
  connected: false,
  ssid: "Disconnected",
})

const [btState, setBtState] = createState<BluetoothState>({
  enabled: false,
  connectedDevice: "Off",
})

const [profileState, setProfileState] = createState<string>("balanced")

export const wifi = wifiState
export const bluetooth = btState
export const powerProfile = profileState

export async function updateWifi() {
  try {
    const devOut = await execAsync(["nmcli", "-t", "-f", "TYPE,STATE,CONNECTION", "device"])
    const lines = devOut.trim().split("\n")
    let foundWifi = false
    let isConnected = false
    let currentSsid = "Disconnected"

    for (const line of lines) {
      const parts = line.split(":")
      if (parts[0] === "wifi") {
        foundWifi = true
        if (parts[1] === "connected") {
          isConnected = true
          currentSsid = parts.slice(2).join(":") || "Connected"
          break
        }
      }
    }

    const radioOut = (await execAsync(["nmcli", "radio", "wifi"])).trim()
    const isEnabled = radioOut === "enabled"

    setWifiState({
      enabled: isEnabled,
      connected: isConnected,
      ssid: isEnabled ? (isConnected ? currentSsid : "Disconnected") : "Disabled",
    })
  } catch {}
}

export async function toggleWifi() {
  try {
    const cur = (await execAsync(["nmcli", "radio", "wifi"])).trim()
    if (cur === "enabled") {
      await execAsync(["nmcli", "radio", "wifi", "off"])
    } else {
      await execAsync(["nmcli", "radio", "wifi", "on"])
    }
    await updateWifi()
  } catch (e) {
    console.error("toggleWifi error:", e)
  }
}

export async function openWifiEditor() {
  try {
    await execAsync(["kitty", "--title", "nmtui", "-e", "nmtui"])
  } catch (e) {
    console.error("openWifiEditor error:", e)
  }
}

export async function updateBluetooth() {
  try {
    const rfOut = await execAsync(["rfkill", "list", "bluetooth"])
    const isBlocked = rfOut.includes("Soft blocked: yes") || rfOut.includes("Hard blocked: yes")
    const isEnabled = !isBlocked

    // Check if bluetoothctl is available
    let deviceName = isEnabled ? "On" : "Off"
    try {
      const btOut = await execAsync(["sh", "-c", "command -v bluetoothctl >/dev/null 2>&1 && bluetoothctl info || true"])
      const nameMatch = btOut.match(/Name:\s+(.+)/)
      if (nameMatch && nameMatch[1]) {
        deviceName = nameMatch[1].trim()
      }
    } catch {}

    setBtState({
      enabled: isEnabled,
      connectedDevice: deviceName,
    })
  } catch {
    setBtState({ enabled: false, connectedDevice: "Off" })
  }
}

export async function toggleBluetooth() {
  try {
    const curEnabled = btState.peek().enabled
    if (curEnabled) {
      await execAsync(["sh", "-c", "command -v bluetoothctl >/dev/null 2>&1 && bluetoothctl power off || rfkill block bluetooth"])
    } else {
      await execAsync(["sh", "-c", "command -v bluetoothctl >/dev/null 2>&1 && bluetoothctl power on || rfkill unblock bluetooth"])
    }
    await updateBluetooth()
  } catch (e) {
    console.error("toggleBluetooth error:", e)
  }
}

export async function openBluetoothManager() {
  try {
    await execAsync(["sh", "-c", "command -v blueman-manager >/dev/null 2>&1 && blueman-manager || notify-send 'Bluetooth' 'blueman-manager not installed'"])
  } catch (e) {
    console.error("openBluetoothManager error:", e)
  }
}

export async function updatePowerProfile() {
  try {
    const out = (await execAsync(["powerprofilesctl", "get"])).trim()
    if (out) setProfileState(out)
  } catch {}
}

export async function cyclePowerProfile() {
  try {
    const cur = profileState.peek()
    const next = cur === "balanced" ? "performance" : cur === "performance" ? "power-saver" : "balanced"
    await execAsync(["powerprofilesctl", "set", next])
    setProfileState(next)
  } catch (e) {
    console.error("cyclePowerProfile error:", e)
  }
}

// Initial fetch & intervals
updateWifi()
updateBluetooth()
updatePowerProfile()

setInterval(updateWifi, 2500)
setInterval(updateBluetooth, 3500)
setInterval(updatePowerProfile, 3000)
