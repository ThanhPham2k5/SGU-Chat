import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as MediaLibrary from "expo-media-library/legacy";
import { API_URL } from "../config";
import { getAccessToken } from "../storage/tokens";

/** Header xác thực cho các URL tệp đính kèm (dùng được cho cả Image và tải về). */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function messageFileUrl(messageId: string): string {
  return `${API_URL}/api/v1/chats/messages/${encodeURIComponent(messageId)}/file`;
}

export function isImage(contentType?: string | null): boolean {
  return !!contentType && contentType.startsWith("image/");
}

export function formatSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_");
}

/** Tệp tải về được lưu trong bộ nhớ riêng của app, theo id tin nhắn. */
function localDir(messageId: string): string {
  return `${FileSystem.documentDirectory}downloads/${messageId}/`;
}

function localFilePath(messageId: string, filename: string): string {
  return `${localDir(messageId)}${safeName(filename)}`;
}

/** Tệp đã được tải về máy chưa. */
export async function isDownloaded(messageId: string, filename: string): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(localFilePath(messageId, filename));
  return info.exists;
}

/** Tải tệp về bộ nhớ riêng của app. Nếu đã có thì không tải lại. */
export async function downloadMessageFile(messageId: string, filename: string): Promise<void> {
  if (await isDownloaded(messageId, filename)) return;

  await FileSystem.makeDirectoryAsync(localDir(messageId), { intermediates: true }).catch(() => {});
  const path = localFilePath(messageId, filename);
  const res = await FileSystem.downloadAsync(messageFileUrl(messageId), path, {
    headers: await authHeaders(),
  });
  if (res.status >= 400) {
    await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
    throw new Error(`Không tải được tệp (lỗi ${res.status}).`);
  }
}

/** Mở tệp đã tải về bằng ứng dụng có sẵn trên Android. */
export async function openMessageFile(messageId: string, filename: string, contentType?: string | null): Promise<void> {
  const contentUri = await FileSystem.getContentUriAsync(localFilePath(messageId, filename));
  try {
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data: contentUri,
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      type: contentType || "application/octet-stream",
    });
  } catch {
    throw new Error("Không có ứng dụng nào trên máy mở được tệp này.");
  }
}

/** Tải ảnh về thư mục tạm rồi lưu vào bộ sưu tập (Pictures) của điện thoại. */
export async function saveImageToGallery(messageId: string, filename: string): Promise<void> {
  const perm = await MediaLibrary.requestPermissionsAsync(true);
  if (!perm.granted) {
    throw new Error("Cần cấp quyền lưu ảnh để tải về.");
  }

  const dir = `${FileSystem.cacheDirectory}save-${messageId}/`;
  const path = `${dir}${safeName(filename)}`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  try {
    const res = await FileSystem.downloadAsync(messageFileUrl(messageId), path, {
      headers: await authHeaders(),
    });
    if (res.status >= 400) {
      throw new Error(`Không tải được ảnh (lỗi ${res.status}).`);
    }
    await MediaLibrary.saveToLibraryAsync(path);
  } finally {
    await FileSystem.deleteAsync(dir, { idempotent: true }).catch(() => {});
  }
}