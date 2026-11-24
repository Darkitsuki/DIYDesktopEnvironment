import app from "ags/gtk4/app"
import { Gtk } from "ags/gtk4"
import { Accessor, createState } from "gnim"
import {
  wifi,
  toggleWifi,
  openWifiEditor,
  bluetooth,
  toggleBluetooth,
  openBluetoothManager,
  powerProfile,
  cyclePowerProfile,
} from "../services/network"
import { gameMode, toggleGameMode } from "../services/gamemode"
import { hdr, toggleHdr } from "../services/hdr"
import {
  dnd,
  toggleDnd,
  keepAwake,
  toggleKeepAwake,
  lockScreen,
} from "../services/system"

interface ToggleProps {
  icon: Accessor<string> | string
  title: Accessor<string> | string
  subtitle: Accessor<string> | string
  active?: Accessor<boolean> | boolean
  onPrimaryClick: () => void
  onSecondaryClick?: () => void
}

function ToggleCard({
  icon,
  title,
  subtitle,
  active = false,
  onPrimaryClick,
  onSecondaryClick,
}: ToggleProps) {
  const activeAcc = typeof active === "boolean" ? createState(active)[0] : active
  const box = (
    <box
      cssClasses={activeAcc.as((act) => ["toggle-card", act ? "active" : "inactive"])}
      spacing={10}
      hexpand
    >
      <label
        label={icon}
        cssClasses={activeAcc.as((act) => ["toggle-icon", act ? "active" : ""])}
      />
      <box orientation={Gtk.Orientation.VERTICAL} valign={Gtk.Align.CENTER} hexpand>
        <label
          label={title}
          cssClasses={["toggle-title"]}
          halign={Gtk.Align.START}
          ellipsize={3}
          maxWidthChars={13}
        />
        <label
          label={subtitle}
          cssClasses={["toggle-subtitle"]}
          halign={Gtk.Align.START}
        />
      </box>
    </box>
  ) as Gtk.Box

  const click = new Gtk.GestureClick()
  click.set_button(0)
  click.connect("released", () => {
    const btn = click.get_current_button()
    if (btn === 1) {
      onPrimaryClick()
    } else if (btn === 3 && onSecondaryClick) {
      onSecondaryClick()
    }
  })
  box.add_controller(click)

  return box
}

export default function QuickToggles() {
  return (
    <box orientation={Gtk.Orientation.VERTICAL} spacing={8} cssClasses={["quick-toggles-grid"]}>
      {/* Row 1: Wi-Fi & Bluetooth */}
      <box spacing={8} hexpand>
        <ToggleCard
          icon={wifi.as((w) => (w.connected ? "󰤨" : w.enabled ? "󰤩" : "󰤭"))}
          title={wifi.as((w) => w.ssid)}
          subtitle="Wi-Fi"
          active={wifi.as((w) => w.connected)}
          onPrimaryClick={toggleWifi}
          onSecondaryClick={openWifiEditor}
        />
        <ToggleCard
          icon={bluetooth.as((b) => (b.enabled ? "󰂯" : "󰂲"))}
          title={bluetooth.as((b) => b.connectedDevice)}
          subtitle="Bluetooth"
          active={bluetooth.as((b) => b.enabled)}
          onPrimaryClick={toggleBluetooth}
          onSecondaryClick={openBluetoothManager}
        />
      </box>

      {/* Row 2: Power Profile & Game Mode */}
      <box spacing={8} hexpand>
        <ToggleCard
          icon={powerProfile.as((p) =>
            p === "performance" ? "" : p === "balanced" ? "" : "",
          )}
          title={powerProfile.as((p) =>
            p === "performance"
              ? "Performance"
              : p === "balanced"
              ? "Balanced"
              : "Power Saver",
          )}
          subtitle="Power Profile"
          active={powerProfile.as((p) => p === "performance" || p === "balanced")}
          onPrimaryClick={cyclePowerProfile}
        />
        <ToggleCard
          icon="󰊴"
          title="Game Mode"
          subtitle={gameMode.as((g) => (g ? "Active" : "Disabled"))}
          active={gameMode}
          onPrimaryClick={toggleGameMode}
        />
      </box>

      {/* Row 3: HDR (External Display) & Notifications (DND) */}
      <box spacing={8} hexpand>
        <ToggleCard
          icon="󰹑"
          title={hdr.as((h) =>
            h.disconnected ? "No Display" : h.active ? "HDR (10-bit)" : "SDR (8-bit)",
          )}
          subtitle={hdr.as((h) => h.subtitle)}
          active={hdr.as((h) => h.active)}
          onPrimaryClick={toggleHdr}
        />
        <ToggleCard
          icon={dnd.as((d) => (d ? "󰂛" : "󰂚"))}
          title="Do Not Disturb"
          subtitle={dnd.as((d) => (d ? "Active" : "Off"))}
          active={dnd}
          onPrimaryClick={toggleDnd}
        />
      </box>

      {/* Row 4: Keep Awake (hypridle) & Lock Screen (hyprlock) */}
      <box spacing={8} hexpand>
        <ToggleCard
          icon={keepAwake.as((k) => (k ? "󰅶" : "󰾪"))}
          title="Keep Awake"
          subtitle={keepAwake.as((k) => (k ? "hypridle paused" : "Auto-lock 5m"))}
          active={keepAwake}
          onPrimaryClick={toggleKeepAwake}
        />
        <ToggleCard
          icon="󰌾"
          title="Lock Screen"
          subtitle="hyprlock"
          active={false}
          onPrimaryClick={() => {
            const qs = app.get_window("quick-settings")
            if (qs) {
              qs.visible = false
            }
            lockScreen()
          }}
        />
      </box>
    </box>
  )
}
