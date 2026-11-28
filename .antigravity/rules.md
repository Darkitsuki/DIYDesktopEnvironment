# DIYDesktopEnvironment — Core Agent Rules

Arch Linux + UWSM + Hyprland `0.57.2` Wayland desktop repository (`Darkitsuki/DIYDesktopEnvironment`) rooted at `$HOME/.config` (branch `main`).
Load domain rules from `$HOME/.config/.antigravity/rules/` only when editing that subsystem.

## Architecture & Directory Map

| Path | Target / Wiring (`home.nix`) | Role |
| :--- | :--- | :--- |
| `home-manager/flake.nix`, `home.nix` | Flake root (`nixpkgs-unstable`) | Declares `Colloid-Catppuccin-Dark` icons and `xdg.configFile` symlinks |
| `home-manager/dotfiles/hypr/` | `~/.config/hypr` (`mkOutOfStoreSymlink`) | Hyprland Lua config (`hyprland.lua`), `hyprlock.conf`, `hypridle.conf`, `hyprpaper.conf`, `hyprlauncher.conf` |
| `home-manager/dotfiles/quickshell/` | `~/.config/quickshell` (`mkOutOfStoreSymlink`) | Active Qt6/QML bar, app/clipboard launcher, snipping overlay |
| `home-manager/dotfiles/ags/` | `~/.config/ags` (`mkOutOfStoreSymlink`) | AGS v3 / Astal GTK4 + TS quick settings, audio/power menus, OSD, perf overlay |
| `home-manager/dotfiles/waybar/` | `~/.config/waybar` (`mkOutOfStoreSymlink`) | Legacy status bar; MUST stay intact as rollback target |
| `home-manager/dotfiles/kitty/` | `~/.config/kitty` (`mkOutOfStoreSymlink`) | Terminal (`JetBrainsMono Nerd Font`, cursor trail, iGPU frame pacing) |
| `home-manager/dotfiles/gtk-3.0/`, `gtk-4.0/`, `xsettingsd/` | `~/.config/{gtk-3.0,gtk-4.0,xsettingsd}` (`mkOutOfStoreSymlink`) | GTK dark theme (`Adwaita:dark`), `Colloid-Catppuccin-Dark`, `Roboto 11` |
| `home-manager/dotfiles/xdg-desktop-portal/` | `~/.config/xdg-desktop-portal` (`mkOutOfStoreSymlink`) | `hyprland;gtk` portal routing and filechooser backend |
| `home-manager/dotfiles/mangohud/MangoHud.conf` | `~/.config/mangohud/MangoHud.conf` (`mkOutOfStoreSymlink`) | Compact top-left Catppuccin Mocha game telemetry HUD (`Shift_R+F12`) |
| `home-manager/dotfiles/brave-flags.conf` | `~/.config/brave-flags.conf` (`mkOutOfStoreSymlink`) | Ozone Wayland + VA-API zero-copy decode flags |
| `systemd/user/` | Live units (gitignored via `systemd/`) | `quickshell.service`, `ags.service`, `rclone-*.service/.timer`, `sd-card-automount.service` |
| `$HOME/.local/bin/` | External scripts (outside repo) | Sync (`sync-config-gdrive.sh`, `mirror-gdrive-sd.sh`, `gdrive-emblems.py`), screenshot/HDR/clipboard helpers |

## Non-Negotiable Hardware & Compositor Invariants

- **Dual-GPU Affinity & NVIDIA `D3cold`:** `quickshell.service` and `ags.service` MUST stay pinned to Intel Iris Xe:
  - `MESA_VK_DEVICE_SELECT=8086:46a6!`
  - `__EGL_VENDOR_LIBRARY_FILENAMES=/usr/share/glvnd/egl_vendor.d/50_mesa.json`
  - Verify **0 handles** on `/dev/nvidia*` and `/dev/dri/renderD129` via `lsof` so the RTX 3050 Ti enters `D3cold`.
  - Never route desktop shell units onto the dGPU; only explicit offload wrappers (e.g., `curseforge-nvidia`, `prime-run`) unset Mesa isolation.
- **External Monitor `HDMI-A-2`:** Preserve `1920x1080@180`, `bitdepth = 8`, `cm = "srgb"`, `misc.vrr = 0`, `render.direct_scanout = 0`, `render.cm_auto_hdr = 0` (avoid cross-GPU flicker/HDR instability; HDR toggling is explicit via `$HOME/.local/bin/hypr-hdr-toggle`).

## Visual & UX Tokens

- **Palette (Catppuccin Mocha + Electric Blue):** Base `#1e1e2e`, Surface0 `#313244`, Surface1 `#45475a`, Text `#cdd6f4`, Accent `#89b4fa`, Active Electric Blue `#288cff`.
- **Geometry:** `28px` pills inside a `30px` outer bar (`Theme.qml`); `14px–16px` corner radius (`14` in Hyprland, `16px` on panels/pills).
- **Icons & Qt/GTK Integration:** `Colloid-Catppuccin-Dark` icon theme across GTK3/GTK4/xsettingsd and `QT_QPA_PLATFORMTHEME=gtk3` in `quickshell.service`.
- **Motion & Blur:** One UI glide (`220–280ms`, `cubic-bezier(0.22, 1.0, 0.36, 1.0)` / `oneUiGlide`). Keep Hyprland blur capped at `size = 5`, `passes <= 2` (`passes = 1` currently set).

## Token-Saving Execution Rules

- **Targeted Reads Only:** Use `codesearch` / `grep -rn` to locate symbols first, then read minimal line ranges (`StartLine`/`EndLine`). Never run full-tree scans or read `node_modules/`, `@girs/`, caches, or binary state.
- **Plan Multi-File Edits:** Form an explicit edit plan before modifying multiple files. Output concise diffs/summaries rather than pasting full files.
- **Progressive Disclosure:** Read only the matching domain rule file before editing:
  - Hyprland Lua / keybinds / layer rules -> `.antigravity/rules/hyprland-lua.md`
  - Quickshell / QML / launcher / snipping -> `.antigravity/rules/quickshell-qml.md`
  - AGS v3 / Astal GTK4 / TypeScript -> `.antigravity/rules/ags-gtk4.md`
  - Home Manager / systemd / rclone GitOps -> `.antigravity/rules/nix-systemd-gitops.md`
- **Secret Boundary:** NEVER read or embed `rclone/rclone.conf`, `gh/`, `machine-config.env`, `antigravity/plugin-secrets.json`, `antigravity/credential-user-scope`, `*.pem`, or `*.key`.

## Mandatory Post-Task Git & Cloud Sync Contract

After any authorized edit inside `$HOME/.config`:
1. **Run Domain Validation:** Execute the subsystem's syntax/lint/service checks first.
2. **Scoped Staging Only:** Run `git -C "$HOME/.config" add <explicit-paths>`. NEVER run `git add -A` or `git add .` (preserves unstaged local overrides such as `btop/btop.conf`, `pavucontrol.ini`, or machine-local `home-manager/flake.nix`).
3. **Secret & Size Gate:** Confirm `git -C "$HOME/.config" diff --cached` contains zero secrets, tokens, or files `>= 10 MiB`.
4. **Conventional Commit & Push:**
   ```bash
   git -C "$HOME/.config" commit -m "<type>(<scope>): <summary>"
   GIT_TERMINAL_PROMPT=0 git -C "$HOME/.config" push origin main
   ```
5. **Cloud Config Backup:** Trigger 1-way sync and verify `status=0/SUCCESS`:
   ```bash
   systemctl --user start rclone-config-sync.service
   systemctl --user status rclone-config-sync.service --no-pager
   ```
