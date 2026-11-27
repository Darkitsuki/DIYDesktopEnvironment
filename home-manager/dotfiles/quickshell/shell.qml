import Quickshell
import Quickshell.Io
import QtQuick
import "widgets"

ShellRoot {
    id: root

    Variants {
        model: Quickshell.screens

        BarWindow {}
    }

    LauncherPopup {
        id: launcherPopup
    }

    IpcHandler {
        target: "launcher"

        function openApps(): void {
            launcherPopup.openMode("apps");
        }

        function openClipboard(): void {
            launcherPopup.openMode("clipboard");
        }

        function toggle(): void {
            launcherPopup.toggleCurrent();
        }
    }
}
