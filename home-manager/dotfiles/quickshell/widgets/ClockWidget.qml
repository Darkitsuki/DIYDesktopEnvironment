import Quickshell
import QtQuick
import QtQuick.Layouts
import ".."

Rectangle {
    id: root

    property bool pinned: false
    readonly property bool popupVisible: pinned || clockMouse.containsMouse || popupHover.hovered

    SystemClock {
        id: clock
        precision: SystemClock.Seconds
    }

    readonly property var calendarModel: {
        const now = clock.date;
        const year = now.getFullYear();
        const month = now.getMonth();
        const today = now.getDate();

        const firstDay = new Date(year, month, 1);
        // Convert Sunday=0..Saturday=6 to Monday=0..Sunday=6
        const startOffset = (firstDay.getDay() + 6) % 7;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const prevMonthDays = new Date(year, month, 0).getDate();

        const cells = [];
        for (let i = startOffset - 1; i >= 0; i--) {
            cells.push({
                day: prevMonthDays - i,
                inMonth: false,
                isToday: false
            });
        }
        for (let d = 1; d <= daysInMonth; d++) {
            cells.push({
                day: d,
                inMonth: true,
                isToday: d === today
            });
        }
        while (cells.length % 7 !== 0) {
            cells.push({
                day: cells.length - (startOffset + daysInMonth) + 1,
                inMonth: false,
                isToday: false
            });
        }
        return cells;
    }

    implicitHeight: Theme.pillHeight
    implicitWidth: clockText.implicitWidth + Theme.spaceMd * 2
    radius: Theme.radiusLg
    color: (clockMouse.containsMouse || pinned) ? Theme.surface0 : Theme.surfaceTranslucent
    border.width: (clockMouse.containsMouse || pinned) ? Theme.borderWidth : 0
    border.color: Theme.accent

    Behavior on implicitWidth {
        NumberAnimation {
            duration: 180
            easing.type: Easing.OutCubic
        }
    }

    Behavior on color {
        ColorAnimation { duration: 150 }
    }

    Behavior on border.color {
        ColorAnimation { duration: 150 }
    }

    Text {
        id: clockText
        anchors.centerIn: parent
        text: Qt.formatDateTime(clock.date, "HH:mm  ddd dd/MM")
        font.family: Theme.fontFamily
        font.pixelSize: Theme.fontSizeMd
        font.weight: Font.DemiBold
        color: Theme.text
    }

    MouseArea {
        id: clockMouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: root.pinned = !root.pinned
    }

    PopupWindow {
        id: calendarPopup

        visible: root.popupVisible || calendarCard.opacity > 0.01
        color: "transparent"
        implicitWidth: calendarCard.implicitWidth
        implicitHeight: calendarCard.implicitHeight + 6

        anchor.item: root
        anchor.edges: Edges.Bottom
        anchor.gravity: Edges.Bottom
        anchor.margins.top: Theme.spaceSm

        HoverHandler {
            id: popupHover
        }

        Rectangle {
            id: calendarCard
            y: 4
            implicitWidth: calendarCol.implicitWidth + Theme.spaceLg * 2
            implicitHeight: calendarCol.implicitHeight + Theme.spaceMd * 2
            radius: Theme.radiusLg
            color: Theme.baseTranslucent
            border.width: Theme.borderWidth
            border.color: Theme.borderColor
            opacity: root.popupVisible ? 1.0 : 0.0

            Behavior on opacity {
                NumberAnimation {
                    duration: 160
                    easing.type: Easing.OutCubic
                }
            }

            transform: Translate {
                y: root.popupVisible ? 0 : -4

                Behavior on y {
                    NumberAnimation {
                        duration: 180
                        easing.type: Easing.OutCubic
                    }
                }
            }

            ColumnLayout {
                id: calendarCol
                anchors.centerIn: parent
                spacing: Theme.spaceSm

                Text {
                    Layout.alignment: Qt.AlignHCenter
                    text: Qt.formatDateTime(clock.date, "dddd, dd MMMM yyyy")
                    font.family: Theme.fontFamily
                    font.pixelSize: Theme.fontSizeMd
                    font.weight: Font.Bold
                    color: Theme.accent
                }

                Rectangle {
                    Layout.fillWidth: true
                    implicitHeight: 1
                    color: Theme.surface1
                }

                GridLayout {
                    id: calGrid
                    columns: 7
                    columnSpacing: Theme.spaceXs
                    rowSpacing: Theme.spaceXs

                    Repeater {
                        model: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
                        delegate: Text {
                            required property string modelData
                            Layout.preferredWidth: 26
                            horizontalAlignment: Text.AlignHCenter
                            text: modelData
                            font.family: Theme.fontFamily
                            font.pixelSize: Theme.fontSizeSm
                            font.weight: Font.Bold
                            color: Theme.accent
                        }
                    }

                    Repeater {
                        model: root.calendarModel
                        delegate: Rectangle {
                            id: dayCell
                            required property var modelData
                            Layout.preferredWidth: 26
                            Layout.preferredHeight: 24
                            radius: Theme.radiusSm
                            color: dayCell.modelData.isToday ? Theme.accentActive : "transparent"

                            Text {
                                anchors.centerIn: parent
                                text: dayCell.modelData.day.toString()
                                font.family: Theme.fontFamily
                                font.pixelSize: Theme.fontSizeSm
                                font.weight: dayCell.modelData.isToday ? Font.Bold : Font.Normal
                                color: {
                                    if (dayCell.modelData.isToday)
                                        return Theme.crust;
                                    if (dayCell.modelData.inMonth)
                                        return Theme.text;
                                    return Theme.overlay0;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
