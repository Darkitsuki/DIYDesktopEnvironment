# Nix Home Manager, Systemd & GitOps Rules

Applies when editing `home-manager/flake.nix`, `home-manager/home.nix`, `systemd/user/*`, or sync scripts.

## Home Manager `mkOutOfStoreSymlink` Rules

- **Direct Symlinks:** `home.nix` maps `xdg.configFile."<target>".source` via `config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.config/home-manager/dotfiles/<target>"` so live edits take effect without rebuilding Nix store derivations.
- **No `recursive = true` on Directory Symlinks:** Never add `recursive = true` to directory `mkOutOfStoreSymlink` entries (it breaks whole-directory symlinking and causes file-level store conflicts).
- **Flake Visibility:** Nix flakes only read Git-tracked files. Stage new files (`git -C "$HOME/.config" add <path>`) BEFORE running `home-manager switch --flake "$HOME/.config/home-manager#$USER"`.
- **Local Machine Overrides:** `home-manager/flake.nix` sets `username = "HoaHung";` and `.gitignore` excludes `machine-config.env` and `home-manager/dotfiles/hypr/machine-local.lua`. Keep machine-specific edits unstaged unless intentionally updating defaults, and never run `git add -A` or `git add .`.

## Systemd User Units & GPU Affinity

- `systemd/` is gitignored; verify unit syntax locally before reloading:
  ```bash
  systemd-analyze --user verify "$HOME/.config/systemd/user/"*.service "$HOME/.config/systemd/user/"*.timer
  systemctl --user daemon-reload
  ```
- Keep `quickshell.service` (`QT_QPA_PLATFORM=wayland`, `QSG_RHI_BACKEND=opengl`, `QT_QPA_PLATFORMTHEME=gtk3`) and `ags.service` bound to `graphical-session.target` with Intel Iris Xe affinity (`MESA_VK_DEVICE_SELECT=8086:46a6!`, `__EGL_VENDOR_LIBRARY_FILENAMES=/usr/share/glvnd/egl_vendor.d/50_mesa.json`) so RTX 3050 Ti remains in `D3cold`.

## 2-Layer Backup Architecture (`rclone`)

| Layer | Units & Schedule | Script & Behavior |
| :--- | :--- | :--- |
| **1. Config -> Cloud (1-way)** | `rclone-config-sync.service` + `.timer` (`6h`, `OnBootSec=3min`) | `~/.local/bin/sync-config-gdrive.sh`: `rclone sync ~/.config "Google Drive:.config"` with `--exclude-from ~/.config/rclone/config-backup-exclude.txt`, `--max-delete 100`, `flock` |
| **2. Cloud <-> SD Card (2-way)** | `rclone-gdrive-sd.service` + `.timer` (`1h`), `rclone-gdrive-sd-fast.service`, `rclone-gdrive-sd-watch.service` (inotify), `sd-card-automount.service` | `~/.local/bin/mirror-gdrive-sd.sh`: `rclone bisync` (`--resilient --recover --conflict-resolve newer --max-delete 50`; `--fast` excludes `/Shared Modpack/**`), auto `--resync` recovery, and `gdrive-emblems.py` GVfs `metadata::emblems` sync badges |

- Never modify or bypass `rclone/config-backup-exclude.txt` or `rclone/rclone.conf`.

## Verification

```bash
systemctl --user status rclone-config-sync.service rclone-gdrive-sd.timer --no-pager
git -C "$HOME/.config" status -s
```
