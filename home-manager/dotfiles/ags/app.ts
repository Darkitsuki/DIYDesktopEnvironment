import app from "ags/gtk4/app"
import { Astal } from "ags/gtk4"
import style from "./style.css"
import QuickSettings from "./widget/QuickSettings"
import AudioMenu from "./widget/AudioMenu"
import PowerMenu from "./widget/PowerMenu"
import Backdrop from "./widget/Backdrop"
import OSD from "./widget/OSD"
import { refreshAllAudio } from "./services/audio"

app.start({
  css: style,
  requestHandler(argv, res) {
    const [cmd] = argv
    if (cmd === "audio") {
      const am = app.get_window("audio-menu")
      if (am) {
        am.visible = true
      }
      refreshAllAudio()
      res("ok")
      return
    }
    if (cmd === "power") {
      app.toggle_window("power-menu")
      res("ok")
      return
    }
    res(`unknown request: ${argv.join(" ")}`)
  },
  main() {
    const backdrop = Backdrop()
    const quickSettings = QuickSettings()
    const audioMenu = AudioMenu()
    const powerMenu = PowerMenu()
    OSD()

    // Alias window to support "quicksettings" without hyphen
    const alias = new Astal.Window({
      name: "quicksettings",
      visible: false,
      application: app,
    })

    alias.connect("notify::visible", () => {
      if (alias.visible) {
        alias.visible = false
        app.toggle_window("quick-settings")
      }
    })

    const syncBackdrop = () => {
      backdrop.visible = quickSettings.visible || audioMenu.visible || powerMenu.visible
    }

    // Mutual exclusion & shared backdrop visibility (handles both toggle and Esc/close)
    const bindPopup = (target: Astal.Window, others: Astal.Window[]) => {
      target.connect("notify::visible", () => {
        if (target.visible) {
          for (const other of others) {
            if (other.visible) other.visible = false
          }
        }
        syncBackdrop()
      })
    }

    bindPopup(quickSettings, [audioMenu, powerMenu])
    bindPopup(audioMenu, [quickSettings, powerMenu])
    bindPopup(powerMenu, [quickSettings, audioMenu])
  },
})
