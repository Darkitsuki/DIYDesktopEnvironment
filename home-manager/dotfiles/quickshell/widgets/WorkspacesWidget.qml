pragma ComponentBehavior: Bound

import Quickshell
import Quickshell.Hyprland
import QtQuick
import QtQuick.Layouts
import ".."

Rectangle {
    id: root

    required property string screenName

    readonly property var targetMonitor: {
        const mons = Hyprland.monitors.values;
        for (let i = 0; i < mons.length; i++) {
            if (mons[i] && mons[i].name === root.screenName)
                return mons[i];
        }
        return null;
    }

    readonly property int activeWorkspaceId: {
        if (targetMonitor && targetMonitor.activeWorkspace)
            return targetMonitor.activeWorkspace.id;
        if (Hyprland.focusedWorkspace)
            return Hyprland.focusedWorkspace.id;
        return 1;
    }

    readonly property var workspaceItems: {
        const workspaces = Hyprland.workspaces.values;
        const byId = {};
        const ids = {};

        for (let i = 0; i < workspaces.length; i++) {
            const ws = workspaces[i];
            if (!ws || ws.id <= 0)
                continue;
            byId[ws.id] = ws;
            if (!ws.monitor || ws.monitor.name === root.screenName)
                ids[ws.id] = true;
        }

        // Persistent workspaces 1..5 unless explicitly assigned to another monitor
        for (let p = 1; p <= 5; p++) {
            const existing = byId[p];
            if (!existing || !existing.monitor || existing.monitor.name === root.screenName)
                ids[p] = true;
        }

        const sortedIds = Object.keys(ids).map(k => parseInt(k, 10)).sort((a, b) => a - b);
        const result = [];
        for (let j = 0; j < sortedIds.length; j++) {
            const id = sortedIds[j];
            const wsObj = byId[id] || null;
            result.push({
                id: id,
                active: id === root.activeWorkspaceId,
                populated: wsObj !== null,
                urgent: wsObj ? wsObj.urgent : false
            });
        }
        return result;
    }

    function switchWorkspace(target) {
        if (typeof target === "number")
            Hyprland.dispatch("hl.dsp.focus({ workspace = " + target + " })");
        else
            Hyprland.dispatch("hl.dsp.focus({ workspace = \"" + target + "\" })");
    }

    implicitHeight: Theme.pillHeight
    implicitWidth: wsRow.implicitWidth + Theme.spaceSm * 2
    radius: Theme.radiusLg
    color: Theme.surfaceTranslucent
    border.width: 0

    Behavior on implicitWidth {
        NumberAnimation {
            duration: 280
            easing.type: Easing.OutQuint
        }
    }

    MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.NoButton
        onWheel: function(wheel) {
            if (wheel.angleDelta.y > 0)
                root.switchWorkspace("e+1");
            else if (wheel.angleDelta.y < 0)
                root.switchWorkspace("e-1");
        }
    }

    RowLayout {
        id: wsRow
        anchors.centerIn: parent
        spacing: Theme.spaceXs

        Repeater {
            model: root.workspaceItems

            delegate: Rectangle {
                id: wsPill
                required property var modelData

                readonly property bool isActive: modelData.active
                readonly property bool isPopulated: modelData.populated
                readonly property bool isUrgent: modelData.urgent
                readonly property bool hovered: wsMouse.containsMouse

                implicitHeight: 22
                implicitWidth: isActive ? 34 : 24
                radius: Theme.radiusMd

                color: {
                    if (isActive)
                        return Theme.accentActive;
                    if (isUrgent)
                        return Qt.rgba(Theme.red.r, Theme.red.g, Theme.red.b, 0.28);
                    if (hovered)
                        return Qt.rgba(Theme.accent.r, Theme.accent.g, Theme.accent.b, 0.22);
                    return "transparent";
                }

                border.width: isActive ? 0 : (isUrgent ? 1 : 0)
                border.color: Theme.red

                Behavior on implicitWidth {
                    NumberAnimation {
                        duration: 280
                        easing.type: Easing.OutQuint
                    }
                }

                Behavior on color {
                    ColorAnimation {
                        duration: 220
                    }
                }

                Behavior on border.color {
                    ColorAnimation {
                        duration: 220
                    }
                }

                Text {
                    anchors.centerIn: parent
                    text: wsPill.modelData.id.toString()
                    font.family: Theme.fontFamily
                    font.pixelSize: Theme.fontSizeMd
                    font.weight: wsPill.isActive ? Font.Bold : (wsPill.isPopulated ? Font.DemiBold : Font.Normal)
                    color: {
                        if (wsPill.isActive)
                            return Theme.crust;
                        if (wsPill.isUrgent)
                            return Theme.red;
                        if (wsPill.hovered)
                            return Theme.accent;
                        if (wsPill.isPopulated)
                            return Theme.text;
                        return Theme.overlay0;
                    }

                    Behavior on color {
                        ColorAnimation {
                            duration: 220
                        }
                    }
                }

                MouseArea {
                    id: wsMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.switchWorkspace(wsPill.modelData.id)
                }
            }
        }
    }
}
