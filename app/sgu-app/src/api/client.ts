import { API_URL } from "../config";
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from "../storage/tokens";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let onSessionExpired: (() => void) | null = null;
let expiring = false;

/** Hàm chạy khi phiên đăng nhập hết hạn và không gia hạn được (đưa về màn đăng nhập). */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

function expireSession(): void {
  if (expiring) return;
  expiring = true;
  clearSession()
    .catch(() => {})
    .finally(() => {
      expiring = false;
      onSessionExpired?.();
    });
}

let pendingRefresh: Promise<boolean> | null = null;

/**
 * Đổi access token mới bằng refresh token lưu trên máy (gửi qua header).
 * Máy chủ xoay vòng refresh token, nên lưu token mới trả về. Nhiều yêu cầu 401 cùng lúc chỉ gọi một lần.
 */
function refreshAccessToken(): Promise<boolean> {
  if (!pendingRefresh) {
    pendingRefresh = (async () => {
      try {
        const refreshToken = await getRefreshToken();
        if (!refreshToken) return false;

        const res = await fetch(`${API_URL}/api/v1/auth/refresh-tokens`, {
          method: "POST",
          headers: {
            "X-Client": "mobile",
            "X-Refresh-Token": refreshToken,
          },
        });
        if (!res.ok) return false;

        const body = (await res.json()) as { accessToken?: string; refreshToken?: string };
        if (!body.accessToken) return false;
        await setAccessToken(body.accessToken);
        if (body.refreshToken) await setRefreshToken(body.refreshToken);
        return true;
      } catch {
        return false;
      } finally {
        pendingRefresh = null;
      }
    })();
  }
  return pendingRefresh;
}

async function send(path: string, init: RequestInit, auth: boolean): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Client": "mobile",
    ...((init.headers as Record<string, string>) ?? {}),
  };

  if (auth) {
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  return fetch(`${API_URL}${path}`, { ...init, headers });
}

/** Gọi REST qua api-gateway. auth = false cho các API không cần đăng nhập (ví dụ login). */
export async function apiFetch<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  let response = await send(path, init, auth);

  // Access token hết hạn: đổi token mới rồi gửi lại đúng một lần.
  if (auth && response.status === 401) {
    if (await refreshAccessToken()) {
      response = await send(path, init, auth);
    } else {
      expireSession();
    }
  }

  if (!response.ok) {
    let message = `Lỗi máy chủ (${response.status})`;
    try {
      const body = await response.json();
      message = body.message ?? body.error ?? message;
    } catch {
      // Không có nội dung JSON, giữ thông báo mặc định.
    }
    throw new ApiError(response.status, message);
  }

  // Phản hồi rỗng (204 hoặc 200 không có nội dung) thì trả về undefined.
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
