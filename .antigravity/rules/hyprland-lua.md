# Hyprland 0.57.2 Lua Rules (`home-manager/dotfiles/hypr/`)

Applies when editing `hyprland.lua`, `hyprland-gui.lua`, `hyprlock.conf`, `hyprlauncher.conf`, or `hypr/scripts/`.

## Hyprland 0.57.2 Lua API Conventions

- **Use Native Lua Bindings:** Configure options with `hl.config({...})`, variables with `hl.env(k, v)`, curves with `hl.curve(name, {...})`, animations with `hl.animation({...})`, monitors with `hl.monitor({...})`, and binds with `hl.bind(keys, dispatcher, opts)`.
- **Structured Dispatchers (`hl.dsp.*`):** Prefer `hl.dsp.exec_cmd(...)`, `hl.dsp.window.close()`, `hl.dsp.window.float({ action = "toggle" })`, `hl.dsp.window.fullscreen("0")`, `hl.dsp.window.move({...})`, `hl.dsp.focus({...})`, `hl.dsp.layout(...)` over legacy raw string dispatchers.
- **Rule Tables & Handles:** Use `hl.window_rule({ name = "...", match = { ... }, ... })` and `hl.layer_rule({ name = "...", match = { namespace = "^...$" }, ... })`. Store handles when toggling via `:set_enabled(bool)`.
- **Include Order:** Keep `pcall(require, "machine-local")` (gitignored per-machine overrides) and `require("hyprland-gui")` (HyprMod managed overrides) at the bottom of `hyprland.lua`.
- **Single-Instance Services:** Do NOT start `ags run` or `quickshell` via `hl.on("hyprland.start", ...)` — both run under `systemd/user/` (`graphical-session.target`).

## UWSM Session & Launch Prefix

- `hyprlauncher.conf` MUST preserve `desktop_launch_prefix = uwsm app --` so GUI apps launch in dedicated systemd scopes.
- Session exit commands (`hypr/scripts/powermenu.sh` and AGS `services/system.ts`) MUST check `uwsm check is-active` and run `uwsm stop` before falling back to `hyprctl dispatch exit`.
- GPU routing (`uwsm/env`): Selects `/dev/dri/dgpu:/dev/dri/igpu` when a display is wired to dGPU, or `/dev/dri/igpu:/dev/dri/dgpu` with Mesa EGL/Vulkan/GLX isolation when undocked.

## Layer Rule Invariants

- `quickshellBarBlur` (`match = { namespace = "^quickshell-bar$" }`): Keep `quickshellBarBlur:set_enabled(false)`; use `quickshellBarAnim` (`animation = "fade"`) only.
- `quickshellLauncherBlur` (`^quickshell-launcher$`), `quickshellSnippingBlur` (`^quickshell-snipping$`), `hyprlauncherBlur` (`^hyprlauncher$`): Preserve `blur = true`, `ignore_alpha = 0.25`, `animation = "popin 86%"`.
- `quickSettingsBlur`, `audioMenuBlur`, `powerMenuBlur`: `blur = true`, `ignore_alpha = 0.2`, `animation = "slide top"`; `osdBlur` uses `animation = "slide bottom"`.
- `perfOverlayRule` (`^perf-overlay$`) and `screenshotFreezeNoAnim` (`^(hyprpicker|selection)$`): Keep `blur = false, no_anim = true`.

## Mandatory Keybinding Invariants

| Keybind | Action |
| :--- | :--- |
| `SUPER + R` | `hl.dsp.exec_cmd("quickshell ipc call launcher openApps")` |
| `SUPER + V` | `hl.dsp.window.float({ action = "toggle" })` |
| `SUPER + SHIFT + V` | `hl.dsp.exec_cmd("quickshell ipc call launcher openClipboard")` |
| `SUPER + SHIFT + S` | `hl.dsp.exec_cmd("quickshell ipc call snipping toggle")` |
| `ALT + R` | `hl.dsp.exec_cmd("ags toggle perf-overlay")` |

## Validation

```bash
luac -p "$HOME/.config/home-manager/dotfiles/hypr/hyprland.lua"
hyprctl configerrors
hyprctl layers
```
