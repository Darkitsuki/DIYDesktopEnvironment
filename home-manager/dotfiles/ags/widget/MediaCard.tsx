import { Gtk } from "ags/gtk4"
import {
  mpris,
  mediaPrevious,
  mediaPlayPause,
  mediaNext,
} from "../services/mpris"

export default function MediaCard() {
  return (
    <box
      visible={mpris.as((m) => m.available && m.status !== "Stopped")}
      cssClasses={["media-card"]}
      spacing={12}
      halign={Gtk.Align.FILL}
    >
      {/* Album / Music Icon */}
      <box cssClasses={["media-art-box"]} valign={Gtk.Align.CENTER}>
        <label label="󰝚" cssClasses={["media-art-icon"]} />
      </box>

      {/* Track & Artist Info */}
      <box
        orientation={Gtk.Orientation.VERTICAL}
        valign={Gtk.Align.CENTER}
        hexpand
        spacing={2}
      >
        <label
          label={mpris.as((m) => m.title)}
          cssClasses={["media-title"]}
          halign={Gtk.Align.START}
          ellipsize={3}
          maxWidthChars={18}
        />
        <label
          label={mpris.as((m) => m.artist)}
          cssClasses={["media-artist"]}
          halign={Gtk.Align.START}
          ellipsize={3}
          maxWidthChars={18}
        />
      </box>

      {/* Controls: Prev, Play/Pause, Next */}
      <box
        cssClasses={["media-controls"]}
        spacing={4}
        valign={Gtk.Align.CENTER}
        halign={Gtk.Align.END}
      >
        {/* Previous */}
        <button
          cssClasses={["media-btn", "media-prev-btn"]}
          tooltipText="Previous Track"
          onClicked={mediaPrevious}
        >
          <label label="󰒮" cssClasses={["media-btn-icon"]} />
        </button>

        {/* Play / Pause */}
        <button
          cssClasses={["media-btn", "media-play-btn"]}
          tooltipText="Play / Pause"
          onClicked={mediaPlayPause}
        >
          <label
            label={mpris.as((m) => (m.status === "Playing" ? "󰏤" : "󰐊"))}
            cssClasses={["media-btn-icon", "play-icon"]}
          />
        </button>

        {/* Next */}
        <button
          cssClasses={["media-btn", "media-next-btn"]}
          tooltipText="Next Track"
          onClicked={mediaNext}
        >
          <label label="󰒭" cssClasses={["media-btn-icon"]} />
        </button>
      </box>
    </box>
  )
}
