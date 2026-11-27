pragma ComponentBehavior: Bound

import Quickshell
import Quickshell.Hyprland
import Quickshell.Io
import Quickshell.Wayland
import QtQuick
import ".."

PanelWindow {
    id: root

    property bool isOpen: false
    property int selectedIndex: 0
    property int hoveredIndex: -1
    property bool closeHovered: false
    property string pendingMode: ""

    readonly property string homeDir: Quickshell.env("HOME") || "/home/HoaHung"
    readonly property string stateFilePath: homeDir + "/.local/state/quickshell-snipping-mode.txt"

    readonly property var modes: [
        { id: "region", icon: "󰆞", label: "Kéo & chọn vùng" },
        { id: "window", icon: "󰖯", label: "Chụp một cửa sổ" },
        { id: "screen", icon: "󰍹", label: "Chụp màn hình hiện tại" },
        { id: "full",   icon: "󰍺", label: "Chụp tất cả màn hình" }
    ]

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

    readonly property string activeTooltipText: {
        if (root.closeHovered)
            return "Đóng (Esc)";
        const idx = root.hoveredIndex >= 0 ? root.hoveredIndex : root.selectedIndex;
        if (idx >= 0 && idx < root.modes.length)
            return root.modes[idx].label;
        return root.modes[0].label;
    }

    Component.onCompleted: loadLastMode()

    function indexForModeId(modeId) {
        for (let i = 0; i < root.modes.length; i++) {
            if (root.modes[i].id === modeId)
                return i;
        }
        return 0;
    }

    function loadLastMode() {
        if (!loadModeProc.running)
            loadModeProc.running = true;
    }

    function openOverlay() {
        loadLastMode();
        root.hoveredIndex = -1;
        root.closeHovered = false;
        root.pendingMode = "";
        root.isOpen = true;
        focusTimer.restart();
    }

    function closeOverlay() {
        root.isOpen = false;
        root.hoveredIndex = -1;
        root.closeHovered = false;
    }

    function toggleOverlay() {
        if (root.isOpen)
            closeOverlay();
        else
            openOverlay();
    }

    function triggerMode(index) {
        if (index < 0 || index >= root.modes.length)
            return;
        const modeObj = root.modes[index];
        root.selectedIndex = index;
        root.hoveredIndex = -1;
        root.closeHovered = false;
        root.pendingMode = modeObj.id;

        saveModeProc.command = [
            "sh",
            "-c",
            "mkdir -p \"$HOME/.local/state\" && printf '%s\\n' \"$1\" > \"$2\"",
            "--",
            modeObj.id,
            root.stateFilePath
        ];
        saveModeProc.running = true;

        // Unmap overlay immediately so it never appears in frozen frames or screenshots.
        root.isOpen = false;
        captureTimer.restart();
    }

    onVisibleChanged: {
        if (visible && root.isOpen)
            focusTimer.restart();
    }

    Process {
        id: loadModeProc
        command: ["sh", "-c", "cat \"$1\" 2>/dev/null || echo region", "--", root.stateFilePath]
        stdout: StdioCollector {
            onStreamFinished: {
                const raw = text.trim();
                root.selectedIndex = root.indexForModeId(raw);
            }
        }
    }

    Process {
        id: saveModeProc
    }

    Timer {
        id: focusTimer
        interval: 20
        repeat: false
        onTriggered: {
            if (root.isOpen)
                keyScope.forceActiveFocus();
        }
    }

    Timer {
        id: captureTimer
        interval: 140
        repeat: false
        onTriggered: {
            if (!root.pendingMode)
                return;
            const modeToRun = root.pendingMode;
            root.pendingMode = "";
            Quickshell.execDetached(["/home/HoaHung/.local/bin/hypr-screenshot", modeToRun]);
        }
    }

    visible: root.isOpen
    color: "transparent"
    screen: root.focusedScreen

    WlrLayershell.namespace: "quickshell-snipping"
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: root.isOpen ? WlrKeyboardFocus.Exclusive : WlrKeyboardFocus.None
    WlrLayershell.exclusionMode: ExclusionMode.Ignore

    anchors {
        top: true
        bottom: true
        left: true
        right: true
    }

    FocusScope {
        id: keyScope
        anchors.fill: parent
        focus: true

        Keys.onEscapePressed: function(event) {
            event.accepted = true;
            root.closeOverlay();
        }

        Keys.onLeftPressed: function(event) {
            event.accepted = true;
            root.selectedIndex = (root.selectedIndex + root.modes.length - 1) % root.modes.length;
        }

        Keys.onBacktabPressed: function(event) {
            event.accepted = true;
            root.selectedIndex = (root.selectedIndex + root.modes.length - 1) % root.modes.length;
        }

        Keys.onRightPressed: function(event) {
            event.accepted = true;
            root.selectedIndex = (root.selectedIndex + 1) % root.modes.length;
        }

        Keys.onTabPressed: function(event) {
            event.accepted = true;
            root.selectedIndex = (root.selectedIndex + 1) % root.modes.length;
        }

        Keys.onReturnPressed: function(event) {
            event.accepted = true;
            root.triggerMode(root.selectedIndex);
        }

        Keys.onEnterPressed: function(event) {
            event.accepted = true;
            root.triggerMode(root.selectedIndex);
        }

        Keys.onSpacePressed: function(event) {
            event.accepted = true;
            root.triggerMode(root.selectedIndex);
        }

        Keys.onPressed: function(event) {
            if (event.key === Qt.Key_1) {
                event.accepted = true;
                root.triggerMode(0);
            } else if (event.key === Qt.Key_2) {
                event.accepted = true;
                root.triggerMode(1);
            } else if (event.key === Qt.Key_3) {
                event.accepted = true;
                root.triggerMode(2);
            } else if (event.key === Qt.Key_4) {
                event.accepted = true;
                root.triggerMode(3);
            }
        }

        // Click outside the floating pill to dismiss cleanly.
        MouseArea {
            anchors.fill: parent
            acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton
            onClicked: root.closeOverlay()
        }

        Rectangle {
            id: pillCard
            anchors.top: parent.top
            anchors.topMargin: 56
            anchors.horizontalCenter: parent.horizontalCenter
            implicitWidth: pillRow.implicitWidth + 12
            implicitHeight: pillRow.implicitHeight + 12
            radius: 16
            color: "#e61e1e2e"
            border.width: 1
            border.color: "#45475a"

            // Absorb clicks on inner padding so they do not hit the backdrop.
            MouseArea {
                anchors.fill: parent
                acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton
            }

            Row {
                id: pillRow
                anchors.centerIn: parent
                spacing: 6

                Repeater {
                    model: root.modes

                    delegate: Rectangle {
                        id: modeButton
                        required property var modelData
                        required property int index

                        readonly property bool isActive: index === root.selectedIndex
                        readonly property bool isHovered: modeMouse.containsMouse

                        width: 42
                        height: 42
                        radius: 11
                        color: isHovered ? "#313244" : (isActive ? "#26288cff" : "transparent")
                        border.width: 1
                        border.color: isActive ? "#89b4fa" : (isHovered ? "#585b70" : "transparent")

                        Behavior on color {
                            ColorAnimation { duration: 110 }
                        }

                        Behavior on border.color {
                            ColorAnimation { duration: 110 }
                        }

                        Text {
                            anchors.centerIn: parent
                            text: modeButton.modelData.icon
                            font.family: Theme.fontFamily
                            font.pixelSize: 18
                            color: (modeButton.isHovered || modeButton.isActive) ? "#89b4fa" : Theme.text
                        }

                        MouseArea {
                            id: modeMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            acceptedButtons: Qt.LeftButton
                            cursorShape: Qt.PointingHandCursor

                            onEntered: root.hoveredIndex = modeButton.index
                            onExited: {
                                if (root.hoveredIndex === modeButton.index)
                                    root.hoveredIndex = -1;
                            }
                            onClicked: root.triggerMode(modeButton.index)
                        }
                    }
                }

                Rectangle {
                    width: 1
                    height: 24
                    anchors.verticalCenter: parent.verticalCenter
                    color: "#45475a"
                }

                Rectangle {
                    id: closeButton
                    width: 32
                    height: 42
                    radius: 11
                    color: closeMouse.containsMouse ? "#313244" : "transparent"

                    Behavior on color {
                        ColorAnimation { duration: 110 }
                    }

                    Text {
                        anchors.centerIn: parent
                        text: ""
                        font.family: Theme.fontFamily
                        font.pixelSize: 14
                        color: closeMouse.containsMouse ? Theme.red : Theme.subtext0
                    }

                    MouseArea {
                        id: closeMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        acceptedButtons: Qt.LeftButton
                        cursorShape: Qt.PointingHandCursor

                        onEntered: root.closeHovered = true
                        onExited: root.closeHovered = false
                        onClicked: root.closeOverlay()
                    }
                }
            }
        }

        Rectangle {
            id: tooltipBadge
            anchors.top: pillCard.bottom
            anchors.topMargin: 8
            anchors.horizontalCenter: pillCard.horizontalCenter
            implicitWidth: tooltipText.implicitWidth + 18
            implicitHeight: tooltipText.implicitHeight + 10
            radius: 8
            color: "#e6181825"
            border.width: 1
            border.color: "#45475a"

            Text {
                id: tooltipText
                anchors.centerIn: parent
                text: root.activeTooltipText
                font.family: Theme.fontFamilySans
                font.pixelSize: Theme.fontSizeSm
                color: Theme.text
            }
        }
    }
}
