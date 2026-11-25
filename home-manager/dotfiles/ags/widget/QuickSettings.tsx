import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { createState } from "gnim"
import { execAsync } from "ags/process"
import GLib from "gi://GLib?version=2.0"
import { homeDir } from "../services/config"
import Header from "./Header"
import SystemStats from "./SystemStats"
import QuickToggles from "./QuickToggles"
import Sliders from "./Sliders"
import MediaCard from "./MediaCard"

interface ConfigSyncStatus {
  icon: string
  title: string
  subtitle: string
  tooltip: string
  cssState: "synced" | "syncing" | "failed"
}

const CONFIG_SYNC_LOG = `${homeDir}/.local/state/rclone-config-sync.log`
const NAUTILUS_SYNC_SCRIPT = `${homeDir}/.local/share/nautilus/scripts/Sync Google Drive Now`

function readLastBackupTimestamp(): { short: string; full: string } | null {
  try {
    if (!GLib.file_test(CONFIG_SYNC_LOG, GLib.FileTest.EXISTS)) return null
    const [ok, bytes] = GLib.file_get_contents(CONFIG_SYNC_LOG)
    if (!ok) return null
    const text = new TextDecoder().decode(bytes)
    const lines = text.split("\n")
    for (let i = lines.length - 1; i >= 0; i--) {
      const m = lines[i].match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}:\d{2}):(\d{2})\b/)
      if (m) {
        const [, year, month, day, hhmm, ss] = m
        return {
          short: `${day}/${month} ${hhmm}`,
          full: `${year}/${month}/${day} ${hhmm}:${ss}`,
        }
      }
    }
  } catch {}
  return null
}

