import { Gtk } from "ags/gtk4"
import { Accessor, For, createState } from "gnim"
import {
  AudioDevice,
  sinks,
  sources,
  refreshAudioDevices,
  setDefaultSink,
  setDefaultSource,
} from "../services/audio"

const [outputOpen, setOutputOpen] = createState(false)
const [inputOpen, setInputOpen] = createState(false)

export const outputDrawerOpen = outputOpen
export const inputDrawerOpen = inputOpen

export function expandAudioDrawers(target: "output" | "input" | "all" = "output") {
  if (target === "output" || target === "all") {
    setOutputOpen(true)
  }
  if (target === "input" || target === "all") {
    setInputOpen(true)
  }
  refreshAudioDevices()
}

export function collapseAudioDrawers() {
  setOutputOpen(false)
  setInputOpen(false)
}

interface DeviceDrawerProps {
  devices: Accessor<AudioDevice[]>
  open: Accessor<boolean>
  onToggle: () => void
  onSelect: (name: string) => void
  fallbackIcon: string
  fallbackLabel: string
  triggerTooltip: string
}

function DeviceDrawer({
  devices,
  open,
  onToggle,
  onSelect,
  fallbackIcon,
  fallbackLabel,
  triggerTooltip,
}: DeviceDrawerProps) {
  const activeDevice = devices.as((list) => list.find((d) => d.isDefault) || list[0] || null)

  return (
    <box orientation={Gtk.Orientation.VERTICAL} spacing={4} cssClasses={["audio-device-drawer"]}>
      {/* Active Device Pill Button */}
      <button
        cssClasses={open.as((o) => ["audio-device-trigger", o ? "open" : ""])}
        tooltipText={activeDevice.as((d) => (d ? `${triggerTooltip}: ${d.description}` : triggerTooltip))}
        onClicked={() => {
          if (!open.peek()) {
            refreshAudioDevices()
          }
          onToggle()
        }}
      >
        <box spacing={8} hexpand>
          <label
            label={activeDevice.as((d) => (d ? d.icon : fallbackIcon))}
            cssClasses={["audio-device-trigger-icon"]}
          />
          <label
            label={activeDevice.as((d) => (d ? d.label : fallbackLabel))}
            cssClasses={["audio-device-trigger-label"]}
            hexpand
            halign={Gtk.Align.START}
            ellipsize={3}
            maxWidthChars={28}
          />
          <label
            label={open.as((o) => (o ? "󰅃" : "󰅀"))}
            cssClasses={["audio-device-chevron"]}
          />
        </box>
      </button>

      {/* Collapsible Device List */}
      <revealer
        revealChild={open}
        transitionType={Gtk.RevealerTransitionType.SLIDE_DOWN}
        transitionDuration={180}
      >
        <box
          orientation={Gtk.Orientation.VERTICAL}
          spacing={3}
          cssClasses={["audio-device-list"]}
        >
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
                    maxWidthChars={26}
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
            label="No devices found"
            visible={devices.as((list) => list.length === 0)}
            cssClasses={["audio-device-empty"]}
            halign={Gtk.Align.START}
          />
        </box>
      </revealer>
    </box>
  )
}

export function OutputDeviceMenu() {
  return (
    <DeviceDrawer
      devices={sinks}
      open={outputDrawerOpen}
      onToggle={() => setOutputOpen((prev) => !prev)}
      onSelect={setDefaultSink}
      fallbackIcon="󰓃"
      fallbackLabel="Default Output"
      triggerTooltip="Select Audio Output Device"
    />
  )
}

export function InputDeviceMenu() {
  return (
    <DeviceDrawer
      devices={sources}
      open={inputDrawerOpen}
      onToggle={() => setInputOpen((prev) => !prev)}
      onSelect={setDefaultSource}
      fallbackIcon="󰍬"
      fallbackLabel="Default Microphone"
      triggerTooltip="Select Microphone Input Device"
    />
  )
}
