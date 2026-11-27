import * as FileSystem from "expo-file-system/legacy";
import { API_URL } from "../config";
import { getAccessToken } from "../storage/tokens";
import { apiFetch } from "./client";

export type ChatType = "DUO" | "GROUP";

export type MessageAuthor = {
  id: number;
  username: string;
  name: string;
  deleted?: boolean;
};

export type MessageDto = {
  id: string;
  action?: string;
  createdAt: string;
  text: string | null;
  removedAt?: string | null;
  author?: MessageAuthor | null;
  /** Có khi tin là tệp đính kèm (server trả về trong lịch sử và realtime). */
  filename?: string | null;
  contentType?: string | null;
  size?: number | null;
};

export type ChatSummary = {
  id: string;
  type: ChatType;
  /** Tên nhóm, chỉ có với GROUP. */
  name?: string | null;
  /** Đối phương, chỉ có với DUO. */
  user?: {
    id: number;
    username: string;
    name: string;
    online: boolean;
    deleted: boolean;
  } | null;
  pinned?: boolean;
  lastMessage?: MessageDto | null;
};

/** Thông tin tệp server trả về sau khi tải lên (khớp với CreatedFile của web). */
export type CreatedFile = {
  id: string;
  createdAt: string;
  filename: string;
  contentType: string;
  size: number;
};

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function chatTitle(chat: ChatSummary): string {
  if (chat.type === "DUO") {
    return chat.user?.name || chat.user?.username || "Đoạn chat";
  }
  return chat.name || "Nhóm chat";
}

export function messagePreview(m: MessageDto): string {
  if (m.removedAt) return "Tin nhắn đã thu hồi";
  if (m.filename) {
    return m.contentType?.startsWith("image/") ? "[Ảnh]" : `[Tệp] ${m.filename}`;
  }
  if (m.text == null) return "[Tệp đính kèm]";
  return m.text;
}

export function fetchChats(offset: number, limit: number): Promise<ChatSummary[]> {
  return apiFetch<ChatSummary[]>(`/api/v1/chats?offset=${offset}&limit=${limit}`);
}

export function fetchMessages(chatId: string, offset: number, limit: number): Promise<MessageDto[]> {
  return apiFetch<MessageDto[]>(
    `/api/v1/chats/${encodeURIComponent(chatId)}/messages?offset=${offset}&limit=${limit}`,
  );
}

export function sendText(chatId: string, text: string): Promise<MessageDto> {
  return apiFetch<MessageDto>(
    `/api/v1/chats/${encodeURIComponent(chatId)}/messages/text`,
    { method: "POST", body: JSON.stringify({ text }) },
  );
}

type PickedFile = { uri: string; name: string; mimeType?: string | null };

/**
 * Tải một tệp lên (multipart, trường "file") bằng expo-file-system.
 * Sao chép tệp sang thư mục tạm có đúng tên gốc để server nhận đúng tên tệp.
 */
export async function uploadFile(chatId: string, file: PickedFile): Promise<CreatedFile> {
  const dir = `${FileSystem.cacheDirectory}upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}/`;
  const path = `${dir}${file.name}`;

  const headers: Record<string, string> = {};
  const token = await getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    await FileSystem.copyAsync({ from: file.uri, to: path });

    const res = await FileSystem.uploadAsync(
      `${API_URL}/api/v1/chats/${encodeURIComponent(chatId)}/messages/file`,
      path,
      {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: "file",
        mimeType: file.mimeType ?? "application/octet-stream",
        headers,
      },
    );

    let body: { message?: string; error?: string } & Partial<CreatedFile> = {};
    try {
      body = JSON.parse(res.body);
    } catch {
      // Phản hồi không phải JSON, giữ body rỗng.
    }
    if (res.status >= 400) {
      throw new Error(body.message ?? body.error ?? `Lỗi máy chủ (${res.status})`);
    }
    return body as CreatedFile;
  } finally {
    await FileSystem.deleteAsync(dir, { idempotent: true }).catch(() => {});
  }
}