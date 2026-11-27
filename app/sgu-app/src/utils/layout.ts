import { Platform, StatusBar } from "react-native";

/** Chừa chỗ cho thanh trạng thái phía trên (app vẽ dưới nó vì edge-to-edge). */
export const TOP_INSET =
  Platform.OS === "android" ? StatusBar.currentHeight ?? 24 : 48;

/** Chừa chỗ cho thanh điều hướng phía dưới (nút Back/Home/Recent). */
export const BOTTOM_INSET = Platform.OS === "android" ? 48 : 24;