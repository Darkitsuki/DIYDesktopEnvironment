# Screenshots Contribution Guide

No screenshot images are currently committed in this repository. This guide explains how to capture, prepare, and contribute authentic screenshots of a live **DIYDesktopEnvironment** session for the **Screenshots and Visual Preview** section of the main [README.md](../README.md).

---

## Required Screenshots

Save all screenshots inside `screenshots/` using these exact filenames so they match the preview slots documented in [README.md](../README.md):

| Preview Slot | Filename | Target View |
| --- | --- | --- |
| 1. Desktop Overview | `desktop-overview.png` | Hyprland workspace with wallpaper (`hyprpaper`), floating/tiled windows, and Waybar |
| 2. Waybar Status Bar | `waybar-status-bar.png` | Top translucent pill bar with workspaces, `playerctl`, `gdrive-sync`, audio, network, and tray |
| 3. Quick Settings | `quick-settings.png` | AGS v3 floating Quick Settings panel (telemetry strip, 2x4 toggles, sliders, MPRIS card) |
| 4. Application Launcher | `application-launcher.png` | `hyprlauncher` centered 620x430 Spotlight-style launcher |
| 5. File Manager | `file-manager.png` | Nautilus styled with `gtk-4.0/gtk.css` and `Colloid-Catppuccin-Dark` icons |
| 6. System Monitoring | `system-monitoring.png` | `btop` (`btop/btop.conf`) alongside AGS `SystemStats` telemetry |

---

## Specifications

- **Format:** Lossless **PNG** (`.png`) only.
- **Resolution:** At least **1280x720** for full-screen views (`desktop-overview.png`, `file-manager.png`, `system-monitoring.png`); regional crops (`waybar-status-bar.png`, `quick-settings.png`, `application-launcher.png`) should be captured at native display scale (`scale = 1`, `1920x1080` on `eDP-1`/`HDMI-A-2`) without downscaling.
- **Visual Consistency:** Capture with the repository's Catppuccin Mocha + Electric Blue theme active across Hyprland, Waybar, AGS, GTK 3/4, `hyprtoolkit`, and `Colloid-Catppuccin-Dark` icons.
- **Filenames:** Use the exact lowercase, hyphenated filenames listed in the table above.

---

## Capture Commands (`grim` and `slurp`)

Ensure the target directory exists from the repository root (`~/.config`):

```bash
mkdir -p screenshots
```

### Full-Screen Capture

Capture the entire desktop or a specific monitor output (`eDP-1` or `HDMI-A-2`):

```bash
# Capture all active outputs
grim screenshots/desktop-overview.png

# Capture a single monitor (recommended for multi-monitor setups)
grim -o eDP-1 screenshots/desktop-overview.png
```

### Region Capture

Select a window or UI area interactively with `slurp` (matches the `SUPER + SHIFT + S` workflow in `home-manager/dotfiles/hypr/hyprland.lua`):

```bash
grim -g "$(slurp)" screenshots/quick-settings.png
```

For overlays or popups that close on focus changes or clicks (such as `hyprlauncher` or tooltips), add a short delay before invoking `grim`:

```bash
sleep 3 && grim -o eDP-1 screenshots/application-launcher.png
```

---

## How to Capture Each Screenshot

1. **`desktop-overview.png`**
   - Open 2–3 representative windows (for example, `kitty` with `SUPER + Q` and `nautilus` with `SUPER + E`) arranged cleanly with Hyprland's `dwindle` layout (`gaps_in = 5`, `gaps_out = 10`) over your `hyprpaper` wallpaper and top Waybar.
   - Run `grim -o eDP-1 screenshots/desktop-overview.png`.
2. **`waybar-status-bar.png`**
   - Ensure workspaces, `custom/playerctl`, `pulseaudio`, `network`, `custom/gdrive-sync`, `battery`, `tray`, and `custom/quick-settings` are visible on the top bar.
   - Run `grim -g "$(slurp)" screenshots/waybar-status-bar.png` and drag across the top bar (including a small margin of the wallpaper beneath it to show translucency).
3. **`quick-settings.png`**
   - Click the Waybar gear icon (`⚙️`) or run `ags toggle quick-settings` to open the AGS v3 popup (`380px` panel with `Header`, `SystemStats`, `QuickToggles`, `Sliders`, and `MediaCard` if media is playing/paused).
   - Capture with `grim -g "$(slurp)" screenshots/quick-settings.png` (or use `sleep 3 && grim -o eDP-1 ...` if you want to capture with a hover state, then crop cleanly).
4. **`application-launcher.png`**
   - Prepare `sleep 3 && grim -o eDP-1 screenshots/application-launcher.png` in a terminal, then press `SUPER + R` to open `hyprlauncher` (`620x430` frosted-glass overlay) and wait for capture.
5. **`file-manager.png`**
   - Open Nautilus (`SUPER + E`) showing a non-sensitive directory (such as a sample project or wallpaper folder) with the Catppuccin Mocha GTK4 theme and `Colloid-Catppuccin-Dark` icons clearly visible.
   - Capture the window region with `grim -g "$(slurp)" screenshots/file-manager.png`.
6. **`system-monitoring.png`**
   - Launch `btop` inside `kitty` (`SUPER + Q`) alongside the open AGS Quick Settings popup so both `btop` and the AGS `SystemStats` telemetry strip are visible.
   - Capture with `grim -o eDP-1 screenshots/system-monitoring.png` or `grim -g "$(slurp)" screenshots/system-monitoring.png`.

---

## Image Quality Guidelines

- **Clean Desktop Layout:** Close unrelated apps, extra browser tabs, and clutter before capturing.
- **Keep Core UI Visible:** Ensure Waybar and AGS components remain unobstructed when capturing overview, bar, or popup views.
- **Readable UI Scaling:** Capture at native monitor resolution and `scale = 1` with `JetBrainsMono Nerd Font` and `Roboto` rendering crisply.
- **No Blur or Lossy Recompression:** Avoid JPEG conversion, heavy post-compression, or scaled-down crops that blur text and icons.

---

## Privacy Guidelines

- **Hide Usernames & Private Paths:** Avoid showing personal home directory paths (`/home/<username>`), hostnames, or private bookmarks in terminal prompts, Waybar tooltips, or Nautilus sidebars whenever possible.
- **Clear Notifications:** Pause or dismiss desktop notifications (`dunst` / `mako`) before capturing so private messages or alerts do not appear.
- **Never Expose Secrets:** Ensure no API tokens, `.env` files, `rclone/rclone.conf`, SSH keys, Wi-Fi passwords, or session credentials are visible anywhere on screen.
- **Avoid Personal Files:** Navigate to neutral directories in Nautilus and terminals instead of personal `Documents`, `Downloads`, or `Google Drive` folders containing private filenames.

---

## Referencing Screenshots in `README.md`

Once the `.png` files are saved in `screenshots/`, embed them in the **Screenshots and Visual Preview** section of [README.md](../README.md) using relative Markdown image paths:

```markdown
![Desktop Overview](screenshots/desktop-overview.png)
![Waybar Status Bar](screenshots/waybar-status-bar.png)
![Quick Settings](screenshots/quick-settings.png)
![Application Launcher](screenshots/application-launcher.png)
![File Manager](screenshots/file-manager.png)
![System Monitoring](screenshots/system-monitoring.png)
```
