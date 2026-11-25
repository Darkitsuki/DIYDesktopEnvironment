import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { Accessor, For } from "gnim"
import { execAsync } from "ags/process"
import {
  AudioDevice,
  SinkInput,
  speaker,
  mic,
  sinks,
  sources,
  sinkInputs,
  setSpeakerVolume,
  toggleSpeakerMute,
  setMicVolume,
  toggleMicMute,
  setDefaultSink,
  setDefaultSource,
  setSinkInputVolume,
  toggleSinkInputMute,
  refreshAllAudio,
} from "../services/audio"

function resolveAppIcon(iconName: string): string {
  const display = Gdk.Display.get_default()
  if (iconName && display) {
    const theme = Gtk.IconTheme.get_for_display(display)
    if (theme.has_icon(iconName)) {
      return iconName
    }
  }
  return "audio-x-generic-symbolic"
}

function MasterSliderRow({
  icon,
  tooltip,
  onMuteToggle,
  value,
  onValueChange,
}: {
  icon: Accessor<string>
  tooltip: string
  onMuteToggle: () => void
  value: Accessor<number>
  onValueChange: (val: number) => void
}) {
  let lastReported = value.peek()

  return (
    <box cssClasses={["slider-row", "audio-master-row"]} spacing={10} halign={Gtk.Align.FILL}>
      <button
        cssClasses={["slider-icon-btn"]}
        tooltipText={tooltip}
        onClicked={onMuteToggle}
      >
        <label label={icon} cssClasses={["slider-icon"]} />
      </button>

      <slider
        min={0}
        max={100}
        value={value}
        hexpand
        cssClasses={["custom-slider"]}
        onValueChanged={(self: Astal.Slider) => {
          const rounded = Math.round(self.value)
          if (Math.abs(rounded - lastReported) >= 1) {
            lastReported = rounded
            onValueChange(rounded)
          }
        }}
      />

      <label
        label={value.as((v) => `${Math.round(v)}%`)}
        cssClasses={["slider-value-label"]}
        halign={Gtk.Align.END}
      />
    </box>
  )
}

function DeviceList({
  devices,
  onSelect,
  emptyText,
}: {
  devices: Accessor<AudioDevice[]>
  onSelect: (name: string) => void
  emptyText: string
}) {
  return (
    <box orientation={Gtk.Orientation.VERTICAL} spacing={4} cssClasses={["audio-device-list"]}>
      <For
        each={devices}
        id={(dev) => `${dev.name}:${dev.isDefault}:${dev.available}:${dev.label}`}
      >
        {(dev) => (
          <button
            cssClasses={[
              "audio-device-item",
              dev.isDefault ? "active" : "",
              dev.available ? "" : "unavailable",
            ]}
            tooltipText={dev.description}
            onClicked={() => onSelect(dev.name)}
          >
            <box spacing={8} hexpand>
              <label label={dev.icon} cssClasses={["audio-device-item-icon"]} />
              <label
                label={dev.label}
                cssClasses={["audio-device-item-label"]}
                hexpand
                halign={Gtk.Align.START}
                ellipsize={3}
                maxWidthChars={30}
              />
              <label
                label=""
                visible={dev.isDefault}
                cssClasses={["audio-device-check"]}
              />
            </box>
          </button>
        )}
      </For>

      <label
        label={emptyText}
        visible={devices.as((list) => list.length === 0)}
        cssClasses={["audio-empty-label"]}
        halign={Gtk.Align.START}
      />
    </box>
  )
}

function AppStreamRow({ initial }: { initial: SinkInput }) {
  const live = sinkInputs.as(
    (list) => list.find((s) => s.index === initial.index) ?? initial,
  )
  let lastReported = initial.volume

  return (
    <box orientation={Gtk.Orientation.VERTICAL} spacing={4} cssClasses={["app-stream-row"]}>
      <box spacing={8} halign={Gtk.Align.FILL}>
        <image
          iconName={resolveAppIcon(initial.iconName)}
          pixelSize={18}
          cssClasses={["app-stream-icon"]}
          valign={Gtk.Align.CENTER}
        />
        <box orientation={Gtk.Orientation.VERTICAL} hexpand valign={Gtk.Align.CENTER}>
          <label
            label={live.as((s) => s.appName)}
            cssClasses={["app-stream-name"]}
            halign={Gtk.Align.START}
            ellipsize={3}
            maxWidthChars={24}
          />
          <label
            label={live.as((s) => s.mediaName)}
            visible={live.as((s) => s.mediaName.length > 0)}
            cssClasses={["app-stream-media"]}
            halign={Gtk.Align.START}
            ellipsize={3}
            maxWidthChars={28}
          />
        </box>
        <button
          cssClasses={live.as((s) => ["app-stream-mute-btn", s.mute ? "muted" : ""])}
          tooltipText={live.as((s) => (s.mute ? "Unmute App" : "Mute App"))}
          onClicked={() => toggleSinkInputMute(initial.index)}
        >
          <label
            label={live.as((s) => (s.mute ? "󰝟" : "󰕾"))}
            cssClasses={["app-stream-mute-icon"]}
          />
        </button>
      </box>

      <box spacing={8} halign={Gtk.Align.FILL}>
        <slider
          min={0}
          max={100}
          value={live.as((s) => s.volume)}
          hexpand
          cssClasses={["custom-slider", "app-stream-slider"]}
          onValueChanged={(self: Astal.Slider) => {
            const rounded = Math.round(self.value)
            const current = live.peek().volume
            if (Math.abs(rounded - lastReported) >= 1 && rounded !== current) {
              lastReported = rounded
              setSinkInputVolume(initial.index, rounded)
            }
          }}
        />
        <label
          label={live.as((s) => (s.mute ? "Muted" : `${s.volume}%`))}
          cssClasses={["slider-value-label", "app-stream-pct"]}
          halign={Gtk.Align.END}
        />
      </box>
    </box>
  )
}

