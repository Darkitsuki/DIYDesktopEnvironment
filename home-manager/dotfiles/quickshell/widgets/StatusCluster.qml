pragma ComponentBehavior: Bound

import Quickshell
import Quickshell.Io
import Quickshell.Services.Pipewire
import Quickshell.Services.SystemTray
import Quickshell.Services.UPower
import Quickshell.Widgets
import QtQuick
import QtQuick.Layouts
import ".."

RowLayout {
    id: root

    required property var parentWindow

    spacing: Theme.spaceSm

    // -------------------------------------------------------------------------
    // PipeWire Audio State
    // -------------------------------------------------------------------------
    PwObjectTracker {
        objects: Pipewire.defaultAudioSink ? [Pipewire.defaultAudioSink] : []
    }

    readonly property var audioSink: Pipewire.defaultAudioSink
    readonly property bool audioMuted: audioSink && audioSink.audio ? audioSink.audio.muted : false
    readonly property int audioVolumePct: {
        if (!audioSink || !audioSink.audio || isNaN(audioSink.audio.volume))
            return 0;
        return Math.round(audioSink.audio.volume * 100);
    }
    readonly property string audioIcon: {
        if (audioMuted)
            return "";
        if (audioVolumePct >= 66)
            return "";
        if (audioVolumePct >= 33)
            return "";
        return "";
    }

    // -------------------------------------------------------------------------
    // Network State (nmcli 5s poll)
    // -------------------------------------------------------------------------
    property string netType: "none"
    property string netConnection: ""

    Process {
        id: nmcliProcess
        command: ["nmcli", "-t", "-f", "TYPE,STATE,CONNECTION", "device"]
        stdout: StdioCollector {
            onStreamFinished: {
                const lines = text.trim().split("\n");
                let detectedType = "none";
                let detectedConn = "";
                for (let i = 0; i < lines.length; i++) {
                    const parts = lines[i].split(":");
                    if (parts.length < 3)
                        continue;
                    const devType = parts[0];
                    const devState = parts[1];
                    const connName = parts.slice(2).join(":");
                    if (devState === "connected") {
                        if (devType === "wifi") {
                            detectedType = "wifi";
                            detectedConn = connName;
                            break;
                        } else if (devType === "ethernet" && detectedType === "none") {
                            detectedType = "ethernet";
                            detectedConn = connName;
                        }
                    }
                }
                root.netType = detectedType;
                root.netConnection = detectedConn;
            }
        }
    }

    Timer {
        interval: 5000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: {
            if (!nmcliProcess.running)
                nmcliProcess.running = true;
        }
    }

    // -------------------------------------------------------------------------
    // Google Drive Sync State (waybar-gdrive-sync 4s poll)
    // -------------------------------------------------------------------------
    property string gdriveText: ""
    property string gdriveTooltip: ""
    property string gdriveClass: "disabled"

    Process {
        id: gdriveProcess
        command: ["/home/HoaHung/.local/bin/waybar-gdrive-sync"]
        stdout: StdioCollector {
            onStreamFinished: {
                const raw = text.trim();
                if (!raw) {
                    root.gdriveText = "";
                    root.gdriveClass = "disabled";
                    return;
                }
                try {
                    const parsed = JSON.parse(raw);
                    root.gdriveText = parsed.text || "";
                    root.gdriveTooltip = parsed.tooltip || "";
                    root.gdriveClass = parsed.class || "idle";
                } catch (e) {
                    root.gdriveText = "";
                    root.gdriveClass = "disabled";
                }
            }
        }
    }

    Timer {
        interval: 4000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: {
            if (!gdriveProcess.running)
                gdriveProcess.running = true;
        }
    }

    // -------------------------------------------------------------------------
    // UPower Battery State
    // -------------------------------------------------------------------------
    readonly property var battery: UPower.displayDevice
    readonly property bool hasBattery: battery !== null && battery.isPresent && battery.type === UPowerDeviceType.Battery
    readonly property int batteryPct: hasBattery ? Math.round(battery.percentage * 100) : 0
    readonly property bool batteryCharging: hasBattery && (
        battery.state === UPowerDeviceState.Charging ||
        battery.state === UPowerDeviceState.FullyCharged ||
        battery.state === UPowerDeviceState.PendingCharge
    )
    readonly property string batteryIcon: {
        if (batteryCharging)
            return "󰃨";
        if (batteryPct >= 85)
            return "";
        if (batteryPct >= 60)
            return "";
        if (batteryPct >= 35)
            return "";
        if (batteryPct >= 15)
            return "";
        return "";
    }
    readonly property color batteryColor: {
        if (batteryCharging)
            return Theme.green;
        if (batteryPct <= 15)
            return Theme.red;
        if (batteryPct <= 30)
            return Theme.yellow;
        return Theme.text;
    }

    // -------------------------------------------------------------------------
    // 1. PipeWire Audio Pill
    // -------------------------------------------------------------------------
    Rectangle {
        id: audioPill
        implicitHeight: Theme.pillHeight
        implicitWidth: audioLabel.implicitWidth + Theme.spaceMd * 2
        radius: Theme.radiusLg
        color: audioMouse.containsMouse ? Theme.surface0 : Theme.surfaceTranslucent
        border.width: audioMouse.containsMouse ? Theme.borderWidth : 0
        border.color: Theme.accent

        Behavior on implicitWidth {
            NumberAnimation {
                duration: 180
                easing.type: Easing.OutCubic
            }
        }
        Behavior on color { ColorAnimation { duration: 150 } }
        Behavior on border.color { ColorAnimation { duration: 150 } }

        Text {
            id: audioLabel
            anchors.centerIn: parent
            text: root.audioIcon + " " + root.audioVolumePct + "%"
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSizeMd
            color: root.audioMuted ? Theme.subtext0 : Theme.text

            Behavior on color { ColorAnimation { duration: 150 } }
        }

        MouseArea {
            id: audioMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton

            onClicked: function(mouse) {
                if (mouse.button === Qt.LeftButton) {
                    Quickshell.execDetached(["ags", "toggle", "audio-menu"]);
                } else if (mouse.button === Qt.RightButton) {
                    Quickshell.execDetached(["pavucontrol"]);
                } else if (mouse.button === Qt.MiddleButton && root.audioSink && root.audioSink.audio) {
                    root.audioSink.audio.muted = !root.audioSink.audio.muted;
                }
            }

            onWheel: function(wheel) {
                if (!root.audioSink || !root.audioSink.audio)
                    return;
                const step = wheel.angleDelta.y > 0 ? 0.05 : (wheel.angleDelta.y < 0 ? -0.05 : 0);
                if (step !== 0) {
                    const nextVol = Math.max(0.0, Math.min(1.0, root.audioSink.audio.volume + step));
                    root.audioSink.audio.volume = nextVol;
                }
            }
        }
    }

    // -------------------------------------------------------------------------
    // 2. Network Pill
    // -------------------------------------------------------------------------
    Rectangle {
        id: netPill
        implicitHeight: Theme.pillHeight
        implicitWidth: netLabel.implicitWidth + Theme.spaceMd * 2
        radius: Theme.radiusLg
        color: netMouse.containsMouse ? Theme.surface0 : Theme.surfaceTranslucent
        border.width: netMouse.containsMouse ? Theme.borderWidth : 0
        border.color: Theme.accent

        Behavior on implicitWidth {
            NumberAnimation {
                duration: 180
                easing.type: Easing.OutCubic
            }
        }
        Behavior on color { ColorAnimation { duration: 150 } }
        Behavior on border.color { ColorAnimation { duration: 150 } }

        Text {
            id: netLabel
            anchors.centerIn: parent
            text: {
                if (root.netType === "wifi")
                    return "  " + root.netConnection;
                if (root.netType === "ethernet")
                    return "󰈀";
                return "⚠";
            }
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSizeMd
            color: root.netType === "none" ? Theme.yellow : Theme.text

            Behavior on color { ColorAnimation { duration: 150 } }
        }

        MouseArea {
            id: netMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            acceptedButtons: Qt.LeftButton | Qt.RightButton

            onClicked: {
                if (!nmcliProcess.running)
                    nmcliProcess.running = true;
                Quickshell.execDetached(["kitty", "-e", "nmtui"]);
            }
        }
    }

    // -------------------------------------------------------------------------
    // 3. Google Drive Sync Pill
    // -------------------------------------------------------------------------
    Rectangle {
        id: gdrivePill
        readonly property int maxTextWidth: 165
        visible: root.gdriveText.length > 0 && root.gdriveClass !== "disabled"
        implicitHeight: Theme.pillHeight
        implicitWidth: visible ? (Math.min(gdriveLabel.implicitWidth, maxTextWidth) + Theme.spaceMd * 2) : 0
        Layout.maximumWidth: visible ? (maxTextWidth + Theme.spaceMd * 2) : 0
        radius: Theme.radiusLg
        color: gdriveMouse.containsMouse ? Theme.surface0 : Theme.surfaceTranslucent
        border.width: gdriveMouse.containsMouse ? Theme.borderWidth : 0
        border.color: Theme.accent

        Behavior on implicitWidth {
            NumberAnimation {
                duration: 180
                easing.type: Easing.OutCubic
            }
        }
        Behavior on color { ColorAnimation { duration: 150 } }
        Behavior on border.color { ColorAnimation { duration: 150 } }

        Text {
            id: gdriveLabel
            anchors.centerIn: parent
            width: Math.min(implicitWidth, gdrivePill.maxTextWidth)
            elide: Text.ElideMiddle
            horizontalAlignment: Text.AlignHCenter
            text: root.gdriveText
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSizeMd
            color: {
                if (root.gdriveClass === "syncing")
                    return Theme.accent;
                if (root.gdriveClass === "error")
                    return Theme.red;
                if (root.gdriveClass === "synced")
                    return Theme.green;
                return Theme.text;
            }

            Behavior on color { ColorAnimation { duration: 150 } }
        }

        MouseArea {
            id: gdriveMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            acceptedButtons: Qt.LeftButton | Qt.RightButton

            onClicked: function(mouse) {
                if (mouse.button === Qt.LeftButton) {
                    Quickshell.execDetached(["/home/HoaHung/.local/share/nautilus/scripts/Sync Google Drive Now"]);
                } else if (mouse.button === Qt.RightButton) {
                    Quickshell.execDetached(["nautilus", "/run/media/HoaHung/08444857444849A0/Google Drive"]);
                }
            }
        }
    }

    // -------------------------------------------------------------------------
    // 4. UPower Battery Pill
    // -------------------------------------------------------------------------
    Rectangle {
        id: batteryPill
        visible: root.hasBattery
        implicitHeight: Theme.pillHeight
        implicitWidth: visible ? (batteryLabel.implicitWidth + Theme.spaceMd * 2) : 0
        radius: Theme.radiusLg
        color: Theme.surfaceTranslucent
        border.width: (!root.batteryCharging && root.batteryPct <= 15) ? Theme.borderWidth : 0
        border.color: Theme.red

        Behavior on implicitWidth {
            NumberAnimation {
                duration: 180
                easing.type: Easing.OutCubic
            }
        }
        Behavior on color { ColorAnimation { duration: 150 } }
        Behavior on border.color { ColorAnimation { duration: 150 } }

        Text {
            id: batteryLabel
            anchors.centerIn: parent
            text: root.batteryPct + "% " + root.batteryIcon
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSizeMd
            color: root.batteryColor

            Behavior on color { ColorAnimation { duration: 150 } }
        }
    }

    // -------------------------------------------------------------------------
    // 5. System Tray Pill
    // -------------------------------------------------------------------------
    Rectangle {
        id: trayPill
        visible: trayRepeater.count > 0
        implicitHeight: Theme.pillHeight
        implicitWidth: visible ? (trayRow.implicitWidth + Theme.spaceSm * 2) : 0
        radius: Theme.radiusLg
        color: Theme.surfaceTranslucent
        border.width: 0
        border.color: Theme.borderColor

        Behavior on implicitWidth {
            NumberAnimation {
                duration: 180
                easing.type: Easing.OutCubic
            }
        }
        Behavior on color { ColorAnimation { duration: 150 } }
        Behavior on border.color { ColorAnimation { duration: 150 } }

        RowLayout {
            id: trayRow
            anchors.centerIn: parent
            spacing: Theme.spaceXs

            Repeater {
                id: trayRepeater
                model: SystemTray.items

                delegate: Item {
                    id: trayItem
                    required property SystemTrayItem modelData

                    readonly property bool iconMissing: !trayItem.modelData.icon
                        || trayIcon.source.toString().length === 0
                        || trayIcon.status === Image.Error
                        || (trayIcon.status === Image.Ready && trayIcon.backer.implicitWidth <= 0)
                    readonly property string trayMeta: (
                        (trayItem.modelData.id || "") + " " +
                        (trayItem.modelData.title || "") + " " +
                        (trayItem.modelData.icon || "")
                    ).toLowerCase()
                    readonly property string fallbackGlyph: (trayMeta.indexOf("fcitx") !== -1 || trayMeta.indexOf("keyboard") !== -1)
                        ? ""
                        : "󰀻"

                    implicitWidth: 22
                    implicitHeight: 22

                    IconImage {
                        id: trayIcon
                        anchors.centerIn: parent
                        source: trayItem.modelData.icon
                        implicitSize: Theme.iconSizeMd
                        visible: !trayItem.iconMissing
                    }

                    Text {
                        id: trayFallback
                        anchors.centerIn: parent
                        visible: trayItem.iconMissing
                        text: trayItem.fallbackGlyph
                        font.family: Theme.fontFamily
                        font.pixelSize: Theme.fontSizeMd
                        color: Theme.text
                    }

                    MouseArea {
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton

                        onClicked: function(mouse) {
                            if (mouse.button === Qt.LeftButton) {
                                trayItem.modelData.activate();
                            } else if (mouse.button === Qt.MiddleButton) {
                                trayItem.modelData.secondaryActivate();
                            } else if (mouse.button === Qt.RightButton && trayItem.modelData.hasMenu && root.parentWindow) {
                                const pos = root.parentWindow.itemPosition(trayItem);
                                trayItem.modelData.display(root.parentWindow, Math.round(pos.x), Math.round(pos.y + trayItem.height));
                            }
                        }
                    }
                }
            }
        }
    }

    // -------------------------------------------------------------------------
    // 6. Quick Settings Trigger Pill
    // -------------------------------------------------------------------------
    Rectangle {
        id: quickSettingsPill
        implicitHeight: Theme.pillHeight
        implicitWidth: 34
        radius: Theme.radiusLg
        color: qsMouse.containsMouse ? Theme.accentActive : Theme.surface0
        border.width: 0
        border.color: Theme.accent

        Behavior on implicitWidth {
            NumberAnimation {
                duration: 180
                easing.type: Easing.OutCubic
            }
        }
        Behavior on color { ColorAnimation { duration: 150 } }
        Behavior on border.color { ColorAnimation { duration: 150 } }

        Text {
            anchors.centerIn: parent
            text: ""
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSizeLg
            color: qsMouse.containsMouse ? Theme.crust : Theme.accent

            Behavior on color { ColorAnimation { duration: 150 } }
        }

        MouseArea {
            id: qsMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            acceptedButtons: Qt.LeftButton | Qt.RightButton

            onClicked: function(mouse) {
                if (mouse.button === Qt.LeftButton) {
                    Quickshell.execDetached(["ags", "toggle", "quick-settings"]);
                } else if (mouse.button === Qt.RightButton) {
                    Quickshell.execDetached(["ags", "toggle", "power-menu"]);
                }
            }
        }
    }
}
