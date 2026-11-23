import app from "ags/gtk4/app"
import { Astal, Gtk } from "ags/gtk4"

export default function Backdrop() {
  const { TOP, BOTTOM, LEFT, RIGHT } = Astal.WindowAnchor

  return (
    <window
      name="quick-settings-backdrop"
      namespace="quick-settings-backdrop"
      visible={false}
      anchor={TOP | BOTTOM | LEFT | RIGHT}
      layer={Astal.Layer.TOP}
      exclusivity={Astal.Exclusivity.IGNORE}
      application={app}
      cssClasses={["backdrop-window"]}
    >
      <button
        cssClasses={["backdrop-button"]}
        hexpand
        vexpand
        onClicked={() => {
          const qs = app.get_window("quick-settings")
          if (qs) {
            qs.visible = false
          }
        }}
      />
    </window>
  )
}
