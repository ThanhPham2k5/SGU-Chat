import { WS_URL } from "../config";
import { ApiError, apiFetch } from "./client";
import type { CreatedFile, MessageDto } from "./chats";

export type RealtimeEvent =
  | {
      type: "message";
      chatId: string;
      id: string;
      senderId: number;
      senderName: string;
      text: string;
      timestamp: string;
      filename?: string;
      contentType?: string;
      size?: number;
    }
  | { type: "removed"; chatId: string; id: string; timestamp: string }
  | { type: "updated"; chatId: string; id: string; text: string; timestamp: string }
  | { type: "historyCleared"; chatId: string }
  | { type: "chatDeleted"; chatId: string }
  | { type: "membership" }
  | { type: "renamed"; chatId: string }
  | { type: "reconnected" };

type Listener = (event: RealtimeEvent) => void;

const MAX_BACKOFF_MS = 15_000;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function toEvent(data: Record<string, unknown>): RealtimeEvent | null {
  switch (data.action) {
    case "MESSAGE":
      return {
        type: "message",
        chatId: String(data.chatId),
        id: String(data.id),
        senderId: Number(data.senderId),
        senderName: str(data.senderName),
        text: str(data.text),
        timestamp: str(data.timestamp),
      };
    case "FILE":
      return {
        type: "message",
        chatId: String(data.chatId),
        id: String(data.id),
        senderId: Number(data.senderId),
        senderName: "",
        text: "",
        timestamp: str(data.timestamp),
        filename: str(data.filename),
        contentType: str(data.contentType),
        size: Number(data.size) || 0,
      };
    case "RENAME":
      return { type: "renamed", chatId: String(data.chatId) };
    case "REMOVE":
      return { type: "removed", chatId: String(data.chatId), id: String(data.id), timestamp: str(data.timestamp) };
    case "UPD_MESSAGE":
      return { type: "updated", chatId: String(data.chatId), id: String(data.id), text: str(data.text), timestamp: str(data.timestamp) };
    case "CLEAR_HISTORY":
      return { type: "historyCleared", chatId: String(data.chatId) };
    case "CHAT_DELETED":
      return { type: "chatDeleted", chatId: String(data.chatId) };
    case "JOIN":
    case "LEAVE":
    case "ADD":
    case "KICK":
    case "SET_ROLE":
    case "INVITATION":
      return { type: "membership" };
    default:
      return null;
  }
}

/** Đổi sự kiện tin nhắn thành MessageDto để hiển thị. */
export function eventToMessage(e: Extract<RealtimeEvent, { type: "message" }>): MessageDto {
  const isFile = !!e.filename;
  return {
    id: e.id,
    createdAt: e.timestamp,
    text: isFile ? null : e.text,
    filename: e.filename ?? null,
    contentType: e.contentType ?? null,
    size: e.size ?? null,
    author: { id: e.senderId, username: "", name: e.senderName },
  };
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

class ChatSocketClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private running = false;
  private hasConnected = false;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  start() {
    if (this.running) return;
    this.running = true;
    this.attempt = 0;
    void this.connect();
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.hasConnected = false;
    this.ws?.close(1000, "client closed");
    this.ws = null;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private isOpen(): boolean {
    return !!this.ws && this.ws.readyState === 1;
  }

  /** Gửi tin chữ qua WebSocket. Trả về false nếu chưa kết nối. */
  sendText(chatId: string, text: string): boolean {
    if (!this.isOpen() || !this.ws) return false;
    this.ws.send(`path=/chat/${chatId}/send\n\n${JSON.stringify({ tmpMessageId: makeId(), text })}`);
    return true;
  }

  /** Báo server về tệp đã tải lên qua REST; server phát lại cho mọi thành viên. */
  sendFile(chatId: string, file: CreatedFile): boolean {
    if (!this.isOpen() || !this.ws) return false;
    this.ws.send(`path=/chat/${chatId}/send_file\n\n${JSON.stringify(file)}`);
    return true;
  }

  /** Sửa tin chữ: server phát UPD_MESSAGE tới cả đoạn chat. Route nhận payload là chuỗi thuần. */
  editMessage(messageId: string, text: string): boolean {
    if (!this.isOpen() || !this.ws) return false;
    this.ws.send(`path=/chat/edit_text_message/${encodeURIComponent(messageId)}\n\n${text}`);
    return true;
  }

  /** Thu hồi tin nhắn: server phát REMOVE tới cả đoạn chat. */
  removeMessage(messageId: string): boolean {
    if (!this.isOpen() || !this.ws) return false;
    this.ws.send(`path=/chat/remove_message/${encodeURIComponent(messageId)}\n\n{}`);
    return true;
  }

  /**
   * Ẩn đoạn chat với người dùng hiện tại: server chỉ gửi lại tin sau thời điểm này cho mình.
   * Trả về false nếu chưa kết nối realtime (khi đó gọi REST thay thế).
   */
  clearHistory(chatId: string): boolean {
    if (!this.isOpen() || !this.ws) return false;
    this.ws.send(`path=/chat/${encodeURIComponent(chatId)}/clear_history\n\n{}`);
    return true;
  }

  private async connect() {
    if (!this.running) return;

    let ticket: string;
    try {
      const res = await apiFetch<{ ticket: string }>("/api/v1/ws-tickets", { method: "POST" });
      ticket = res.ticket;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        this.running = false;
        return;
      }
      this.scheduleReconnect();
      return;
    }
    if (!this.running) return;

    const base = WS_URL.replace(/\/ws\/?$/, "");
    const ws = new WebSocket(`${base}/ws?ticket=${encodeURIComponent(ticket)}`);
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      if (this.hasConnected) {
        this.emit({ type: "reconnected" });
      }
      this.hasConnected = true;
    };

    ws.onmessage = (e) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(String(e.data));
      } catch {
        return;
      }
      const event = toEvent(data);
      if (event) this.emit(event);
    };

    ws.onclose = (e) => {
      this.ws = null;
      if (!this.running) return;
      if (e.code === 4401) {
        this.running = false;
        return;
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (!this.running) return;
    const delay = Math.min(1000 * 2 ** this.attempt, MAX_BACKOFF_MS);
    this.attempt += 1;
    this.timer = setTimeout(() => void this.connect(), delay);
  }

  private emit(event: RealtimeEvent) {
    this.listeners.forEach((listener) => listener(event));
  }
}

export const chatSocket = new ChatSocketClient();