function SyncStrip({ refreshSignal }: { refreshSignal: (fn: () => void) => void }) {
  const [status, setStatus] = createState<ConfigSyncStatus>({
    icon: "󰆧",
    title: ".config Backup",
    subtitle: "Checking...",
    tooltip: "rclone-config-sync.service",
    cssState: "synced",
  })

  const refreshSyncStatus = async () => {
    const ts = readLastBackupTimestamp()
    try {
      const out = await execAsync([
        "systemctl",
        "--user",
        "show",
        "rclone-config-sync.service",
        "-p",
        "ActiveState",
        "-p",
        "Result",
        "--value",
      ])
      const [activeState = "", result = ""] = out.trim().split("\n").map((s) => s.trim())

      if (activeState === "activating" || activeState === "active") {
        setStatus({
          icon: "󰑐",
          title: ".config Syncing",
          subtitle: "In progress...",
          tooltip: `rclone-config-sync.service: ${activeState}\nLast backup: ${ts ? ts.full : "Unknown"}`,
          cssState: "syncing",
        })
        return
      }

      if (activeState === "failed" || (result && result !== "success")) {
        setStatus({
          icon: "󰋔",
          title: ".config Failed",
          subtitle: ts ? ts.short : "Check log",
          tooltip: `rclone-config-sync.service: ${activeState} (${result})\nLast log: ${ts ? ts.full : "None"}`,
          cssState: "failed",
        })
        return
      }

      setStatus({
        icon: "󰆧",
        title: ".config Backup",
        subtitle: ts ? ts.short : "No log yet",
        tooltip: `rclone-config-sync.service: Ready\nLast backup: ${ts ? ts.full : "No log yet"}`,
        cssState: "synced",
      })
    } catch {
      setStatus({
        icon: "󰆧",
        title: ".config Backup",
        subtitle: ts ? ts.short : "Unavailable",
        tooltip: `Last backup: ${ts ? ts.full : "Unavailable"}`,
        cssState: "synced",
      })
    }
  }

  refreshSignal(() => {
    refreshSyncStatus()
  })

  refreshSyncStatus()
  setInterval(refreshSyncStatus, 4000)

  const triggerConfigBackup = () => {
    execAsync(["systemctl", "--user", "start", "--no-block", "rclone-config-sync.service"])
      .then(() =>
        execAsync([
          "notify-send",
          "-i",
          "emblem-synchronizing",
          "Google Drive",
          "Backing up ~/.config to Google Drive...",
        ]),
      )
      .catch((e) => console.error("Backup .config error:", e))
    setTimeout(refreshSyncStatus, 250)
    setTimeout(refreshSyncStatus, 1800)
  }

  const triggerDriveSync = () => {
    if (GLib.file_test(NAUTILUS_SYNC_SCRIPT, GLib.FileTest.IS_EXECUTABLE)) {
      execAsync([NAUTILUS_SYNC_SCRIPT]).catch((e) => console.error("Sync Drive error:", e))
    } else {
      execAsync(["systemctl", "--user", "start", "--no-block", "rclone-gdrive-sd.service"])
        .then(() =>
          execAsync([
            "notify-send",
            "-i",
            "emblem-synchronizing",
            "Google Drive",
            "Starting Google Drive sync...",
          ]),
        )
        .catch((e) => console.error("Sync Drive error:", e))
    }
  }

  return (
    <box
      cssClasses={["sync-strip"]}
      spacing={8}
      halign={Gtk.Align.FILL}
      valign={Gtk.Align.CENTER}
    >
      {/* Left: Live rclone-config-sync status & last backup timestamp */}
      <box
        cssClasses={["sync-status-box"]}
        spacing={8}
        hexpand
        halign={Gtk.Align.START}
        valign={Gtk.Align.CENTER}
        tooltipText={status.as((s) => s.tooltip)}
      >
        <label
          label={status.as((s) => s.icon)}
          cssClasses={status.as((s) => ["sync-status-icon", s.cssState])}
          valign={Gtk.Align.CENTER}
        />
        <box orientation={Gtk.Orientation.VERTICAL} valign={Gtk.Align.CENTER}>
          <label
            label={status.as((s) => s.title)}
            cssClasses={["sync-title"]}
            halign={Gtk.Align.START}
          />
          <label
            label={status.as((s) => s.subtitle)}
            cssClasses={["sync-subtitle"]}
            halign={Gtk.Align.START}
          />
        </box>
      </box>

      {/* Right: Compact action buttons */}
      <box cssClasses={["sync-actions"]} spacing={6} halign={Gtk.Align.END} valign={Gtk.Align.CENTER}>
        <button
          cssClasses={["sync-btn", "sync-backup-btn"]}
          tooltipText="Run 1-way ~/.config backup to Google Drive"
          onClicked={triggerConfigBackup}
        >
          <box spacing={4} valign={Gtk.Align.CENTER}>
            <label label="󰁧" cssClasses={["sync-btn-icon"]} />
            <label label="Backup .config" cssClasses={["sync-btn-label"]} />
          </box>
        </button>

        <button
          cssClasses={["sync-btn", "sync-drive-btn"]}
          tooltipText="Sync Google Drive SD folder now"
          onClicked={triggerDriveSync}
        >
          <box spacing={4} valign={Gtk.Align.CENTER}>
            <label label="󰑐" cssClasses={["sync-btn-icon"]} />
            <label label="Sync Drive" cssClasses={["sync-btn-label"]} />
          </box>
        </button>
      </box>
    </box>
  )
}

export default function QuickSettings() {
  let onOpenRefresh: (() => void) | null = null

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

        {/* Hardware Telemetry Strip */}
        <SystemStats />

        {/* 2x3 Quick Toggles Grid */}
        <QuickToggles />

        {/* Sliders Section */}
        <Sliders />

        {/* MPRIS Media Card (dynamic) */}
        <MediaCard />

        {/* Compact Cloud & .config Sync Strip */}
        <SyncStrip
          refreshSignal={(fn) => {
            onOpenRefresh = fn
          }}
        />
      </box>
    </window>
  ) as Astal.Window

  win.connect("notify::visible", () => {
    if (win.visible && onOpenRefresh) {
      onOpenRefresh()
    }
  })

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
