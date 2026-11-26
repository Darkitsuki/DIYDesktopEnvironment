#!/usr/bin/env python3
import html
import json
import os
import subprocess
import time

STATE_FILE = "/tmp/waybar-playerctl-marquee.json"
MAX_CHARS = 26
PAUSE_START_SEC = 2.0
CHARS_PER_SEC = 2.0
SEPARATOR = "   •   "


def load_state():
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, dict):
                return data
    except Exception:
        pass
    return {}


def save_state(key, start_ts):
    tmp = f"{STATE_FILE}.tmp.{os.getpid()}"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"key": key, "start_ts": start_ts}, f)
        os.replace(tmp, STATE_FILE)
    except Exception:
        try:
            if os.path.exists(tmp):
                os.unlink(tmp)
        except Exception:
            pass


def query_playerctl():
    try:
        res = subprocess.run(
            [
                "playerctl",
                "metadata",
                "--format",
                "{{status}}\x1f{{playerName}}\x1f{{title}}\x1f{{artist}}",
            ],
            capture_output=True,
            text=True,
            timeout=1.5,
        )
        if res.returncode != 0:
            return None
        parts = (res.stdout.rstrip("\n").split("\x1f") + ["", "", "", ""])[:4]
        status, player, title, artist = [p.strip() for p in parts]
        return status, player, title, artist
    except Exception:
        return None


def compute_marquee_window(body, key):
    if len(body) <= MAX_CHARS:
        return body

    now = time.monotonic()
    state = load_state()
    if state.get("key") == key and isinstance(state.get("start_ts"), (int, float)):
        start_ts = float(state["start_ts"])
        if start_ts > now:
            start_ts = now
            save_state(key, start_ts)
    else:
        start_ts = now
        save_state(key, start_ts)

    cycle_text = body + SEPARATOR
    cycle_len = len(cycle_text)
    scroll_duration = cycle_len / CHARS_PER_SEC
    period = PAUSE_START_SEC + scroll_duration

    elapsed = (now - start_ts) % period
    if elapsed < PAUSE_START_SEC:
        offset = 0
    else:
        offset = int((elapsed - PAUSE_START_SEC) * CHARS_PER_SEC) % cycle_len

    doubled = cycle_text + cycle_text
    return doubled[offset : offset + MAX_CHARS]


def main():
    info = query_playerctl()
    if not info:
        print(json.dumps({"text": "", "tooltip": "", "class": "stopped"}, ensure_ascii=False))
        return

    status, player, title, artist = info
    if status not in ("Playing", "Paused"):
        print(json.dumps({"text": "", "tooltip": "", "class": "stopped"}, ensure_ascii=False))
        return

    has_artist = bool(artist) and artist.lower() != title.lower()
    if status == "Playing":
        body = f"{title} - {artist}" if (title and has_artist) else (title or artist)
        icon = "󰎈"
        css_class = "playing"
    else:
        body = title or artist
        icon = "󰏤"
        css_class = "paused"

    if not body:
        print(json.dumps({"text": "", "tooltip": "", "class": "stopped"}, ensure_ascii=False))
        return

    key = f"{status}|{title}|{artist}"
    display_body = compute_marquee_window(body, key)
    text = f"{icon} {display_body}"

    full_desc = f"{title} - {artist}" if (title and has_artist) else body
    player_label = player or "Media"
    tooltip_raw = f"{player_label} ({status})\n{full_desc}\n\nLeft-click: Play/Pause\nRight-click / Scroll: Next/Previous"
    tooltip = html.escape(tooltip_raw, quote=False)

    print(
        json.dumps(
            {
                "text": text,
                "tooltip": tooltip,
                "class": css_class,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
