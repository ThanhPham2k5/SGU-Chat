import { Platform, StatusBar } from 'react-native';

// targetSdk 36 buộc Android hiển thị tràn màn hình (edge-to-edge), nên chừa chỗ cho thanh trạng thái và thanh điều hướng.
export const TOP_INSET = Platform.OS === 'android' ? StatusBar.currentHeight ?? 24 : 48;
export const BOTTOM_INSET = Platform.OS === 'android' ? 48 : 24;
