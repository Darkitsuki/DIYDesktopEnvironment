import { Astal, Gtk } from "ags/gtk4"
import { Accessor } from "gnim"
import {
  speaker,
  setSpeakerVolume,
  toggleSpeakerMute,
  mic,
  setMicVolume,
  toggleMicMute,
} from "../services/audio"
import {
  laptopBrightness,
  setInternalBrightness,
  externalBrightness,
  setExternalBrightnessDebounced,
  externalDisplayConnected,
  externalDisplayName,
} from "../services/brightness"

interface SliderRowProps {
  icon: Accessor<string> | string
  iconTooltip?: Accessor<string> | string
  onIconClick?: () => void
  value: Accessor<number>
  onValueChange: (val: number) => void
  min?: number
  max?: number
  customClass?: string
}

function SliderRow({
  icon,
  iconTooltip,
  onIconClick,
  value,
  onValueChange,
  min = 0,
  max = 100,
  customClass = "",
}: SliderRowProps) {
  let lastReported = value.peek()

  const slider = (
    <slider
      min={min}
      max={max}
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
  )

  return (
    <box
      cssClasses={["slider-row", customClass]}
      spacing={10}
      halign={Gtk.Align.FILL}
    >
      {/* Icon or Mute Button */}
      {onIconClick ? (
        <button
          cssClasses={["slider-icon-btn"]}
          tooltipText={iconTooltip || ""}
          onClicked={onIconClick}
        >
          <label label={icon} cssClasses={["slider-icon"]} />
        </button>
      ) : (
        <box cssClasses={["slider-icon-box"]}>
          <label label={icon} cssClasses={["slider-icon"]} />
        </box>
      )}

      {/* Slider Bar */}
      {slider}

      {/* Value Label */}
      <label
        label={value.as((v) => `${Math.round(v)}%`)}
        cssClasses={["slider-value-label"]}
        halign={Gtk.Align.END}
      />
    </box>
  )
}

export default function Sliders() {
  return (
    <box
      orientation={Gtk.Orientation.VERTICAL}
      spacing={10}
      cssClasses={["sliders-card"]}
    >
      {/* 1. Output Volume */}
      <SliderRow
        icon={speaker.as((s) =>
          s.muted
            ? "󰝟"
            : s.volume > 60
            ? "󰕾"
            : s.volume > 20
            ? "󰖀"
            : "󰕿",
        )}
        iconTooltip="Toggle Mute"
        onIconClick={toggleSpeakerMute}
        value={speaker.as((s) => s.volume)}
        onValueChange={setSpeakerVolume}
        customClass="speaker-slider"
      />

      {/* 2. Microphone Gain (shown if available or general control) */}
      <SliderRow
        icon={mic.as((m) => (m.muted || !m.available ? "󰍭" : "󰍬"))}
        iconTooltip="Toggle Mic Mute"
        onIconClick={toggleMicMute}
        value={mic.as((m) => m.volume)}
        onValueChange={setMicVolume}
        customClass="mic-slider"
      />

      {/* 3. Internal Display Brightness */}
      <SliderRow
        icon="󰃠"
        iconTooltip="Internal Display Brightness"
        value={laptopBrightness}
        onValueChange={setInternalBrightness}
        min={1}
        max={100}
        customClass="laptop-brightness-slider"
      />

      {/* 4. External Monitor Brightness */}
      <box
        visible={externalDisplayConnected}
        orientation={Gtk.Orientation.VERTICAL}
      >
        <SliderRow
          icon="󰍹"
          iconTooltip={externalDisplayName.as((name) => `External Monitor Brightness (${name})`)}
          value={externalBrightness}
          onValueChange={setExternalBrightnessDebounced}
          min={0}
          max={100}
          customClass="external-brightness-slider"
        />
      </box>
    </box>
  )
}
