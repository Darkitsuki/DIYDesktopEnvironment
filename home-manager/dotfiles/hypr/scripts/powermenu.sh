#!/usr/bin/env bash

options="\Uf0343  Logout\n\Uf033e  Lock\n\Uf04b2  Suspend\n\Uf0717  Hibernate\n\Uf0709  Reboot\n\Uf0425  Shutdown"

if command -v wofi >/dev/null 2>&1 && pgrep -x waybar >/dev/null 2>&1 && [ -f "$HOME/.config/wofi/powermenu.css" ]; then
  wofi_xdg="${XDG_RUNTIME_DIR:-/tmp}/wofi-powermenu-xdg"
  mkdir -p "$wofi_xdg"
  chosen=$(printf "%b" "$options" | XDG_CONFIG_HOME="$wofi_xdg" wofi --dmenu --cache-file /dev/null \
    --style "$HOME/.config/wofi/powermenu.css" \
    --width 132 --height 204 --hide-scroll --no-actions --hide-search \
    --define single_click=true --define layer=overlay)
else
  chosen=$(printf "%b" "$options" | rofi -dmenu -i -theme "$HOME/.config/rofi/powermenu.rasi")
fi

case "$chosen" in
  *Logout)
    if command -v uwsm >/dev/null 2>&1 && uwsm check is-active >/dev/null 2>&1; then
      uwsm stop
    else
      hyprctl dispatch "hl.dsp.exit()"
    fi
    ;;
  *Lock)
    pidof hyprlock >/dev/null || hyprlock
    ;;
  *Suspend)
    systemctl suspend
    ;;
  *Hibernate)
    systemctl hibernate
    ;;
  *Reboot)
    systemctl reboot
    ;;
  *Shutdown)
    systemctl poweroff
    ;;
esac
