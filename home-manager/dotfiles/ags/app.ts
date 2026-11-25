import app from "ags/gtk4/app"
import { Astal } from "ags/gtk4"
import style from "./style.css"
import QuickSettings from "./widget/QuickSettings"
import AudioMenu from "./widget/AudioMenu"
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
    res(`unknown request: ${argv.join(" ")}`)
  },
  main() {
    const backdrop = Backdrop()
    const quickSettings = QuickSettings()
    const audioMenu = AudioMenu()
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
      backdrop.visible = quickSettings.visible || audioMenu.visible
    }

    // Mutual exclusion & shared backdrop visibility
    app.connect("window-toggled", (_, win) => {
      if (win.name === "quick-settings") {
        if (win.visible && audioMenu.visible) {
          audioMenu.visible = false
        }
        syncBackdrop()
      } else if (win.name === "audio-menu") {
        if (win.visible && quickSettings.visible) {
          quickSettings.visible = false
        }
        syncBackdrop()
      }
    })
  },
})
