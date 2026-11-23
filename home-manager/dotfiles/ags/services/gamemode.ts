import { createState } from "gnim"
import { execAsync } from "ags/process"
import GLib from "gi://GLib?version=2.0"

const [gamemodeActive, setGamemodeActive] = createState(false)
export const gameMode = gamemodeActive

export function updateGameMode() {
  const active = GLib.file_test("/tmp/hypr-gamemode.active", GLib.FileTest.EXISTS)
  setGamemodeActive(active)
}

export async function toggleGameMode() {
  try {
    await execAsync(["/home/your-username/.local/bin/hypr-gamemode"])
    updateGameMode()
  } catch (e) {
    console.error("toggleGameMode error:", e)
  }
}

updateGameMode()
setInterval(updateGameMode, 1500)
