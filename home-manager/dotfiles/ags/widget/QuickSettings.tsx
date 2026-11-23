import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import Header from "./Header"
import QuickToggles from "./QuickToggles"
import Sliders from "./Sliders"
import MediaCard from "./MediaCard"

export default function QuickSettings() {
  const win = (
    <window
      name="quick-settings"
      namespace="quick-settings"
      visible={false}
      anchor={Astal.WindowAnchor.TOP | Astal.WindowAnchor.RIGHT}
      marginTop={8}
      marginRight={12}
      keymode={Astal.Keymode.ON_DEMAND}
      layer={Astal.Layer.TOP}
      exclusivity={Astal.Exclusivity.NORMAL}
      application={app}
      cssClasses={["quick-settings-window"]}
    >
      <box
        orientation={Gtk.Orientation.VERTICAL}
        spacing={12}
        cssClasses={["quicksettings-panel"]}
        widthRequest={380}
      >
        {/* Header Bar */}
        <Header />

        {/* 2x3 Quick Toggles Grid */}
        <QuickToggles />

        {/* Sliders Section */}
        <Sliders />

        {/* MPRIS Media Card (dynamic) */}
        <MediaCard />
      </box>
    </window>
  ) as Astal.Window

  // Intercept Escape key to hide the window
  const keyController = new Gtk.EventControllerKey()
  keyController.connect("key-pressed", (_ctrl, keyval) => {
    if (keyval === Gdk.KEY_Escape) {
      win.visible = false
      return true
    }
    return false
  })
  win.add_controller(keyController)

  return win
}
