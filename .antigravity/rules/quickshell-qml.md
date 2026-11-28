# Quickshell & Qt6 QML Rules (`home-manager/dotfiles/quickshell/`)

Applies when editing `shell.qml`, `Theme.qml`, `qmldir`, or `widgets/*.qml`.

## Qt6 / QtQuick Conventions

- **Strict Component Scoping:** Begin widget files with `pragma ComponentBehavior: Bound` and declare `required property` on delegates (`BarWindow`, `WorkspacesWidget`, `LauncherPopup`, `SnippingOverlay`, `StatusCluster`).
- **Singleton Theme:** Define all colors, fonts, spacing, radii, and bar heights (`barHeight: 30`, `pillHeight: 28`, `radiusLg: 16`) in `Theme.qml` (`pragma Singleton`, registered via `qmldir`: `singleton Theme 1.0 Theme.qml`). Import via `import ".."` in `widgets/`. Never duplicate palette hex values when a `Theme.*` token fits.
- **No `eval`:** Keep arithmetic evaluation strictly parser-based (`evaluateExpression` in `LauncherPopup.qml`).

## Layer-Shell Namespaces & IPC Targets

| Component | `WlrLayershell.namespace` | Layer / Exclusivity |
| :--- | :--- | :--- |
| `BarWindow.qml` | `quickshell-bar` | Default bar (`implicitHeight: Theme.barHeight`) |
| `LauncherPopup.qml` | `quickshell-launcher` | `WlrLayer.Overlay`, `ExclusionMode.Ignore` |
| `SnippingOverlay.qml` | `quickshell-snipping` | `WlrLayer.Overlay`, `ExclusionMode.Ignore` |

- **`IpcHandler` Targets in `shell.qml`:**
  - `target: "launcher"` -> `openApps()`, `openClipboard()`, `toggle()`
  - `target: "snipping"` -> `open()`, `close()`, `toggle()`
  - Preserve method signatures; `hyprland.lua` binds invoke `quickshell ipc call <target> <method>`.

## Clipboard Paste Focus-Release Timing

- In `LauncherPopup.qml`, clipboard activation (`copyAndPasteEntry`) MUST release exclusive Wayland keyboard focus before dispatching paste:
  - **Unpinned:** Set `root.forceHideNow = true` and `close()`, then restart `pasteDispatchTimer` (`85ms`).
  - **Pinned:** Set `root.temporarilyUnfocusedForPaste = true` (switches `WlrLayershell.keyboardFocus` to `WlrKeyboardFocus.None`), restart `pasteDispatchTimer` (`85ms`) and `restoreFocusTimer` (`140ms`).
- `pasteDispatchTimer` inspects `hyprctl activewindow -j` and sends `CTRL SHIFT V` for terminals (`kitty`, `alacritty`, `foot`, `wezterm`, `ghostty`, `konsole`, `gnome-terminal`) or `CTRL V` otherwise (`hl.dsp.send_shortcut` with `wtype` fallback). Never remove these delays or paste will target the popup itself.

## Rollback Target (`waybar`)

- Keep `home-manager/dotfiles/waybar/` and `/usr/lib/systemd/user/waybar.service` intact. Never delete or break `waybar` configs; `waybar-gdrive-sync` is also polled by `StatusCluster.qml`.
- Rollback command: `systemctl --user stop quickshell.service && systemctl --user start waybar.service`.

## Validation

```bash
qmllint "$HOME/.config/home-manager/dotfiles/quickshell/shell.qml" "$HOME/.config/home-manager/dotfiles/quickshell/Theme.qml" "$HOME/.config/home-manager/dotfiles/quickshell/widgets/"*.qml
journalctl --user -u quickshell.service -n 50 --no-pager
lsof /dev/nvidia* /dev/dri/renderD129 2>/dev/null | grep -i quickshell || true
```
