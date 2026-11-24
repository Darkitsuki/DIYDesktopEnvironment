import { Gtk } from "ags/gtk4"
import { createState } from "gnim"
import { execAsync } from "ags/process"
import {
  getBatteryInfo,
  getUptime,
  takeScreenshot,
  openPowerMenu,
} from "../services/system"

export default function Header() {
  const [uptime, setUptime] = createState(getUptime())
  const [battery, setBattery] = createState(getBatteryInfo())

  setInterval(() => {
    setUptime(getUptime())
    setBattery(getBatteryInfo())
  }, 5000)

  return (
    <box cssClasses={["header-bar"]} halign={Gtk.Align.FILL}>
      {/* Left info: Uptime & Battery */}
      <box cssClasses={["header-info"]} spacing={10} hexpand halign={Gtk.Align.START}>
        {/* Uptime */}
        <box cssClasses={["info-badge"]} spacing={4}>
          <label label="󰅐" cssClasses={["info-icon", "uptime-icon"]} />
          <label label={uptime} cssClasses={["info-text"]} />
        </box>

        {/* Battery (hidden automatically when host has no system battery) */}
        <box
          cssClasses={["info-badge"]}
          spacing={4}
          visible={battery.as((b) => b.available)}
        >
          <label
            label={battery.as((b) => b.icon)}
            cssClasses={battery.as((b) => [
              "info-icon",
              "battery-icon",
              b.charging ? "charging" : "",
            ])}
          />
          <label
            label={battery.as((b) => `${b.percent}%`)}
            cssClasses={["info-text"]}
          />
        </box>
      </box>

      {/* Right action buttons */}
      <box cssClasses={["header-actions"]} spacing={6} halign={Gtk.Align.END}>
        {/* Screenshot */}
        <button
          cssClasses={["action-btn", "screenshot-btn"]}
          tooltipText="Take Screenshot"
          onClicked={takeScreenshot}
        >
          <label label="󰄀" cssClasses={["action-btn-icon"]} />
        </button>

        {/* Reload AGS */}
        <button
          cssClasses={["action-btn", "reload-btn"]}
          tooltipText="Reload AGS"
          onClicked={() => {
            execAsync(["bash", "-c", "nohup systemctl --user restart ags.service >/dev/null 2>&1 &"])
          }}
        >
          <label label="󰑐" cssClasses={["action-btn-icon"]} />
        </button>

        {/* Power Menu */}
        <button
          cssClasses={["action-btn", "power-btn"]}
          tooltipText="Power Menu"
          onClicked={openPowerMenu}
        >
          <label label="⏻" cssClasses={["action-btn-icon", "power-icon"]} />
        </button>
      </box>
    </box>
  )
}
