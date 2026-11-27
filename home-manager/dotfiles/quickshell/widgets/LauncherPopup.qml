pragma ComponentBehavior: Bound

import Quickshell
import Quickshell.Hyprland
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Widgets
import QtQuick
import QtQuick.Layouts
import ".."

PanelWindow {
    id: root

    property bool isOpen: false
    property string activeMode: "apps" // "apps" | "clipboard"
    property string viewMode: "list"   // "list" | "grid"
    property int selectedIndex: 0

    property var pinnedAppIds: ({})
    property var clipboardEntries: []
    property bool clipboardLoading: false
    property var decodedPreviews: ({})
    property int previewRevision: 0
    property var previewQueue: []
    property string activePreviewId: ""
    property string activePreviewOutPath: ""

    property bool contextMenuOpen: false
    property string contextMenuKind: ""
    property var contextMenuItem: null
    property real contextMenuAnchorX: 0
    property real contextMenuAnchorY: 0

    readonly property string homeDir: Quickshell.env("HOME") || "/home/HoaHung"
    readonly property string pinsFilePath: homeDir + "/.local/state/quickshell-launcher-pins.json"

    readonly property var focusedScreen: {
        const screens = Quickshell.screens;
        if (!screens || screens.length === 0)
            return null;
        const mon = Hyprland.focusedMonitor;
        if (mon) {
            for (let i = 0; i < screens.length; i++) {
                if (screens[i] && screens[i].name === mon.name)
                    return screens[i];
            }
        }
        return screens[0];
    }

    Component.onCompleted: {
        loadPins();
    }

    // -------------------------------------------------------------------------
    // Safe Arithmetic Evaluator (no eval)
    // -------------------------------------------------------------------------
    function evaluateExpression(rawText) {
        if (!rawText)
            return null;
        const trimmed = rawText.trim();
        if (!trimmed)
            return null;

        const explicit = trimmed.startsWith("=");
        let expr = explicit ? trimmed.slice(1).trim() : trimmed;
        if (!expr)
            return null;

        // Require at least one arithmetic operator or parenthesis unless prefixed with '='
        if (!explicit) {
            if (!/[+\-*/%^()]/.test(expr))
                return null;
            if (!/^[0-9.(+\-\s]/.test(expr))
                return null;
            if (!/^[0-9+\-*/%^().\s]+$/.test(expr))
                return null;
        }

        const normalized = expr.replace(/\*\*/g, "^");
        const tokens = tokenizeMath(normalized);
        if (!tokens || tokens.length === 0)
            return null;

        const state = { pos: 0, tokens: tokens };
        const value = parseAddSub(state);
        if (value === null || state.pos !== tokens.length || !Number.isFinite(value))
            return null;

        const formatted = Math.abs(value - Math.round(value)) < 1e-12
            ? Math.round(value).toString()
            : Number(value.toFixed(10)).toString();

        return {
            expr: expr,
            result: formatted,
            explicit: explicit
        };
    }

    function tokenizeMath(str) {
        const tokens = [];
        let i = 0;
        while (i < str.length) {
            const ch = str[i];
            if (ch === " " || ch === "\t") {
                i++;
                continue;
            }
            if ((ch >= "0" && ch <= "9") || ch === ".") {
                let numStr = "";
                let dots = 0;
                while (i < str.length && ((str[i] >= "0" && str[i] <= "9") || str[i] === ".")) {
                    if (str[i] === ".")
                        dots++;
                    if (dots > 1)
                        return null;
                    numStr += str[i];
                    i++;
                }
                if (numStr === ".")
                    return null;
                const val = Number(numStr);
                if (!Number.isFinite(val))
                    return null;
                tokens.push({ type: "num", value: val });
                continue;
            }
            if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z")) {
                let ident = "";
                while (i < str.length && ((str[i] >= "a" && str[i] <= "z") || (str[i] >= "A" && str[i] <= "Z"))) {
                    ident += str[i].toLowerCase();
                    i++;
                }
                if (ident === "pi")
                    tokens.push({ type: "num", value: Math.PI });
                else if (ident === "e")
                    tokens.push({ type: "num", value: Math.E });
                else if (ident === "sqrt" || ident === "abs" || ident === "round" || ident === "floor" || ident === "ceil")
                    tokens.push({ type: "fn", value: ident });
                else
                    return null;
                continue;
            }
            if ("+-*/%^()".indexOf(ch) !== -1) {
                tokens.push({ type: "op", value: ch });
                i++;
                continue;
            }
            return null;
        }
        return tokens;
    }

    function parseAddSub(state) {
        let left = parseMulDiv(state);
        if (left === null)
            return null;
        while (state.pos < state.tokens.length) {
            const tok = state.tokens[state.pos];
            if (tok.type === "op" && (tok.value === "+" || tok.value === "-")) {
                state.pos++;
                const right = parseMulDiv(state);
                if (right === null)
                    return null;
                left = tok.value === "+" ? (left + right) : (left - right);
            } else {
                break;
            }
        }
        return left;
    }

    function parseMulDiv(state) {
        let left = parsePower(state);
        if (left === null)
            return null;
        while (state.pos < state.tokens.length) {
            const tok = state.tokens[state.pos];
            if (tok.type === "op" && (tok.value === "*" || tok.value === "/" || tok.value === "%")) {
                state.pos++;
                const right = parsePower(state);
                if (right === null)
                    return null;
                if (tok.value === "*")
                    left = left * right;
                else if (tok.value === "/") {
                    if (right === 0)
                        return null;
                    left = left / right;
                } else {
                    if (right === 0)
                        return null;
                    left = left % right;
                }
            } else {
                break;
            }
        }
        return left;
    }

    function parsePower(state) {
        const base = parseUnary(state);
        if (base === null)
            return null;
        if (state.pos < state.tokens.length) {
            const tok = state.tokens[state.pos];
            if (tok.type === "op" && tok.value === "^") {
                state.pos++;
                const exp = parsePower(state);
                if (exp === null)
                    return null;
                return Math.pow(base, exp);
            }
        }
        return base;
    }

    function parseUnary(state) {
        if (state.pos < state.tokens.length) {
            const tok = state.tokens[state.pos];
            if (tok.type === "op" && (tok.value === "+" || tok.value === "-")) {
                state.pos++;
                const inner = parseUnary(state);
                if (inner === null)
                    return null;
                return tok.value === "-" ? -inner : inner;
            }
        }
        return parsePrimary(state);
    }

    function parsePrimary(state) {
        if (state.pos >= state.tokens.length)
            return null;
        const tok = state.tokens[state.pos];
        if (tok.type === "num") {
            state.pos++;
            return tok.value;
        }
        if (tok.type === "fn") {
            state.pos++;
            if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "op" || state.tokens[state.pos].value !== "(")
                return null;
            state.pos++;
            const arg = parseAddSub(state);
            if (arg === null || state.pos >= state.tokens.length || state.tokens[state.pos].type !== "op" || state.tokens[state.pos].value !== ")")
                return null;
            state.pos++;
            if (tok.value === "sqrt")
                return arg < 0 ? null : Math.sqrt(arg);
            if (tok.value === "abs")
                return Math.abs(arg);
            if (tok.value === "round")
                return Math.round(arg);
            if (tok.value === "floor")
                return Math.floor(arg);
            if (tok.value === "ceil")
                return Math.ceil(arg);
            return null;
        }
        if (tok.type === "op" && tok.value === "(") {
            state.pos++;
            const inner = parseAddSub(state);
            if (inner === null || state.pos >= state.tokens.length || state.tokens[state.pos].type !== "op" || state.tokens[state.pos].value !== ")")
                return null;
            state.pos++;
            return inner;
        }
        return null;
    }

    readonly property var calcMatch: root.evaluateExpression(searchInput.text)
    readonly property bool calcTakesEnter: calcMatch !== null && (calcMatch.explicit || activeItems.length === 0)

    // -------------------------------------------------------------------------
    // Persistent App Pinning
    // -------------------------------------------------------------------------
    function loadPins() {
        if (pinsLoadProc.running)
            return;
        pinsLoadProc.command = ["sh", "-c", "[ -r \"$1\" ] && cat \"$1\" || printf '[]'", "_", root.pinsFilePath];
        pinsLoadProc.running = true;
    }

    function savePins(pinsMap) {
        const ids = Object.keys(pinsMap);
        const payload = JSON.stringify(ids);
        pinsSaveProc.command = [
            "sh", "-c",
            "mkdir -p \"$(dirname \"$1\")\" && printf '%s\\n' \"$2\" > \"$1\"",
            "_", root.pinsFilePath, payload
        ];
        pinsSaveProc.running = true;
    }

    function isAppPinned(desktopId) {
        return !!(desktopId && root.pinnedAppIds[desktopId]);
    }

    function toggleAppPin(appItem) {
        if (!appItem || !appItem.id)
            return;
        const updated = Object.assign({}, root.pinnedAppIds);
        if (updated[appItem.id])
            delete updated[appItem.id];
        else
            updated[appItem.id] = true;
        root.pinnedAppIds = updated;
        savePins(updated);
    }

    // -------------------------------------------------------------------------
    // Apps & Clipboard Models
    // -------------------------------------------------------------------------
    function pickCategory(categories) {
        if (!categories || categories.length === 0)
            return "";
        const skip = {
            "GTK": true, "Qt": true, "Application": true, "Core": true,
            "GNOME": true, "KDE": true, "XFCE": true, "ConsoleOnly": true
        };
        for (let i = 0; i < categories.length; i++) {
            const cat = categories[i];
            if (!cat || skip[cat] || cat.startsWith("X-"))
                continue;
            return cat;
        }
        return "";
    }

    readonly property var filteredApps: {
        const all = DesktopEntries.applications.values;
        const pins = root.pinnedAppIds;
        const q = searchInput.text.trim().toLowerCase();
        const matches = [];

        for (let i = 0; i < all.length; i++) {
            const entry = all[i];
            if (!entry || entry.noDisplay)
                continue;

            const name = entry.name || "";
            const genericName = entry.genericName || "";
            const comment = entry.comment || "";
            const id = entry.id || "";
            const keywords = entry.keywords ? entry.keywords.join(" ") : "";

            let rank = 0;
            if (q.length > 0) {
                const nameL = name.toLowerCase();
                const genericL = genericName.toLowerCase();
                const commentL = comment.toLowerCase();
                const kwL = keywords.toLowerCase();
                const idL = id.toLowerCase();

                if (nameL === q)
                    rank = 0;
                else if (nameL.startsWith(q))
                    rank = 1;
                else if (nameL.indexOf(" " + q) !== -1 || nameL.indexOf("-" + q) !== -1)
                    rank = 2;
                else if (nameL.indexOf(q) !== -1)
                    rank = 3;
                else if (genericL.indexOf(q) !== -1 || kwL.indexOf(q) !== -1 || idL.indexOf(q) !== -1)
                    rank = 4;
                else if (commentL.indexOf(q) !== -1)
                    rank = 5;
                else
                    continue;
            }

            const execCmd = entry.execString || (entry.command && entry.command.length > 0 ? entry.command.join(" ") : "");

            matches.push({
                entry: entry,
                id: id,
                name: name || id,
                subtitle: comment || genericName || id,
                category: root.pickCategory(entry.categories),
                iconName: entry.icon || "",
                execCommand: execCmd,
                pinned: !!(id && pins[id]),
                rank: rank
            });
        }

        matches.sort(function(a, b) {
            if (a.pinned !== b.pinned)
                return a.pinned ? -1 : 1;
            if (a.rank !== b.rank)
                return a.rank - b.rank;
            return a.name.localeCompare(b.name);
        });

        return matches;
    }

    readonly property var filteredClipboard: {
        const q = searchInput.text.trim().toLowerCase();
        if (!q)
            return root.clipboardEntries;
        const matches = [];
        for (let i = 0; i < root.clipboardEntries.length; i++) {
            const item = root.clipboardEntries[i];
            if (item.searchText.indexOf(q) !== -1)
                matches.push(item);
        }
        return matches;
    }

    readonly property var activeItems: root.activeMode === "apps" ? root.filteredApps : root.filteredClipboard
    readonly property var selectedClipboardItem: {
        if (root.activeMode !== "clipboard")
            return null;
        if (root.selectedIndex < 0 || root.selectedIndex >= root.filteredClipboard.length)
            return null;
        return root.filteredClipboard[root.selectedIndex];
    }

    onSelectedClipboardItemChanged: {
        if (selectedClipboardItem && selectedClipboardItem.isImage)
            root.requestImagePreview(selectedClipboardItem);
    }

    // -------------------------------------------------------------------------
    // Clipboard Parsing & Decoding
    // -------------------------------------------------------------------------
    function parseClipboardLine(line) {
        const tabIdx = line.indexOf("\t");
        if (tabIdx === -1)
            return null;
        const id = line.slice(0, tabIdx).trim();
        const preview = line.slice(tabIdx + 1);
        const trimmed = preview.trim();
        if (!id)
            return null;

        let kind = "TEXT";
        let isImage = false;
        let imageMeta = "";
        let displayTitle = trimmed;

        const imgMatch = trimmed.match(/^\[\[\s*binary data\s+(.+?)\s*\]\]$/i);
        if (imgMatch) {
            const meta = imgMatch[1].trim();
            if (/\b(png|jpe?g|webp|gif|bmp|tiff|avif|ico|svg)\b/i.test(meta)) {
                kind = "IMAGE";
                isImage = true;
                imageMeta = meta;
                displayTitle = "Image  •  " + meta;
            }
        } else if (/^(https?:\/\/|www\.|ftp:\/\/|file:\/\/)\S+/i.test(trimmed)) {
            kind = "URL";
        } else if (
            /^#!/.test(trimmed) ||
            /^(const|let|var|function|import|export|class|def|fn|pub|struct|enum|SELECT|INSERT|UPDATE|DELETE|systemctl|hyprctl|git|nix|sudo)\b/.test(trimmed) ||
            /(=>|::|&&|\|\||<\/[a-zA-Z]+>|\$\{[A-Za-z_])/.test(trimmed) ||
            (/[{}();]/.test(trimmed) && /[=<>+\-*/]/.test(trimmed))
        ) {
            kind = "CODE";
        }

        return {
            id: id,
            rawLine: line,
            preview: preview,
            displayTitle: displayTitle,
            kind: kind,
            isImage: isImage,
            imageMeta: imageMeta,
            searchText: (displayTitle + " " + preview + " " + kind).toLowerCase()
        };
    }

    function parseClipboardOutput(rawText) {
        const lines = rawText.split("\n");
        const parsed = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line || line.trim().length === 0)
                continue;
            const item = parseClipboardLine(line);
            if (item)
                parsed.push(item);
        }
        root.clipboardEntries = parsed;
        if (root.selectedIndex >= parsed.length)
            root.selectedIndex = Math.max(0, parsed.length - 1);
        if (root.activeMode === "clipboard" && parsed.length > 0 && parsed[0].isImage)
            root.requestImagePreview(parsed[0]);
    }

    function refreshClipboard() {
        if (clipListProc.running)
            return;
        root.clipboardLoading = true;
        clipListProc.running = true;
    }

    function requestImagePreview(item) {
        if (!item || !item.isImage || !item.id)
            return;
        if (root.decodedPreviews[item.id] !== undefined)
            return;
        if (root.activePreviewId === item.id)
            return;
        for (let i = 0; i < root.previewQueue.length; i++) {
            if (root.previewQueue[i].id === item.id)
                return;
        }
        const nextQueue = root.previewQueue.slice();
        nextQueue.push({ id: item.id, rawLine: item.rawLine });
        root.previewQueue = nextQueue;
        processNextPreview();
    }

    function processNextPreview() {
        if (previewDecoderProc.running || root.previewQueue.length === 0)
            return;
        const queueCopy = root.previewQueue.slice();
        let nextIdx = 0;
        if (root.selectedClipboardItem) {
            for (let i = 0; i < queueCopy.length; i++) {
                if (queueCopy[i].id === root.selectedClipboardItem.id) {
                    nextIdx = i;
                    break;
                }
            }
        }
        const next = queueCopy.splice(nextIdx, 1)[0];
        root.previewQueue = queueCopy;
        root.activePreviewId = next.id;
        root.activePreviewOutPath = "/tmp/qs-cliphist-preview-" + next.id + ".png";
        previewDecoderProc.command = [
            "sh", "-c",
            "out=\"$1\"; [ -s \"$out\" ] || printf '%s\\n' \"$2\" | cliphist decode > \"$out\"",
            "_", root.activePreviewOutPath, next.rawLine
        ];
        previewDecoderProc.running = true;
    }

    function previewSourceFor(itemId) {
        // Bind dependency to previewRevision so delegates update when decode completes
        const _rev = root.previewRevision;
        if (!itemId)
            return "";
        const val = root.decodedPreviews[itemId];
        if (!val || val === "error")
            return "";
        return val;
    }

    // -------------------------------------------------------------------------
    // Processes
    // -------------------------------------------------------------------------
    Process {
        id: pinsLoadProc
        stdout: StdioCollector {
            onStreamFinished: {
                const raw = text.trim();
                if (!raw) {
                    root.pinnedAppIds = ({});
                    return;
                }
                try {
                    const parsed = JSON.parse(raw);
                    const map = {};
                    if (Array.isArray(parsed)) {
                        for (let i = 0; i < parsed.length; i++) {
                            if (typeof parsed[i] === "string" && parsed[i].length > 0)
                                map[parsed[i]] = true;
                        }
                    }
                    root.pinnedAppIds = map;
                } catch (e) {
                    root.pinnedAppIds = ({});
                }
            }
        }
    }

    Process {
        id: pinsSaveProc
    }

    Process {
        id: clipListProc
        command: ["cliphist", "list"]
        stdout: StdioCollector {
            onStreamFinished: {
                root.parseClipboardOutput(text);
                root.clipboardLoading = false;
            }
        }
        onExited: function(exitCode) {
            if (exitCode !== 0) {
                root.clipboardEntries = [];
                root.clipboardLoading = false;
            }
        }
    }

    Process {
        id: previewDecoderProc
        onExited: function(exitCode) {
            const updated = Object.assign({}, root.decodedPreviews);
            updated[root.activePreviewId] = (exitCode === 0) ? ("file://" + root.activePreviewOutPath) : "error";
            root.decodedPreviews = updated;
            root.previewRevision += 1;
            root.activePreviewId = "";
            root.processNextPreview();
        }
    }

    Process {
        id: clipDeleteProc
        onExited: function() {
            root.refreshClipboard();
        }
    }

    Process {
        id: clipWipeProc
        onExited: function() {
            root.clipboardEntries = [];
            root.selectedIndex = 0;
        }
    }

    // -------------------------------------------------------------------------
    // Context Menu Actions & Helpers
    // -------------------------------------------------------------------------
    readonly property var contextMenuActions: {
        if (!root.contextMenuItem)
            return [];
        if (root.contextMenuKind === "apps") {
            const app = root.contextMenuItem;
            return [
                {
                    id: "app_open",
                    label: "Open",
                    icon: "󰏌",
                    destructive: false
                },
                {
                    id: "app_pin",
                    label: app.pinned ? "Unpin" : "Pin to Top",
                    icon: app.pinned ? "󰐄" : "󰐃",
                    destructive: false
                },
                {
                    id: "app_copy_cmd",
                    label: "Copy Command",
                    icon: "",
                    destructive: false
                },
                {
                    id: "app_copy_id",
                    label: "Copy Desktop ID",
                    icon: "󰌷",
                    destructive: false
                }
            ];
        }
        if (root.contextMenuKind === "clipboard") {
            const clip = root.contextMenuItem;
            const actions = [
                {
                    id: "clip_copy",
                    label: "Copy to Clipboard",
                    icon: "󰆏",
                    destructive: false
                }
            ];
            if (clip.kind === "TEXT" || clip.kind === "URL" || clip.kind === "CODE") {
                actions.push({
                    id: "clip_copy_trimmed",
                    label: "Copy Trimmed Text",
                    icon: "󰃢",
                    destructive: false
                });
            }
            if (clip.kind === "URL") {
                actions.push({
                    id: "clip_open_url",
                    label: "Open in Browser",
                    icon: "󰖟",
                    destructive: false
                });
            }
            if (clip.isImage) {
                actions.push({
                    id: "clip_save_image",
                    label: "Save Image to Pictures",
                    icon: "󰋩",
                    destructive: false
                });
            }
            actions.push({
                id: "clip_delete",
                label: "Delete Entry",
                icon: "",
                destructive: true
            });
            actions.push({
                id: "clip_wipe",
                label: "Clear All History",
                icon: "󰃨",
                destructive: true
            });
            return actions;
        }
        return [];
    }

    function openContextMenu(kind, item, sourceItem, localX, localY) {
        if (!item || !sourceItem)
            return;
        const mapped = sourceItem.mapToItem(paletteCard, localX, localY);
        root.contextMenuKind = kind;
        root.contextMenuItem = item;
        root.contextMenuAnchorX = mapped.x;
        root.contextMenuAnchorY = mapped.y;
        root.contextMenuOpen = true;
        searchInput.forceActiveFocus();
    }

    function closeContextMenu() {
        root.contextMenuOpen = false;
    }

    function runContextAction(actionId) {
        const item = root.contextMenuItem;
        closeContextMenu();
        if (!item)
            return;

        if (actionId === "app_open") {
            activateAppItem(item);
        } else if (actionId === "app_pin") {
            toggleAppPin(item);
            searchInput.forceActiveFocus();
        } else if (actionId === "app_copy_cmd") {
            copyTextToClipboard(item.execCommand || item.name);
            close();
        } else if (actionId === "app_copy_id") {
            copyTextToClipboard(item.id || item.name);
            close();
        } else if (actionId === "clip_copy") {
            activateClipboardItem(item);
        } else if (actionId === "clip_copy_trimmed") {
            Quickshell.execDetached([
                "sh", "-c",
                "printf '%s\\n' \"$1\" | cliphist decode | python3 -c 'import sys; sys.stdout.write(sys.stdin.read().strip())' | wl-copy",
                "_", item.rawLine
            ]);
            close();
        } else if (actionId === "clip_open_url") {
            Quickshell.execDetached([
                "sh", "-c",
                "url=$(printf '%s\\n' \"$1\" | cliphist decode | python3 -c 'import sys; sys.stdout.write(sys.stdin.read().strip())'); [ -n \"$url\" ] && exec xdg-open \"$url\"",
                "_", item.rawLine
            ]);
            close();
        } else if (actionId === "clip_save_image") {
            Quickshell.execDetached([
                "sh", "-c",
                "mkdir -p \"$HOME/Pictures\" && fname=\"Clipboard-$(date +%Y%m%d-%H%M%S).png\" && out=\"$HOME/Pictures/$fname\" && printf '%s\\n' \"$1\" | cliphist decode > \"$out\" && if command -v notify-send >/dev/null 2>&1; then notify-send -u low -t 3000 \"Clipboard\" \"Image saved to ~/Pictures/$fname\"; fi",
                "_", item.rawLine
            ]);
            close();
        } else if (actionId === "clip_delete") {
            deleteClipboardItem(item);
            searchInput.forceActiveFocus();
        } else if (actionId === "clip_wipe") {
            wipeClipboard();
            searchInput.forceActiveFocus();
        }
    }

    // -------------------------------------------------------------------------
    // Mode / View / Open / Close / Actions
    // -------------------------------------------------------------------------
    function openMode(mode) {
        const targetMode = (mode === "clipboard") ? "clipboard" : "apps";
        closeContextMenu();
        if (root.isOpen) {
            if (root.activeMode === targetMode) {
                close();
                return;
            }
            switchMode(targetMode);
            return;
        }

        root.activeMode = targetMode;
        searchInput.text = "";
        root.selectedIndex = 0;
        if (targetMode === "clipboard")
            refreshClipboard();
        root.isOpen = true;
        focusTimer.restart();
    }

    function toggleCurrent() {
        if (root.isOpen)
            close();
        else
            openMode(root.activeMode);
    }

    function switchMode(mode) {
        const targetMode = (mode === "clipboard") ? "clipboard" : "apps";
        closeContextMenu();
        if (root.activeMode === targetMode) {
            searchInput.forceActiveFocus();
            return;
        }
        root.activeMode = targetMode;
        root.selectedIndex = 0;
        if (targetMode === "clipboard")
            refreshClipboard();
        syncViewScroll();
        searchInput.forceActiveFocus();
    }

    function setViewMode(mode) {
        const targetView = (mode === "grid") ? "grid" : "list";
        closeContextMenu();
        if (root.viewMode !== targetView) {
            root.viewMode = targetView;
            syncViewScroll();
        }
        searchInput.forceActiveFocus();
    }

    function toggleViewMode() {
        setViewMode(root.viewMode === "list" ? "grid" : "list");
    }

    function syncViewScroll() {
        const idx = root.selectedIndex;
        if (idx < 0 || idx >= root.activeItems.length)
            return;
        if (root.viewMode === "list")
            resultsList.positionViewAtIndex(idx, ListView.Contain);
        else
            resultsGrid.positionViewAtIndex(idx, GridView.Contain);
    }

    function close() {
        closeContextMenu();
        root.isOpen = false;
    }

    function moveSelection(delta) {
        const total = root.activeItems.length;
        if (total <= 0)
            return;
        const next = Math.max(0, Math.min(total - 1, root.selectedIndex + delta));
        root.selectedIndex = next;
        syncViewScroll();
    }

    function copyTextToClipboard(text) {
        if (!text)
            return;
        Quickshell.execDetached(["sh", "-c", "printf '%s' \"$1\" | wl-copy", "_", text]);
    }

    function copyCalcResult() {
        if (!root.calcMatch)
            return;
        copyTextToClipboard(root.calcMatch.result);
        close();
    }

    function activateAppItem(item) {
        if (!item || !item.entry)
            return;
        item.entry.execute();
        close();
    }

    function activateClipboardItem(item) {
        if (!item || !item.rawLine)
            return;
        Quickshell.execDetached([
            "sh", "-c",
            "printf '%s\\n' \"$1\" | cliphist decode | wl-copy",
            "_", item.rawLine
        ]);
        close();
    }

    function deleteClipboardItem(item) {
        if (!item || !item.rawLine || clipDeleteProc.running || clipWipeProc.running)
            return;
        const updated = Object.assign({}, root.decodedPreviews);
        delete updated[item.id];
        root.decodedPreviews = updated;
        clipDeleteProc.command = [
            "sh", "-c",
            "printf '%s\\n' \"$1\" | cliphist delete && rm -f -- \"/tmp/qs-cliphist-preview-$2.png\"",
            "_", item.rawLine, item.id
        ];
        clipDeleteProc.running = true;
    }

    function wipeClipboard() {
        if (clipWipeProc.running || clipDeleteProc.running)
            return;
        root.decodedPreviews = ({});
        root.previewQueue = [];
        clipWipeProc.command = [
            "sh", "-c",
            "cliphist wipe && rm -f /tmp/qs-cliphist-preview-*.png && if command -v notify-send >/dev/null 2>&1; then notify-send -u low -t 2000 \"Clipboard\" \"History cleared\"; fi"
        ];
        clipWipeProc.running = true;
    }

    function activateCurrent() {
        if (root.calcTakesEnter) {
            copyCalcResult();
            return;
        }
        const items = root.activeItems;
        if (items.length === 0 || root.selectedIndex < 0 || root.selectedIndex >= items.length)
            return;
        const item = items[root.selectedIndex];
        if (root.activeMode === "apps")
            activateAppItem(item);
        else
            activateClipboardItem(item);
    }

    function handleKeyPress(event) {
        const ctrl = (event.modifiers & Qt.ControlModifier) !== 0;

        if (event.key === Qt.Key_Escape) {
            event.accepted = true;
            if (root.contextMenuOpen)
                closeContextMenu();
            else
                close();
            return;
        }

        if (ctrl && event.key === Qt.Key_G) {
            event.accepted = true;
            toggleViewMode();
            return;
        }

        if (root.contextMenuOpen)
            closeContextMenu();

        if (event.key === Qt.Key_Tab || event.key === Qt.Key_Backtab) {
            event.accepted = true;
            switchMode(root.activeMode === "apps" ? "clipboard" : "apps");
        } else if (root.viewMode === "grid") {
            const cols = root.activeMode === "apps" ? 4 : 2;
            if (event.key === Qt.Key_Down || (ctrl && (event.key === Qt.Key_N || event.key === Qt.Key_J))) {
                event.accepted = true;
                moveSelection(cols);
            } else if (event.key === Qt.Key_Up || (ctrl && (event.key === Qt.Key_P || event.key === Qt.Key_K))) {
                event.accepted = true;
                moveSelection(-cols);
            } else if (event.key === Qt.Key_Right && (searchInput.text.length === 0 || ctrl || (searchInput.cursorPosition === searchInput.text.length && searchInput.selectedText.length === 0))) {
                event.accepted = true;
                moveSelection(1);
            } else if (event.key === Qt.Key_Left && (searchInput.text.length === 0 || ctrl || (searchInput.cursorPosition === 0 && searchInput.selectedText.length === 0))) {
                event.accepted = true;
                moveSelection(-1);
            } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
                event.accepted = true;
                activateCurrent();
            } else if (event.key === Qt.Key_Delete && root.activeMode === "clipboard") {
                event.accepted = true;
                if (root.selectedClipboardItem)
                    deleteClipboardItem(root.selectedClipboardItem);
            }
        } else {
            if (event.key === Qt.Key_Down || (ctrl && (event.key === Qt.Key_N || event.key === Qt.Key_J))) {
                event.accepted = true;
                moveSelection(1);
            } else if (event.key === Qt.Key_Up || (ctrl && (event.key === Qt.Key_P || event.key === Qt.Key_K))) {
                event.accepted = true;
                moveSelection(-1);
            } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
                event.accepted = true;
                activateCurrent();
            } else if (event.key === Qt.Key_Delete && root.activeMode === "clipboard") {
                event.accepted = true;
                if (root.selectedClipboardItem)
                    deleteClipboardItem(root.selectedClipboardItem);
            }
        }
    }

    function badgeColorFor(kind) {
        if (kind === "IMAGE")
            return Theme.mauve;
        if (kind === "URL")
            return Theme.accent;
        if (kind === "CODE")
            return Theme.green;
        return Theme.subtext0;
    }

    function badgeIconFor(kind) {
        if (kind === "IMAGE")
            return "󰋩";
        if (kind === "URL")
            return "󰖟";
        if (kind === "CODE")
            return "";
        return "󰈙";
    }

    Timer {
        id: focusTimer
        interval: 16
        repeat: false
        onTriggered: {
            if (root.isOpen)
                searchInput.forceActiveFocus();
        }
    }

    onVisibleChanged: {
        if (visible && root.isOpen)
            focusTimer.restart();
    }

    // -------------------------------------------------------------------------
    // Layer-Shell Window Configuration
    // -------------------------------------------------------------------------
    visible: root.isOpen || paletteCard.opacity > 0.01
    color: "transparent"
    screen: root.focusedScreen

    WlrLayershell.namespace: "quickshell-launcher"
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: root.isOpen ? WlrKeyboardFocus.Exclusive : WlrKeyboardFocus.None
    WlrLayershell.exclusionMode: ExclusionMode.Ignore

    anchors {
        top: true
        bottom: true
        left: true
        right: true
    }

    // Transparent backdrop area: clicking outside closes the palette
    MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton
        onClicked: root.close()
    }

    // Centered floating One UI palette container (680 x 460 px)
    Rectangle {
        id: paletteCard

        anchors.centerIn: parent
        width: 680
        height: 460
        radius: Theme.radiusLg
        color: Theme.baseTranslucent
        border.width: Theme.borderWidth
        border.color: Theme.borderColor
        clip: true

        opacity: root.isOpen ? 1.0 : 0.0
        scale: root.isOpen ? 1.0 : 0.96

        Behavior on opacity {
            NumberAnimation {
                duration: 240
                easing.type: Easing.OutQuint
            }
        }

        Behavior on scale {
            NumberAnimation {
                duration: 240
                easing.type: Easing.OutQuint
            }
        }

        transform: Translate {
            y: root.isOpen ? 0 : 12

            Behavior on y {
                NumberAnimation {
                    duration: 240
                    easing.type: Easing.OutQuint
                }
            }
        }

        // Absorb clicks inside the container so they don't hit the backdrop
        MouseArea {
            anchors.fill: parent
            acceptedButtons: Qt.AllButtons
            onClicked: function(mouse) {
                mouse.accepted = true;
                if (root.contextMenuOpen)
                    root.closeContextMenu();
            }
        }

        ColumnLayout {
            anchors.fill: parent
            anchors.bottomMargin: Theme.spaceSm
            spacing: 0

            // -----------------------------------------------------------------
            // Zone 1: Unified Header Bar (Search + View Toggle + Mode Switcher)
            // -----------------------------------------------------------------
            Rectangle {
                Layout.fillWidth: true
                implicitHeight: 64
                color: "transparent"

                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: Theme.spaceMd
                    anchors.rightMargin: Theme.spaceMd
                    anchors.topMargin: Theme.spaceMd
                    anchors.bottomMargin: Theme.spaceMd
                    spacing: Theme.spaceSm

                    // Search Input Pill
                    Rectangle {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        radius: Theme.radiusMd
                        color: Theme.surface0
                        border.width: Theme.borderWidth
                        border.color: searchInput.activeFocus ? Theme.accent : Theme.surface1

                        Behavior on border.color {
                            ColorAnimation { duration: 180 }
                        }

                        RowLayout {
                            anchors.fill: parent
                            anchors.leftMargin: Theme.spaceMd
                            anchors.rightMargin: Theme.spaceSm
                            spacing: Theme.spaceSm

                            Text {
                                text: ""
                                font.family: Theme.fontFamily
                                font.pixelSize: Theme.iconSizeMd
                                color: searchInput.activeFocus ? Theme.accent : Theme.subtext0

                                Behavior on color {
                                    ColorAnimation { duration: 180 }
                                }
                            }

                            Item {
                                Layout.fillWidth: true
                                Layout.fillHeight: true
                                clip: true

                                Text {
                                    anchors.verticalCenter: parent.verticalCenter
                                    anchors.left: parent.left
                                    anchors.right: parent.right
                                    visible: searchInput.text.length === 0
                                    text: root.activeMode === "apps"
                                          ? "Search apps or type = to calculate..."
                                          : "Search clipboard history..."
                                    font.family: Theme.fontFamilySans
                                    font.pixelSize: Theme.fontSizeMd
                                    color: Theme.overlay1
                                    elide: Text.ElideRight
                                }

                                TextInput {
                                    id: searchInput
                                    anchors.verticalCenter: parent.verticalCenter
                                    anchors.left: parent.left
                                    anchors.right: parent.right
                                    color: Theme.text
                                    selectionColor: Theme.accentActive
                                    selectedTextColor: Theme.crust
                                    font.family: Theme.fontFamilySans
                                    font.pixelSize: Theme.fontSizeLg
                                    clip: true

                                    onTextChanged: {
                                        if (root.activeMode === "apps" && text.startsWith("cb ")) {
                                            const remainder = text.slice(3);
                                            root.switchMode("clipboard");
                                            text = remainder;
                                            return;
                                        }
                                        root.selectedIndex = 0;
                                    }

                                    Keys.onPressed: function(event) {
                                        root.handleKeyPress(event);
                                    }
                                }
                            }

                            // Clear Query Button
                            Rectangle {
                                visible: searchInput.text.length > 0
                                implicitWidth: 24
                                implicitHeight: 24
                                radius: Theme.radiusPill
                                color: clearMouse.containsMouse ? Theme.surface1 : "transparent"

                                Text {
                                    anchors.centerIn: parent
                                    text: ""
                                    font.family: Theme.fontFamily
                                    font.pixelSize: Theme.fontSizeSm
                                    color: clearMouse.containsMouse ? Theme.text : Theme.subtext0
                                }

                                MouseArea {
                                    id: clearMouse
                                    anchors.fill: parent
                                    hoverEnabled: true
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: {
                                        searchInput.text = "";
                                        searchInput.forceActiveFocus();
                                    }
                                }
                            }
                        }
                    }

                    // Segmented View Toggle Pill (List / Grid, Ctrl+G)
                    Rectangle {
                        id: viewSwitcher
                        implicitWidth: 70
                        Layout.fillHeight: true
                        radius: Theme.radiusPill
                        color: Theme.surface0
                        border.width: Theme.borderWidth
                        border.color: Theme.surface1

                        Rectangle {
                            id: viewIndicator
                            y: 3
                            height: parent.height - 6
                            width: (parent.width - 6) / 2
                            x: root.viewMode === "list" ? 3 : 3 + width
                            radius: Theme.radiusPill
                            color: Theme.accentActive

                            Behavior on x {
                                NumberAnimation {
                                    duration: 240
                                    easing.type: Easing.OutQuint
                                }
                            }
                        }

                        Row {
                            anchors.fill: parent
                            anchors.margins: 3

                            Item {
                                width: parent.width / 2
                                height: parent.height

                                Text {
                                    anchors.centerIn: parent
                                    text: ""
                                    font.family: Theme.fontFamily
                                    font.pixelSize: Theme.fontSizeMd
                                    color: root.viewMode === "list" ? Theme.crust : Theme.subtext0

                                    Behavior on color {
                                        ColorAnimation { duration: 180 }
                                    }
                                }

                                MouseArea {
                                    anchors.fill: parent
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: root.setViewMode("list")
                                }
                            }

                            Item {
                                width: parent.width / 2
                                height: parent.height

                                Text {
                                    anchors.centerIn: parent
                                    text: "󰕰"
                                    font.family: Theme.fontFamily
                                    font.pixelSize: Theme.fontSizeMd
                                    color: root.viewMode === "grid" ? Theme.crust : Theme.subtext0

                                    Behavior on color {
                                        ColorAnimation { duration: 180 }
                                    }
                                }

                                MouseArea {
                                    anchors.fill: parent
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: root.setViewMode("grid")
                                }
                            }
                        }
                    }

                    // Segmented Pill Mode Switcher (Apps | Clipboard)
                    Rectangle {
                        id: tabSwitcher
                        implicitWidth: 244
                        Layout.fillHeight: true
                        radius: Theme.radiusPill
                        color: Theme.surface0
                        border.width: Theme.borderWidth
                        border.color: Theme.surface1

                        Rectangle {
                            id: tabIndicator
                            y: 3
                            height: parent.height - 6
                            width: (parent.width - 6) / 2
                            x: root.activeMode === "apps" ? 3 : 3 + width
                            radius: Theme.radiusPill
                            color: Theme.accentActive

                            Behavior on x {
                                NumberAnimation {
                                    duration: 240
                                    easing.type: Easing.OutQuint
                                }
                            }
                        }

                        Row {
                            anchors.fill: parent
                            anchors.margins: 3

                            Item {
                                width: parent.width / 2
                                height: parent.height

                                Row {
                                    anchors.centerIn: parent
                                    spacing: 5

                                    Text {
                                        anchors.verticalCenter: parent.verticalCenter
                                        text: "󰀻 Apps"
                                        font.family: Theme.fontFamily
                                        font.pixelSize: Theme.fontSizeSm
                                        font.weight: root.activeMode === "apps" ? Font.Bold : Font.Medium
                                        color: root.activeMode === "apps" ? Theme.crust : Theme.subtext0

                                        Behavior on color {
                                            ColorAnimation { duration: 180 }
                                        }
                                    }

                                    Rectangle {
                                        anchors.verticalCenter: parent.verticalCenter
                                        visible: root.filteredApps.length > 0
                                        implicitHeight: 16
                                        implicitWidth: appsCountText.implicitWidth + 8
                                        radius: Theme.radiusPill
                                        color: root.activeMode === "apps"
                                               ? Qt.rgba(17 / 255, 17 / 255, 27 / 255, 0.22)
                                               : Theme.surface1

                                        Text {
                                            id: appsCountText
                                            anchors.centerIn: parent
                                            text: root.filteredApps.length.toString()
                                            font.family: Theme.fontFamily
                                            font.pixelSize: 9
                                            font.weight: Font.Bold
                                            color: root.activeMode === "apps" ? Theme.crust : Theme.subtext0
                                        }
                                    }
                                }

                                MouseArea {
                                    anchors.fill: parent
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: root.switchMode("apps")
                                }
                            }

                            Item {
                                width: parent.width / 2
                                height: parent.height

                                Row {
                                    anchors.centerIn: parent
                                    spacing: 5

                                    Text {
                                        anchors.verticalCenter: parent.verticalCenter
                                        text: "󰅌 Clipboard"
                                        font.family: Theme.fontFamily
                                        font.pixelSize: Theme.fontSizeSm
                                        font.weight: root.activeMode === "clipboard" ? Font.Bold : Font.Medium
                                        color: root.activeMode === "clipboard" ? Theme.crust : Theme.subtext0

                                        Behavior on color {
                                            ColorAnimation { duration: 180 }
                                        }
                                    }

                                    Rectangle {
                                        anchors.verticalCenter: parent.verticalCenter
                                        visible: root.clipboardEntries.length > 0
                                        implicitHeight: 16
                                        implicitWidth: clipCountText.implicitWidth + 8
                                        radius: Theme.radiusPill
                                        color: root.activeMode === "clipboard"
                                               ? Qt.rgba(17 / 255, 17 / 255, 27 / 255, 0.22)
                                               : Theme.surface1

                                        Text {
                                            id: clipCountText
                                            anchors.centerIn: parent
                                            text: (root.activeMode === "clipboard"
                                                   ? root.filteredClipboard.length
                                                   : root.clipboardEntries.length).toString()
                                            font.family: Theme.fontFamily
                                            font.pixelSize: 9
                                            font.weight: Font.Bold
                                            color: root.activeMode === "clipboard" ? Theme.crust : Theme.subtext0
                                        }
                                    }
                                }

                                MouseArea {
                                    anchors.fill: parent
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: root.switchMode("clipboard")
                                }
                            }
                        }
                    }
                }
            }

            // Header Divider
            Rectangle {
                Layout.fillWidth: true
                implicitHeight: 1
                color: Theme.surface0
            }

            // -----------------------------------------------------------------
            // Zone 2: Inline Calculator Strip (Conditional)
            // -----------------------------------------------------------------
            Item {
                Layout.fillWidth: true
                visible: root.calcMatch !== null
                implicitHeight: visible ? 54 : 0

                Rectangle {
                    id: calcCard
                    anchors.fill: parent
                    anchors.leftMargin: Theme.spaceMd
                    anchors.rightMargin: Theme.spaceMd
                    anchors.topMargin: Theme.spaceSm
                    anchors.bottomMargin: 2
                    radius: Theme.radiusMd
                    color: calcMouse.containsMouse
                           ? Qt.rgba(40 / 255, 140 / 255, 255 / 255, 0.24)
                           : Qt.rgba(40 / 255, 140 / 255, 255 / 255, 0.15)
                    border.width: Theme.borderWidth
                    border.color: Theme.accentActive

                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: Theme.spaceMd
                        anchors.rightMargin: Theme.spaceMd
                        spacing: Theme.spaceSm

                        Text {
                            text: ""
                            font.family: Theme.fontFamily
                            font.pixelSize: Theme.iconSizeMd
                            color: Theme.accent
                        }

                        Text {
                            text: "Result"
                            font.family: Theme.fontFamilySans
                            font.pixelSize: Theme.fontSizeXs
                            font.weight: Font.Bold
                            color: Theme.accent
                        }

                        Text {
                            text: root.calcMatch ? (root.calcMatch.expr + "  =") : ""
                            font.family: Theme.fontFamily
                            font.pixelSize: Theme.fontSizeMd
                            color: Theme.subtext1
                            elide: Text.ElideLeft
                            Layout.maximumWidth: 220
                        }

                        Text {
                            Layout.fillWidth: true
                            text: root.calcMatch ? root.calcMatch.result : ""
                            font.family: Theme.fontFamily
                            font.pixelSize: Theme.fontSizeXl
                            font.weight: Font.Bold
                            color: Theme.text
                            elide: Text.ElideRight
                        }

                        Rectangle {
                            implicitHeight: 22
                            implicitWidth: calcHintText.implicitWidth + Theme.spaceMd
                            radius: Theme.radiusPill
                            color: Theme.accentActive

                            Text {
                                id: calcHintText
                                anchors.centerIn: parent
                                text: root.calcTakesEnter ? "Press Enter to copy" : "Click to copy"
                                font.family: Theme.fontFamilySans
                                font.pixelSize: Theme.fontSizeXs
                                font.weight: Font.Bold
                                color: Theme.crust
                            }
                        }
                    }

                    MouseArea {
                        id: calcMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: root.copyCalcResult()
                    }
                }
            }

            // -----------------------------------------------------------------
            // Clipboard Sub-header (Count + Clear All Button)
            // -----------------------------------------------------------------
            Item {
                Layout.fillWidth: true
                visible: root.activeMode === "clipboard"
                implicitHeight: visible ? 34 : 0

                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: Theme.spaceMd
                    anchors.rightMargin: Theme.spaceMd
                    anchors.topMargin: Theme.spaceXs
                    spacing: Theme.spaceSm

                    Text {
                        text: {
                            if (root.clipboardLoading)
                                return "Loading clipboard history...";
                            const total = root.clipboardEntries.length;
                            const shown = root.filteredClipboard.length;
                            if (searchInput.text.trim().length > 0)
                                return shown + " / " + total + " matching";
                            return total + (total === 1 ? " item" : " items");
                        }
                        font.family: Theme.fontFamilySans
                        font.pixelSize: Theme.fontSizeSm
                        color: Theme.subtext0
                    }

                    Item {
                        Layout.fillWidth: true
                    }

                    Rectangle {
                        visible: root.clipboardEntries.length > 0
                        implicitHeight: 24
                        implicitWidth: wipeLabel.implicitWidth + Theme.spaceMd
                        radius: Theme.radiusPill
                        color: wipeMouse.containsMouse
                               ? Qt.rgba(243 / 255, 139 / 255, 168 / 255, 0.22)
                               : Theme.surface0
                        border.width: Theme.borderWidth
                        border.color: wipeMouse.containsMouse ? Theme.red : Theme.surface1

                        Behavior on color {
                            ColorAnimation { duration: 160 }
                        }

                        Text {
                            id: wipeLabel
                            anchors.centerIn: parent
                            text: " Clear All"
                            font.family: Theme.fontFamily
                            font.pixelSize: Theme.fontSizeXs
                            font.weight: Font.DemiBold
                            color: wipeMouse.containsMouse ? Theme.red : Theme.subtext1
                        }

                        MouseArea {
                            id: wipeMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: root.wipeClipboard()
                        }
                    }
                }
            }

            // -----------------------------------------------------------------
            // Zone 3: Unified Results Viewport (ListView + GridView)
            // -----------------------------------------------------------------
            Item {
                Layout.fillWidth: true
                Layout.fillHeight: true
                Layout.topMargin: Theme.spaceSm
                Layout.leftMargin: Theme.spaceMd
                Layout.rightMargin: Theme.spaceMd
                Layout.bottomMargin: Theme.spaceXs

                // List View
                ListView {
                    id: resultsList
                    anchors.fill: parent
                    visible: root.viewMode === "list"
                    clip: true
                    spacing: 4
                    boundsBehavior: Flickable.StopAtBounds
                    currentIndex: root.selectedIndex
                    model: root.viewMode === "list" ? root.activeItems : []

                    highlightFollowsCurrentItem: false
                    highlight: Rectangle {
                        width: resultsList.width
                        height: resultsList.currentItem ? resultsList.currentItem.height : 54
                        y: resultsList.currentItem ? resultsList.currentItem.y : 0
                        visible: resultsList.count > 0 && resultsList.currentItem !== null
                        radius: Theme.radiusMd
                        color: Qt.rgba(40 / 255, 140 / 255, 255 / 255, 0.14)
                        border.width: Theme.borderWidth
                        border.color: Qt.rgba(137 / 255, 180 / 255, 250 / 255, 0.55)

                        Behavior on y {
                            NumberAnimation {
                                duration: 200
                                easing.type: Easing.OutQuint
                            }
                        }

                        Behavior on height {
                            NumberAnimation {
                                duration: 200
                                easing.type: Easing.OutQuint
                            }
                        }
                    }

                    delegate: Item {
                        id: rowDelegate
                        required property var modelData
                        required property int index

                        readonly property bool isSelected: index === root.selectedIndex
                        readonly property bool isApps: root.activeMode === "apps"

                        width: resultsList.width
                        height: 54

                        Component.onCompleted: {
                            if (!isApps && modelData && modelData.isImage)
                                root.requestImagePreview(modelData);
                        }

                        onModelDataChanged: {
                            if (!isApps && modelData && modelData.isImage)
                                root.requestImagePreview(modelData);
                        }

                        Rectangle {
                            anchors.fill: parent
                            radius: Theme.radiusMd
                            color: (!rowDelegate.isSelected && rowMouse.containsMouse)
                                   ? Qt.rgba(49 / 255, 50 / 255, 68 / 255, 0.55)
                                   : "transparent"

                            Behavior on color {
                                ColorAnimation { duration: 140 }
                            }
                        }

                        MouseArea {
                            id: rowMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            acceptedButtons: Qt.LeftButton | Qt.RightButton
                            cursorShape: Qt.PointingHandCursor
                            onEntered: {
                                if (!root.contextMenuOpen)
                                    root.selectedIndex = rowDelegate.index;
                            }
                            onClicked: function(mouse) {
                                root.selectedIndex = rowDelegate.index;
                                if (mouse.button === Qt.RightButton) {
                                    root.openContextMenu(
                                        rowDelegate.isApps ? "apps" : "clipboard",
                                        rowDelegate.modelData,
                                        rowDelegate,
                                        mouse.x,
                                        mouse.y
                                    );
                                    return;
                                }
                                if (root.contextMenuOpen) {
                                    root.closeContextMenu();
                                    return;
                                }
                                if (rowDelegate.isApps)
                                    root.activateAppItem(rowDelegate.modelData);
                                else
                                    root.activateClipboardItem(rowDelegate.modelData);
                            }
                        }

                        // Apps List Row Content
                        RowLayout {
                            visible: rowDelegate.isApps
                            anchors.fill: parent
                            anchors.leftMargin: Theme.spaceMd
                            anchors.rightMargin: Theme.spaceMd
                            spacing: Theme.spaceMd

                            Item {
                                implicitWidth: 32
                                implicitHeight: 32

                                IconImage {
                                    id: appIcon
                                    anchors.fill: parent
                                    implicitSize: 32
                                    asynchronous: true
                                    source: (rowDelegate.isApps && rowDelegate.modelData.iconName)
                                            ? Quickshell.iconPath(rowDelegate.modelData.iconName, true)
                                            : ""
                                    visible: status === Image.Ready
                                }

                                Text {
                                    anchors.centerIn: parent
                                    visible: appIcon.status !== Image.Ready
                                    text: "󰣆"
                                    font.family: Theme.fontFamily
                                    font.pixelSize: 22
                                    color: rowDelegate.isSelected ? Theme.accent : Theme.subtext0
                                }
                            }

                            ColumnLayout {
                                Layout.fillWidth: true
                                spacing: 2

                                Text {
                                    Layout.fillWidth: true
                                    text: rowDelegate.isApps ? rowDelegate.modelData.name : ""
                                    font.family: Theme.fontFamilySans
                                    font.pixelSize: Theme.fontSizeLg
                                    font.weight: Font.Bold
                                    color: rowDelegate.isSelected ? Theme.text : Theme.subtext1
                                    elide: Text.ElideRight
                                }

                                Text {
                                    Layout.fillWidth: true
                                    visible: text.length > 0
                                    text: rowDelegate.isApps ? rowDelegate.modelData.subtitle : ""
                                    font.family: Theme.fontFamilySans
                                    font.pixelSize: Theme.fontSizeSm
                                    color: Theme.subtext0
                                    elide: Text.ElideRight
                                }
                            }

                            Text {
                                visible: rowDelegate.isApps && rowDelegate.modelData.pinned
                                text: "󰐃"
                                font.family: Theme.fontFamily
                                font.pixelSize: Theme.iconSizeSm
                                color: Theme.accent
                            }

                            Rectangle {
                                visible: rowDelegate.isApps && rowDelegate.modelData.category.length > 0
                                implicitHeight: 22
                                implicitWidth: catLabel.implicitWidth + Theme.spaceMd
                                radius: Theme.radiusPill
                                color: rowDelegate.isSelected
                                       ? Qt.rgba(137 / 255, 180 / 255, 250 / 255, 0.18)
                                       : Theme.surface0
                                border.width: 1
                                border.color: rowDelegate.isSelected ? Theme.accent : Theme.surface1

                                Text {
                                    id: catLabel
                                    anchors.centerIn: parent
                                    text: rowDelegate.isApps ? rowDelegate.modelData.category : ""
                                    font.family: Theme.fontFamily
                                    font.pixelSize: Theme.fontSizeXs
                                    color: rowDelegate.isSelected ? Theme.accent : Theme.subtext0
                                }
                            }
                        }

                        // Clipboard List Row Content
                        RowLayout {
                            visible: !rowDelegate.isApps
                            anchors.fill: parent
                            anchors.leftMargin: Theme.spaceMd
                            anchors.rightMargin: Theme.spaceSm
                            spacing: Theme.spaceSm

                            // Left Type Badge / Thumbnail Preview
                            Rectangle {
                                id: listThumbBox
                                implicitWidth: 64
                                implicitHeight: 36
                                radius: Theme.radiusSm
                                color: Theme.surface0
                                border.width: 1
                                border.color: !rowDelegate.isApps
                                              ? Qt.rgba(
                                                    root.badgeColorFor(rowDelegate.modelData.kind).r,
                                                    root.badgeColorFor(rowDelegate.modelData.kind).g,
                                                    root.badgeColorFor(rowDelegate.modelData.kind).b,
                                                    0.45
                                                )
                                              : Theme.surface1
                                clip: true

                                readonly property string thumbSource: (!rowDelegate.isApps && rowDelegate.modelData.isImage)
                                                                      ? root.previewSourceFor(rowDelegate.modelData.id)
                                                                      : ""

                                Image {
                                    id: rowThumb
                                    anchors.fill: parent
                                    anchors.margins: 2
                                    visible: listThumbBox.thumbSource !== "" && status === Image.Ready
                                    source: listThumbBox.thumbSource
                                    fillMode: Image.PreserveAspectCrop
                                    asynchronous: true
                                    cache: false
                                }

                                Row {
                                    anchors.centerIn: parent
                                    spacing: 4
                                    visible: !rowThumb.visible

                                    Text {
                                        anchors.verticalCenter: parent.verticalCenter
                                        text: !rowDelegate.isApps ? root.badgeIconFor(rowDelegate.modelData.kind) : ""
                                        font.family: Theme.fontFamily
                                        font.pixelSize: Theme.fontSizeSm
                                        color: !rowDelegate.isApps ? root.badgeColorFor(rowDelegate.modelData.kind) : Theme.subtext0
                                    }

                                    Text {
                                        anchors.verticalCenter: parent.verticalCenter
                                        text: !rowDelegate.isApps ? rowDelegate.modelData.kind : ""
                                        font.family: Theme.fontFamily
                                        font.pixelSize: 9
                                        font.weight: Font.Bold
                                        color: !rowDelegate.isApps ? root.badgeColorFor(rowDelegate.modelData.kind) : Theme.subtext0
                                    }
                                }
                            }

                            Text {
                                Layout.fillWidth: true
                                text: !rowDelegate.isApps ? rowDelegate.modelData.displayTitle : ""
                                font.family: (!rowDelegate.isApps && (rowDelegate.modelData.kind === "CODE" || rowDelegate.modelData.kind === "URL"))
                                             ? Theme.fontFamily
                                             : Theme.fontFamilySans
                                font.pixelSize: Theme.fontSizeMd
                                font.weight: rowDelegate.isSelected ? Font.DemiBold : Font.Normal
                                color: rowDelegate.isSelected ? Theme.text : Theme.subtext1
                                elide: Text.ElideRight
                                maximumLineCount: 2
                                wrapMode: Text.WrapAnywhere
                            }

                            // Inline Delete Button
                            Rectangle {
                                implicitWidth: 28
                                implicitHeight: 28
                                radius: Theme.radiusSm
                                color: delMouse.containsMouse
                                       ? Qt.rgba(243 / 255, 139 / 255, 168 / 255, 0.22)
                                       : "transparent"

                                Text {
                                    anchors.centerIn: parent
                                    text: ""
                                    font.family: Theme.fontFamily
                                    font.pixelSize: Theme.fontSizeSm
                                    color: delMouse.containsMouse ? Theme.red : Theme.overlay1
                                }

                                MouseArea {
                                    id: delMouse
                                    anchors.fill: parent
                                    hoverEnabled: true
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: function(mouse) {
                                        mouse.accepted = true;
                                        root.closeContextMenu();
                                        if (!rowDelegate.isApps)
                                            root.deleteClipboardItem(rowDelegate.modelData);
                                    }
                                }
                            }
                        }
                    }
                }

                // Grid View (4 cols in Apps, 2 cols in Clipboard)
                GridView {
                    id: resultsGrid
                    anchors.fill: parent
                    visible: root.viewMode === "grid"
                    clip: true
                    boundsBehavior: Flickable.StopAtBounds
                    currentIndex: root.selectedIndex
                    model: root.viewMode === "grid" ? root.activeItems : []

                    readonly property int columns: root.activeMode === "apps" ? 4 : 2
                    cellWidth: Math.floor(width / columns)
                    cellHeight: root.activeMode === "apps" ? 112 : 132

                    highlightFollowsCurrentItem: false
                    highlight: Rectangle {
                        x: resultsGrid.currentItem ? resultsGrid.currentItem.x + 4 : 4
                        y: resultsGrid.currentItem ? resultsGrid.currentItem.y + 4 : 4
                        width: Math.max(0, resultsGrid.cellWidth - 8)
                        height: Math.max(0, resultsGrid.cellHeight - 8)
                        visible: resultsGrid.count > 0 && resultsGrid.currentItem !== null
                        radius: Theme.radiusMd
                        color: Qt.rgba(49 / 255, 50 / 255, 68 / 255, 0.92)
                        border.width: Theme.borderWidth
                        border.color: Theme.accent

                        Behavior on x {
                            NumberAnimation {
                                duration: 200
                                easing.type: Easing.OutQuint
                            }
                        }

                        Behavior on y {
                            NumberAnimation {
                                duration: 200
                                easing.type: Easing.OutQuint
                            }
                        }
                    }

                    delegate: Item {
                        id: gridDelegate
                        required property var modelData
                        required property int index

                        readonly property bool isSelected: index === root.selectedIndex
                        readonly property bool isApps: root.activeMode === "apps"

                        width: resultsGrid.cellWidth
                        height: resultsGrid.cellHeight

                        Component.onCompleted: {
                            if (!isApps && modelData && modelData.isImage)
                                root.requestImagePreview(modelData);
                        }

                        onModelDataChanged: {
                            if (!isApps && modelData && modelData.isImage)
                                root.requestImagePreview(modelData);
                        }

                        Rectangle {
                            id: gridCard
                            anchors.fill: parent
                            anchors.margins: 4
                            radius: Theme.radiusMd
                            color: gridDelegate.isSelected
                                   ? "transparent"
                                   : (gridMouse.containsMouse ? Theme.surface0 : Theme.mantle)
                            border.width: Theme.borderWidth
                            border.color: gridDelegate.isSelected
                                          ? "transparent"
                                          : (gridMouse.containsMouse ? Theme.accent : Theme.surface0)

                            Behavior on color {
                                ColorAnimation { duration: 150 }
                            }

                            Behavior on border.color {
                                ColorAnimation { duration: 150 }
                            }
                        }

                        MouseArea {
                            id: gridMouse
                            anchors.fill: gridCard
                            hoverEnabled: true
                            acceptedButtons: Qt.LeftButton | Qt.RightButton
                            cursorShape: Qt.PointingHandCursor
                            onEntered: {
                                if (!root.contextMenuOpen)
                                    root.selectedIndex = gridDelegate.index;
                            }
                            onClicked: function(mouse) {
                                root.selectedIndex = gridDelegate.index;
                                if (mouse.button === Qt.RightButton) {
                                    root.openContextMenu(
                                        gridDelegate.isApps ? "apps" : "clipboard",
                                        gridDelegate.modelData,
                                        gridDelegate,
                                        mouse.x + 4,
                                        mouse.y + 4
                                    );
                                    return;
                                }
                                if (root.contextMenuOpen) {
                                    root.closeContextMenu();
                                    return;
                                }
                                if (gridDelegate.isApps)
                                    root.activateAppItem(gridDelegate.modelData);
                                else
                                    root.activateClipboardItem(gridDelegate.modelData);
                            }
                        }

                        // Apps Grid Card Content
                        Item {
                            visible: gridDelegate.isApps
                            anchors.fill: gridCard
                            anchors.margins: Theme.spaceSm

                            Text {
                                anchors.top: parent.top
                                anchors.right: parent.right
                                visible: gridDelegate.isApps && gridDelegate.modelData.pinned
                                text: "󰐃"
                                font.family: Theme.fontFamily
                                font.pixelSize: Theme.fontSizeSm
                                color: Theme.accent
                            }

                            ColumnLayout {
                                anchors.centerIn: parent
                                width: parent.width
                                spacing: Theme.spaceSm

                                Item {
                                    Layout.alignment: Qt.AlignHCenter
                                    implicitWidth: 42
                                    implicitHeight: 42

                                    IconImage {
                                        id: gridAppIcon
                                        anchors.fill: parent
                                        implicitSize: 42
                                        asynchronous: true
                                        source: (gridDelegate.isApps && gridDelegate.modelData.iconName)
                                                ? Quickshell.iconPath(gridDelegate.modelData.iconName, true)
                                                : ""
                                        visible: status === Image.Ready
                                    }

                                    Text {
                                        anchors.centerIn: parent
                                        visible: gridAppIcon.status !== Image.Ready
                                        text: "󰣆"
                                        font.family: Theme.fontFamily
                                        font.pixelSize: 28
                                        color: gridDelegate.isSelected ? Theme.accent : Theme.subtext0
                                    }
                                }

                                Text {
                                    Layout.fillWidth: true
                                    horizontalAlignment: Text.AlignHCenter
                                    text: gridDelegate.isApps ? gridDelegate.modelData.name : ""
                                    font.family: Theme.fontFamilySans
                                    font.pixelSize: Theme.fontSizeSm
                                    font.weight: gridDelegate.isSelected ? Font.Bold : Font.Medium
                                    color: gridDelegate.isSelected ? Theme.text : Theme.subtext1
                                    elide: Text.ElideRight
                                    maximumLineCount: 2
                                    wrapMode: Text.WordWrap
                                }
                            }
                        }

                        // Clipboard Grid Card Content
                        ColumnLayout {
                            visible: !gridDelegate.isApps
                            anchors.fill: gridCard
                            anchors.margins: Theme.spaceSm
                            spacing: Theme.spaceXs

                            RowLayout {
                                Layout.fillWidth: true
                                spacing: Theme.spaceXs

                                Rectangle {
                                    implicitHeight: 20
                                    implicitWidth: gridBadgeRow.implicitWidth + 12
                                    radius: Theme.radiusPill
                                    color: Theme.surface0
                                    border.width: 1
                                    border.color: !gridDelegate.isApps
                                                  ? Qt.rgba(
                                                        root.badgeColorFor(gridDelegate.modelData.kind).r,
                                                        root.badgeColorFor(gridDelegate.modelData.kind).g,
                                                        root.badgeColorFor(gridDelegate.modelData.kind).b,
                                                        0.5
                                                    )
                                                  : Theme.surface1

                                    Row {
                                        id: gridBadgeRow
                                        anchors.centerIn: parent
                                        spacing: 4

                                        Text {
                                            anchors.verticalCenter: parent.verticalCenter
                                            text: !gridDelegate.isApps ? root.badgeIconFor(gridDelegate.modelData.kind) : ""
                                            font.family: Theme.fontFamily
                                            font.pixelSize: Theme.fontSizeXs
                                            color: !gridDelegate.isApps ? root.badgeColorFor(gridDelegate.modelData.kind) : Theme.subtext0
                                        }

                                        Text {
                                            anchors.verticalCenter: parent.verticalCenter
                                            text: !gridDelegate.isApps ? gridDelegate.modelData.kind : ""
                                            font.family: Theme.fontFamily
                                            font.pixelSize: 9
                                            font.weight: Font.Bold
                                            color: !gridDelegate.isApps ? root.badgeColorFor(gridDelegate.modelData.kind) : Theme.subtext0
                                        }
                                    }
                                }

                                Item {
                                    Layout.fillWidth: true
                                }

                                Rectangle {
                                    visible: gridMouse.containsMouse || gridDelMouse.containsMouse || gridDelegate.isSelected
                                    implicitWidth: 22
                                    implicitHeight: 22
                                    radius: Theme.radiusSm
                                    color: gridDelMouse.containsMouse
                                           ? Qt.rgba(243 / 255, 139 / 255, 168 / 255, 0.22)
                                           : "transparent"

                                    Text {
                                        anchors.centerIn: parent
                                        text: ""
                                        font.family: Theme.fontFamily
                                        font.pixelSize: Theme.fontSizeXs
                                        color: gridDelMouse.containsMouse ? Theme.red : Theme.overlay1
                                    }

                                    MouseArea {
                                        id: gridDelMouse
                                        anchors.fill: parent
                                        hoverEnabled: true
                                        cursorShape: Qt.PointingHandCursor
                                        onClicked: function(mouse) {
                                            mouse.accepted = true;
                                            root.closeContextMenu();
                                            if (!gridDelegate.isApps)
                                                root.deleteClipboardItem(gridDelegate.modelData);
                                        }
                                    }
                                }
                            }

                            // Image Thumbnail in Grid Card
                            Rectangle {
                                id: gridThumbBox
                                Layout.fillWidth: true
                                Layout.fillHeight: true
                                visible: !gridDelegate.isApps && gridDelegate.modelData.isImage
                                radius: Theme.radiusSm
                                color: Theme.crust
                                border.width: 1
                                border.color: Theme.surface0
                                clip: true

                                readonly property string thumbSource: (!gridDelegate.isApps && gridDelegate.modelData.isImage)
                                                                      ? root.previewSourceFor(gridDelegate.modelData.id)
                                                                      : ""

                                Image {
                                    id: gridThumb
                                    anchors.fill: parent
                                    anchors.margins: 3
                                    visible: gridThumbBox.thumbSource !== "" && status === Image.Ready
                                    source: gridThumbBox.thumbSource
                                    fillMode: Image.PreserveAspectFit
                                    asynchronous: true
                                    cache: false
                                }

                                Text {
                                    anchors.centerIn: parent
                                    visible: !gridThumb.visible
                                    text: "󰋩"
                                    font.family: Theme.fontFamily
                                    font.pixelSize: 24
                                    color: Theme.mauve
                                }
                            }

                            // Text/URL/Code Snippet in Grid Card
                            Text {
                                Layout.fillWidth: true
                                Layout.fillHeight: true
                                visible: !gridDelegate.isApps && !gridDelegate.modelData.isImage
                                verticalAlignment: Text.AlignTop
                                text: !gridDelegate.isApps ? gridDelegate.modelData.displayTitle : ""
                                font.family: (!gridDelegate.isApps && (gridDelegate.modelData.kind === "CODE" || gridDelegate.modelData.kind === "URL"))
                                             ? Theme.fontFamily
                                             : Theme.fontFamilySans
                                font.pixelSize: Theme.fontSizeSm
                                color: gridDelegate.isSelected ? Theme.text : Theme.subtext1
                                elide: Text.ElideRight
                                maximumLineCount: 3
                                wrapMode: Text.WrapAnywhere
                            }
                        }
                    }
                }

                // Empty State
                ColumnLayout {
                    anchors.centerIn: parent
                    visible: root.activeItems.length === 0 && !root.clipboardLoading
                    spacing: Theme.spaceXs

                    Text {
                        Layout.alignment: Qt.AlignHCenter
                        text: root.activeMode === "apps" ? "󰍉" : "󰅌"
                        font.family: Theme.fontFamily
                        font.pixelSize: 28
                        color: Theme.overlay0
                    }

                    Text {
                        Layout.alignment: Qt.AlignHCenter
                        text: root.activeMode === "apps"
                              ? (root.calcMatch ? "Press Enter to copy calculation result" : "No matching applications")
                              : (root.clipboardEntries.length === 0 ? "No clipboard history" : "No matching items")
                        font.family: Theme.fontFamilySans
                        font.pixelSize: Theme.fontSizeMd
                        color: Theme.overlay1
                    }
                }
            }

            // -----------------------------------------------------------------
            // Inline Image Preview Card (Selected Clipboard Image in List View)
            // -----------------------------------------------------------------
            Rectangle {
                id: imagePreviewCard
                Layout.fillWidth: true
                Layout.leftMargin: Theme.spaceMd
                Layout.rightMargin: Theme.spaceMd
                Layout.bottomMargin: Theme.spaceXs
                visible: root.viewMode === "list" && root.selectedClipboardItem !== null && root.selectedClipboardItem.isImage
                implicitHeight: visible ? 86 : 0
                radius: Theme.radiusMd
                color: Theme.mantle
                border.width: Theme.borderWidth
                border.color: Theme.surface1

                readonly property string previewUrl: root.selectedClipboardItem
                                                   ? root.previewSourceFor(root.selectedClipboardItem.id)
                                                   : ""

                RowLayout {
                    anchors.fill: parent
                    anchors.margins: Theme.spaceSm
                    spacing: Theme.spaceMd

                    Rectangle {
                        implicitWidth: 124
                        Layout.fillHeight: true
                        radius: Theme.radiusSm
                        color: Theme.crust
                        border.width: 1
                        border.color: Theme.surface0
                        clip: true

                        Image {
                            id: largeThumb
                            anchors.fill: parent
                            anchors.margins: 3
                            visible: imagePreviewCard.previewUrl !== "" && status === Image.Ready
                            source: imagePreviewCard.previewUrl
                            fillMode: Image.PreserveAspectFit
                            asynchronous: true
                            cache: false
                        }

                        Text {
                            anchors.centerIn: parent
                            visible: !largeThumb.visible
                            text: "󰋩"
                            font.family: Theme.fontFamily
                            font.pixelSize: 24
                            color: Theme.mauve
                        }
                    }

                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 3

                        Text {
                            text: "Clipboard Image Preview"
                            font.family: Theme.fontFamilySans
                            font.pixelSize: Theme.fontSizeMd
                            font.weight: Font.Bold
                            color: Theme.mauve
                        }

                        Text {
                            text: root.selectedClipboardItem ? root.selectedClipboardItem.imageMeta : ""
                            font.family: Theme.fontFamily
                            font.pixelSize: Theme.fontSizeSm
                            color: Theme.text
                            elide: Text.ElideRight
                            Layout.fillWidth: true
                        }

                        Text {
                            text: "Press Enter to copy image  •  Del to delete"
                            font.family: Theme.fontFamilySans
                            font.pixelSize: Theme.fontSizeXs
                            color: Theme.subtext0
                            elide: Text.ElideRight
                            Layout.fillWidth: true
                        }
                    }
                }
            }
        }

        // ---------------------------------------------------------------------
        // Internal Floating Right-Click Context Menu Overlay
        // ---------------------------------------------------------------------
        MouseArea {
            anchors.fill: parent
            visible: root.contextMenuOpen
            acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton
            onClicked: function(mouse) {
                mouse.accepted = true;
                root.closeContextMenu();
                searchInput.forceActiveFocus();
            }
        }

        Rectangle {
            id: contextMenuCard
            visible: root.contextMenuOpen || opacity > 0.01
            width: 214
            implicitHeight: ctxMenuColumn.implicitHeight + Theme.spaceSm
            x: Math.max(8, Math.min(paletteCard.width - width - 8, root.contextMenuAnchorX))
            y: Math.max(8, Math.min(paletteCard.height - height - 8, root.contextMenuAnchorY))
            radius: 12
            color: Theme.mantle
            border.width: Theme.borderWidth
            border.color: Theme.surface1
            clip: true

            transformOrigin: Item.TopLeft
            opacity: root.contextMenuOpen ? 1.0 : 0.0
            scale: root.contextMenuOpen ? 1.0 : 0.92

            Behavior on opacity {
                NumberAnimation {
                    duration: 160
                    easing.type: Easing.OutQuint
                }
            }

            Behavior on scale {
                NumberAnimation {
                    duration: 160
                    easing.type: Easing.OutQuint
                }
            }

            MouseArea {
                anchors.fill: parent
                acceptedButtons: Qt.AllButtons
                onClicked: function(mouse) {
                    mouse.accepted = true;
                }
            }

            ColumnLayout {
                id: ctxMenuColumn
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.top: parent.top
                anchors.margins: Theme.spaceXs
                spacing: 2

                Repeater {
                    model: root.contextMenuActions

                    delegate: Rectangle {
                        id: ctxActionDelegate
                        required property var modelData

                        Layout.fillWidth: true
                        implicitHeight: 32
                        radius: Theme.radiusSm
                        color: ctxMouse.containsMouse ? Theme.surface0 : "transparent"

                        Behavior on color {
                            ColorAnimation { duration: 120 }
                        }

                        RowLayout {
                            anchors.fill: parent
                            anchors.leftMargin: Theme.spaceSm
                            anchors.rightMargin: Theme.spaceSm
                            spacing: Theme.spaceSm

                            Text {
                                text: ctxActionDelegate.modelData.icon
                                font.family: Theme.fontFamily
                                font.pixelSize: Theme.iconSizeSm
                                color: {
                                    if (ctxActionDelegate.modelData.destructive)
                                        return ctxMouse.containsMouse ? Theme.red : Theme.subtext0;
                                    return ctxMouse.containsMouse ? Theme.accent : Theme.subtext0;
                                }
                            }

                            Text {
                                Layout.fillWidth: true
                                text: ctxActionDelegate.modelData.label
                                font.family: Theme.fontFamilySans
                                font.pixelSize: Theme.fontSizeSm
                                font.weight: ctxMouse.containsMouse ? Font.DemiBold : Font.Normal
                                color: {
                                    if (ctxActionDelegate.modelData.destructive)
                                        return ctxMouse.containsMouse ? Theme.red : Theme.text;
                                    return ctxMouse.containsMouse ? Theme.accent : Theme.text;
                                }
                                elide: Text.ElideRight
                            }
                        }

                        MouseArea {
                            id: ctxMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: function(mouse) {
                                mouse.accepted = true;
                                root.runContextAction(ctxActionDelegate.modelData.id);
                            }
                        }
                    }
                }
            }
        }
    }
}
