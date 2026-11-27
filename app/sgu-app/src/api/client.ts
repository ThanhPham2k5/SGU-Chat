import { API_URL } from "../config";
import { getAccessToken } from "../storage/tokens";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Gọi REST qua api-gateway. auth = false cho các API không cần đăng nhập (ví dụ login). */
export async function apiFetch<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) ?? {}),
  };

  if (auth) {
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });

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