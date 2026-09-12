import Widget from 'resource:///com/github/Aylur/ags/widget.js';

// 1. Tạo widget Thanh trượt độ sáng
const BrightnessSlider = Widget.Box({
    className: 'slider-box',
    children: [
        Widget.Label({ label: '󰃠 ', className: 'slider-icon' }),
        Widget.Slider({
            hexpand: true,
            drawValue: false,
            onChange: ({ value }) => {
                console.log('Độ sáng thay đổi thành: ', value);
            },
        }),
    ],
});

// 2. Tạo khung chứa Quick Settings
const QuickSettingsPanel = Widget.Box({
    className: 'quicksettings-panel',
    vertical: true,
    children: [
        Widget.Label({ label: 'Cài đặt nhanh', className: 'header' }),
        BrightnessSlider,
    ],
});

// 3. Khai báo Cửa sổ (Window)
const QuickSettingsWindow = Widget.Window({
    name: 'quicksettings',
    anchor: ['top', 'right'],
    margins: [10, 10],
    layer: 'overlay',
    visible: false,
    child: QuickSettingsPanel,
});

// 4. Khởi chạy AGS App
App.start({
    style: App.configDir + '/style.css',
    windows: [QuickSettingsWindow],
});