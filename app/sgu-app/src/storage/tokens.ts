import * as SecureStore from "expo-secure-store";

const ACCESS_TOKEN_KEY = "sgu_access_token";
const REFRESH_TOKEN_KEY = "sgu_refresh_token";

export function setAccessToken(token: string): Promise<void> {
  return SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
}

export function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export function clearAccessToken(): Promise<void> {
  return SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
}

/** Refresh token chỉ app di động giữ, vì app không nhận cookie Secure qua http. */
export function setRefreshToken(token: string): Promise<void> {
  return SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
}

export function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export function clearRefreshToken(): Promise<void> {
  return SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

/** Xoá toàn bộ phiên đăng nhập trên máy. */
export async function clearSession(): Promise<void> {
  await Promise.all([clearAccessToken(), clearRefreshToken()]);
}
