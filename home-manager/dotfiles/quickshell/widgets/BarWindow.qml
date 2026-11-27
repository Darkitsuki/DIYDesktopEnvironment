import Quickshell
import Quickshell.Wayland
import QtQuick
import QtQuick.Layouts
import ".."

PanelWindow {
    id: root

    required property var modelData

    screen: modelData
    implicitHeight: Theme.barHeight
    color: "transparent"

    WlrLayershell.namespace: "quickshell-bar"

    anchors {
        top: true
        left: true
        right: true
    }

    margins {
        top: Theme.barMargin
        left: 10
        right: 10
    }

    Rectangle {
        id: barPill
        anchors.fill: parent
        color: "transparent"
        border.width: 0
        border.color: "transparent"
        radius: Theme.radiusLg

        RowLayout {
            anchors.fill: parent
            anchors.topMargin: 0
            anchors.bottomMargin: 0
            anchors.leftMargin: 0
            anchors.rightMargin: 0
            spacing: Theme.spaceSm

            RowLayout {
                id: leftZone
                Layout.alignment: Qt.AlignVCenter | Qt.AlignLeft
                spacing: Theme.spaceSm

                WorkspacesWidget {
                    screenName: root.modelData ? root.modelData.name : ""
                }

                ClockWidget {}
            }

            Item {
                Layout.fillWidth: true
            }

            RowLayout {
                id: centerZone
                Layout.alignment: Qt.AlignVCenter | Qt.AlignHCenter
                spacing: Theme.spaceSm

                MprisWidget {}
            }

            Item {
                Layout.fillWidth: true
            }

            RowLayout {
                id: rightZone
                Layout.alignment: Qt.AlignVCenter | Qt.AlignRight
                spacing: Theme.spaceSm

                StatusCluster {
                    parentWindow: root
                }
            }
        }
    }
}
