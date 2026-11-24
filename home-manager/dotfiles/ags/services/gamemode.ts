import { createState } from "gnim"
import { execAsync } from "ags/process"
import GLib from "gi://GLib?version=2.0"
import { hasScript, scriptPath } from "./config"

const [gamemodeActive, setGamemodeActive] = createState(false)
export const gameMode = gamemodeActive
export const gameModeAvailable = () => hasScript("hypr-gamemode")

export function updateGameMode() {
  const active = GLib.file_test("/tmp/hypr-gamemode.active", GLib.FileTest.EXISTS)
  setGamemodeActive(active)
}

export async function toggleGameMode() {
  const bin = scriptPath("hypr-gamemode")
  if (!hasScript("hypr-gamemode")) {
    try {
      await execAsync(["notify-send", "-u", "low", "Game Mode", `Optional script not installed: ${bin}`])
    } catch {}
    return
  }
  try {
    await execAsync([bin])
    updateGameMode()
  } catch (e) {
    console.error("toggleGameMode error:", e)
  }
}

updateGameMode()
setInterval(updateGameMode, 1500)
