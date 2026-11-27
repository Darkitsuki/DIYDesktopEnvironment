pragma Singleton

import QtQuick

QtObject {
    readonly property string name: "Catppuccin Mocha (Electric Blue)"

    // Catppuccin Mocha palette
    readonly property color base: "#1e1e2e"
    readonly property color baseTranslucent: Qt.rgba(30 / 255, 30 / 255, 46 / 255, 0.92)
    readonly property color surfaceTranslucent: Qt.rgba(49 / 255, 50 / 255, 68 / 255, 0.92)
    readonly property color mantle: "#181825"
    readonly property color crust: "#11111b"
    readonly property color surface0: "#313244"
    readonly property color surface1: "#45475a"
    readonly property color surface2: "#585b70"
    readonly property color overlay0: "#6c7086"
    readonly property color overlay1: "#7f849c"
    readonly property color text: "#cdd6f4"
    readonly property color subtext1: "#bac2de"
    readonly property color subtext0: "#a6adc8"

    // Electric Blue & semantic accents
    readonly property color accent: "#89b4fa"
    readonly property color accentActive: "#288cff"
    readonly property color blue: "#89b4fa"
    readonly property color sapphire: "#74c7ec"
    readonly property color teal: "#94e2d5"
    readonly property color green: "#a6e3a1"
    readonly property color yellow: "#f9e2af"
    readonly property color peach: "#fab387"
    readonly property color red: "#f38ba8"
    readonly property color mauve: "#cba6f7"

    // Typography
    readonly property string fontFamily: "JetBrainsMono Nerd Font"
    readonly property string fontFamilySans: "Roboto"
    readonly property int fontSizeXs: 10
    readonly property int fontSizeSm: 11
    readonly property int fontSizeMd: 12
    readonly property int fontSizeLg: 14
    readonly property int fontSizeXl: 16
    readonly property int iconSizeSm: 14
    readonly property int iconSizeMd: 16
    readonly property int iconSizeLg: 20

    // Spacing & layout
    readonly property int spaceXs: 4
    readonly property int spaceSm: 8
    readonly property int spaceMd: 12
    readonly property int spaceLg: 16
    readonly property int spaceXl: 24
    readonly property int barHeight: 38
    readonly property int barMargin: 8
    readonly property int pillHeight: 28

    // Corner radii & borders
    readonly property int radiusSm: 6
    readonly property int radiusMd: 10
    readonly property int radiusLg: 16
    readonly property int radiusPill: 999
    readonly property int borderWidth: 1
    readonly property color borderColor: surface1
    readonly property color borderActive: accent
}
