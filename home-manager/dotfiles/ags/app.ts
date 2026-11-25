import app from "ags/gtk4/app"
import { Astal } from "ags/gtk4"
import style from "./style.css"
import QuickSettings from "./widget/QuickSettings"
import Backdrop from "./widget/Backdrop"
import OSD from "./widget/OSD"
import { expandAudioDrawers } from "./widget/AudioDeviceMenu"
import { updateMic, updateSpeaker } from "./services/audio"

app.start({
  css: style,
  requestHandler(argv, res) {
    const [cmd, sub] = argv
    if (cmd === "audio") {
      const target = sub === "input" || sub === "all" ? sub : "output"
      const qs = app.get_window("quick-settings")
      if (qs) {
        qs.visible = true
      }
      expandAudioDrawers(target)
      updateSpeaker()
      updateMic()
      res("ok")
      return
    }
    res(`unknown request: ${argv.join(" ")}`)
  },
  main() {
    const backdrop = Backdrop()
    const quickSettings = QuickSettings()
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

    // Sync backdrop visibility with quick-settings popup
    app.connect("window-toggled", (_, win) => {
      if (win.name === "quick-settings") {
        backdrop.visible = win.visible
      }
    })
  },
})

