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

    SnippingOverlay {
        id: snippingOverlay
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

    IpcHandler {
        target: "snipping"

        function open(): void {
            snippingOverlay.openOverlay();
        }

        function close(): void {
            snippingOverlay.closeOverlay();
        }

        function toggle(): void {
            snippingOverlay.toggleOverlay();
        }
    }
}
