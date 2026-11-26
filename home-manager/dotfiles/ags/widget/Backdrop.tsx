import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"

function dismissPopups() {
  for (const name of ["quick-settings", "audio-menu", "power-menu"]) {
    const win = app.get_window(name)
    if (win && win.visible) {
      win.visible = false
    }
  }
}

export default function Backdrop() {
  const { TOP, BOTTOM, LEFT, RIGHT } = Astal.WindowAnchor

  const surface = (
    <box
      cssClasses={["backdrop-button"]}
      hexpand
      vexpand
    />
  ) as Gtk.Box

  // Dismiss on outside left-click, middle-click, or right-click without claiming the GTK sequence
  const click = new Gtk.GestureClick()
  click.set_button(0)
  click.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
  click.connect("pressed", () => {
    const btn = click.get_current_button()
    click.set_state(Gtk.EventSequenceState.DENIED)
    if (
      btn === Gdk.BUTTON_PRIMARY ||
      btn === Gdk.BUTTON_MIDDLE ||
      btn === Gdk.BUTTON_SECONDARY
    ) {
      dismissPopups()
    }
  })
  surface.add_controller(click)

  // Dismiss on outside mouse wheel / touchpad scroll without claiming scroll propagation
  const scroll = new Gtk.EventControllerScroll({
    flags: Gtk.EventControllerScrollFlags.BOTH_AXES,
  })
  scroll.connect("scroll", () => {
    dismissPopups()
    return false
  })
  surface.add_controller(scroll)

  return (
    <window
      name="quick-settings-backdrop"
      namespace="quick-settings-backdrop"
      visible={false}
      anchor={TOP | BOTTOM | LEFT | RIGHT}
      keymode={Astal.Keymode.NONE}
      layer={Astal.Layer.TOP}
      exclusivity={Astal.Exclusivity.IGNORE}
      application={app}
      cssClasses={["backdrop-window"]}
    >
      {surface}
    </window>
  )
}