export default function AudioMenu() {
  const win = (
    <window
      name="audio-menu"
      namespace="audio-menu"
      visible={false}
      anchor={Astal.WindowAnchor.TOP | Astal.WindowAnchor.RIGHT}
      marginTop={8}
      marginRight={12}
      keymode={Astal.Keymode.ON_DEMAND}
      layer={Astal.Layer.TOP}
      exclusivity={Astal.Exclusivity.NORMAL}
      resizable={false}
      application={app}
      cssClasses={["audio-menu-window"]}
    >
      <box
        orientation={Gtk.Orientation.VERTICAL}
        spacing={10}
        cssClasses={["audiomenu-panel"]}
        widthRequest={380}
      >
        {/* Header */}
        <box cssClasses={["audiomenu-header"]} halign={Gtk.Align.FILL}>
          <box spacing={8} hexpand halign={Gtk.Align.START} valign={Gtk.Align.CENTER}>
            <label label="󰕾" cssClasses={["audiomenu-header-icon"]} />
            <label label="Audio & Mixer" cssClasses={["audiomenu-header-title"]} />
          </box>
          <button
            cssClasses={["action-btn"]}
            tooltipText="Open Volume Control (pavucontrol)"
            onClicked={() => {
              win.visible = false
              execAsync(["pavucontrol"]).catch(() => {})
            }}
          >
            <label label="󰒓" cssClasses={["action-btn-icon"]} />
          </button>
        </box>

        {/* Section 1: Output Devices */}
        <box orientation={Gtk.Orientation.VERTICAL} spacing={8} cssClasses={["audio-section"]}>
          <label
            label="Output Devices"
            cssClasses={["audio-section-title"]}
            halign={Gtk.Align.START}
          />
          <MasterSliderRow
            icon={speaker.as((s) =>
              s.muted
                ? "󰝟"
                : s.volume > 60
                ? "󰕾"
                : s.volume > 20
                ? "󰖀"
                : "󰕿",
            )}
            tooltip="Toggle Output Mute"
            onMuteToggle={toggleSpeakerMute}
            value={speaker.as((s) => s.volume)}
            onValueChange={setSpeakerVolume}
          />
          <DeviceList
            devices={sinks}
            onSelect={setDefaultSink}
            emptyText="No output devices available"
          />
        </box>

        {/* Section 2: Input Devices / Microphones */}
        <box orientation={Gtk.Orientation.VERTICAL} spacing={8} cssClasses={["audio-section"]}>
          <label
            label="Input Devices"
            cssClasses={["audio-section-title"]}
            halign={Gtk.Align.START}
          />
          <MasterSliderRow
            icon={mic.as((m) => (m.muted || !m.available ? "󰍭" : "󰍬"))}
            tooltip="Toggle Microphone Mute"
            onMuteToggle={toggleMicMute}
            value={mic.as((m) => m.volume)}
            onValueChange={setMicVolume}
          />
          <DeviceList
            devices={sources}
            onSelect={setDefaultSource}
            emptyText="No input devices available"
          />
        </box>

        {/* Section 3: Per-Application Volume Mixer */}
        <box orientation={Gtk.Orientation.VERTICAL} spacing={8} cssClasses={["audio-section"]}>
          <label
            label="App Volume"
            cssClasses={["audio-section-title"]}
            halign={Gtk.Align.START}
          />
          <scrolledwindow
            hscrollbarPolicy={Gtk.PolicyType.NEVER}
            vscrollbarPolicy={Gtk.PolicyType.AUTOMATIC}
            propagateNaturalHeight
            maxContentHeight={190}
            cssClasses={["app-mixer-scroll"]}
          >
            <box orientation={Gtk.Orientation.VERTICAL} spacing={6}>
              <For each={sinkInputs} id={(stream) => stream.index}>
                {(stream) => <AppStreamRow initial={stream} />}
              </For>
              <label
                label="No active audio streams"
                visible={sinkInputs.as((list) => list.length === 0)}
                cssClasses={["audio-empty-label"]}
                halign={Gtk.Align.START}
              />
            </box>
          </scrolledwindow>
        </box>
      </box>
    </window>
  ) as Astal.Window

  win.connect("notify::visible", () => {
    if (win.visible) {
      refreshAllAudio()
    }
  })

  // Intercept Escape key to hide audio-menu
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
