import Quickshell
import QtQuick
import "widgets"

ShellRoot {
    id: root

    Variants {
        model: Quickshell.screens

        BarWindow {}
    }
}
