import Quickshell
import Quickshell.Services.Mpris
import QtQuick
import QtQuick.Layouts
import ".."

Rectangle {
    id: root

    readonly property var activePlayer: {
        const list = Mpris.players.values;
        let pausedCandidate = null;
        for (let i = 0; i < list.length; i++) {
            const p = list[i];
            if (!p)
                continue;
            if (p.playbackState === MprisPlaybackState.Playing)
                return p;
            if (!pausedCandidate && p.playbackState === MprisPlaybackState.Paused)
                pausedCandidate = p;
        }
        return pausedCandidate;
    }

    readonly property bool hasActiveMedia: activePlayer !== null
    readonly property bool isPlaying: activePlayer !== null && activePlayer.playbackState === MprisPlaybackState.Playing
    readonly property string mediaLabel: {
        if (!activePlayer)
            return "";
        const title = activePlayer.trackTitle ? activePlayer.trackTitle.trim() : "";
        const artist = activePlayer.trackArtist ? activePlayer.trackArtist.trim() : "";
        if (title && artist)
            return title + " - " + artist;
        if (title)
            return title;
        return activePlayer.identity ? activePlayer.identity : "Media";
    }

    readonly property int maxTextWidth: 220
    readonly property bool needsMarquee: hasActiveMedia && trackLabel.implicitWidth > maxTextWidth

    visible: hasActiveMedia
    implicitHeight: Theme.pillHeight
    implicitWidth: hasActiveMedia ? (mediaRow.implicitWidth + Theme.spaceMd * 2) : 0
    radius: Theme.radiusLg
    color: mediaMouse.containsMouse ? Theme.surface0 : Theme.surfaceTranslucent
    border.width: (mediaMouse.containsMouse || isPlaying) ? Theme.borderWidth : 0
    border.color: Theme.accent

    Behavior on color {
        ColorAnimation { duration: 150 }
    }

    Behavior on border.color {
        ColorAnimation { duration: 150 }
    }

    RowLayout {
        id: mediaRow
        anchors.centerIn: parent
        spacing: Theme.spaceSm

        Text {
            id: stateIcon
            text: root.isPlaying ? "" : ""
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSizeSm
            color: root.isPlaying ? Theme.accent : Theme.subtext0
        }

        Item {
            id: marqueeViewport
            clip: true
            implicitHeight: trackLabel.implicitHeight
            implicitWidth: Math.min(trackLabel.implicitWidth, root.maxTextWidth)

            Text {
                id: trackLabel
                y: 0
                x: 0
                text: root.mediaLabel
                font.family: Theme.fontFamily
                font.pixelSize: Theme.fontSizeMd
                font.weight: Font.Medium
                color: (mediaMouse.containsMouse || root.isPlaying) ? Theme.accent : Theme.text

                onTextChanged: {
                    marqueeAnim.stop();
                    trackLabel.x = 0;
                    if (root.needsMarquee)
                        marqueeAnim.restart();
                }

                SequentialAnimation on x {
                    id: marqueeAnim
                    running: root.needsMarquee
                    loops: Animation.Infinite

                    PauseAnimation { duration: 1400 }
                    NumberAnimation {
                        to: -(trackLabel.implicitWidth - marqueeViewport.implicitWidth)
                        duration: Math.max(1600, Math.round((trackLabel.implicitWidth - marqueeViewport.implicitWidth) * 26))
                        easing.type: Easing.InOutSine
                    }
                    PauseAnimation { duration: 1400 }
                    NumberAnimation {
                        to: 0
                        duration: Math.max(1200, Math.round((trackLabel.implicitWidth - marqueeViewport.implicitWidth) * 20))
                        easing.type: Easing.InOutSine
                    }
                }
            }
        }
    }

    MouseArea {
        id: mediaMouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        acceptedButtons: Qt.LeftButton | Qt.RightButton

        onClicked: function(mouse) {
            if (!root.activePlayer)
                return;
            if (mouse.button === Qt.LeftButton) {
                if (root.activePlayer.canTogglePlaying)
                    root.activePlayer.togglePlaying();
                else if (root.isPlaying)
                    root.activePlayer.pause();
                else
                    root.activePlayer.play();
            } else if (mouse.button === Qt.RightButton) {
                if (root.activePlayer.canGoNext)
                    root.activePlayer.next();
            }
        }

        onWheel: function(wheel) {
            if (!root.activePlayer)
                return;
            if (wheel.angleDelta.y > 0 && root.activePlayer.canGoNext)
                root.activePlayer.next();
            else if (wheel.angleDelta.y < 0 && root.activePlayer.canGoPrevious)
                root.activePlayer.previous();
        }
    }
}
