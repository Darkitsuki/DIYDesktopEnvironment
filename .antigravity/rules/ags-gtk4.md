# AGS v3 / Astal GTK4 & TypeScript Rules (`home-manager/dotfiles/ags/`)

Applies when editing `app.ts`, `style.css`, `services/*.ts`, or `widget/*.tsx`.

## AGS v3 / Astal GTK4 + TypeScript Conventions

- **Runtime & Toolchain:** Targets AGS `3.1.0` with `gnim` (`createState`, `Accessor`, `For`), `ags/gtk4` (`Astal`, `Gtk`, `Gdk`), `ags/process` (`execAsync`, `subprocess`), and GObject Introspection (`gi://GLib?version=2.0`, `gi://Gio?version=2.0`).
- **Strict TypeScript:** `tsconfig.json` enforces `"strict": true`, `"jsx": "react-jsx"`, `"jsxImportSource": "ags/gtk4"`. Avoid `any` and keep service state typed (`services/*.ts`).
- **Registered Windows & Namespaces (`app.ts` / `widget/*.tsx`):**
  - `quick-settings` (plus alias window `quicksettings`), `audio-menu`, `power-menu` (`Astal.Layer.OVERLAY`, mutually exclusive via `bindPopup`)
  - `quick-settings-backdrop` (`Backdrop.tsx`, `Astal.Layer.TOP`, `Astal.Keymode.NONE`, `Astal.Exclusivity.IGNORE`)
  - `osd` (`OSD.tsx`), `perf-overlay` (`PerfOverlay.tsx`)
  - Keep `requestHandler` commands (`audio`, `power`) and window names stable (`StatusCluster.qml` calls `ags toggle audio-menu`; `hyprland.lua` calls `ags toggle perf-overlay`).

## `style.css` & One UI Motion

- Reuse Catppuccin Mocha + Electric Blue `@define-color` variables (`@base #1e1e2e`, `@surface0 #313244`, `@surface1 #45475a`, `@text #cdd6f4`, `@blue #89b4fa`, `@electric_blue #288cff`).
- Keep `.quicksettings-panel` at `border-radius: 16px` and interactive controls using `240–270ms cubic-bezier(0.22, 1, 0.36, 1)` transitions.
- Preserve `window.backdrop-window` `background-color: rgba(0, 0, 0, 0.004)` (near-zero alpha, NOT `0`) so GTK4/Wayland hit-testing catches outside clicks to dismiss popups.

## Single-Instance Service Management

- `ags` runs exclusively via `$HOME/.config/systemd/user/ags.service` (`ExecStart=/usr/bin/ags run`, `WantedBy=graphical-session.target`).
- NEVER add `hl.exec_cmd("ags run")` or `ags run` in `hyprland.lua`, and do NOT run ad-hoc `ags run` instances alongside the user service.

## Validation

```bash
ags types -d "$HOME/.config/home-manager/dotfiles/ags" 2>/dev/null || true
systemctl --user restart ags.service
journalctl --user -u ags.service -n 50 --no-pager
lsof /dev/nvidia* /dev/dri/renderD129 2>/dev/null | grep -iE "ags|gjs" || true
```
