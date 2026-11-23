import app from "ags/gtk4/app"
import { Astal } from "ags/gtk4"
import style from "./style.css"
import QuickSettings from "./widget/QuickSettings"
import Backdrop from "./widget/Backdrop"

app.start({
  css: style,
  main() {
    const backdrop = Backdrop()
    const quickSettings = QuickSettings()

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

