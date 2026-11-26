import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { POWER_ACTIONS, runPowerAction } from "../services/system"

export default function PowerMenu() {
  const win = (
    <window
      name="power-menu"
      namespace="power-menu"
      visible={false}
      anchor={Astal.WindowAnchor.TOP | Astal.WindowAnchor.RIGHT}
      marginTop={8}
      marginRight={12}
      keymode={Astal.Keymode.ON_DEMAND}
      layer={Astal.Layer.TOP}
      exclusivity={Astal.Exclusivity.NORMAL}
      resizable={false}
      application={app}
      cssClasses={["power-menu-window"]}
    >
      <box
        orientation={Gtk.Orientation.VERTICAL}
        spacing={3}
        cssClasses={["powermenu-panel"]}
        widthRequest={168}
      >
        {POWER_ACTIONS.map((item) => (
          <button
            cssClasses={["powermenu-item", ...(item.danger ? ["danger"] : [])]}
            onClicked={() => runPowerAction(item.command)}
          >
            <box spacing={9} halign={Gtk.Align.START} valign={Gtk.Align.CENTER}>
              <label label={item.icon} cssClasses={["powermenu-item-icon"]} />
              <label label={item.label} cssClasses={["powermenu-item-label"]} />
            </box>
          </button>
        ))}
      </box>
    </window>
  ) as Astal.Window

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
