import { API_URL } from '../config';
import { signMessage } from '../crypto/keys';

export type PendingRequest = {
  requestId: string;
  number: string;
  createdAt: string;
  expiresAt: string;
};

export type Decision = 'APPROVE' | 'REJECT';

export class OtpApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new OtpApiError(0, 'Không kết nối được máy chủ. Kiểm tra mạng hoặc kết nối USB (adb reverse).');
  }
  if (!res.ok) {
    throw new OtpApiError(res.status, await readMessage(res));
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

async function readMessage(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as { message?: string };
    return json.message ?? `Lỗi ${res.status}`;
  } catch {
    return `Lỗi ${res.status}`;
  }
}

export function pairDevice(code: string, publicKeySpki: string, deviceName: string) {
  return post<{ deviceId: string; totpSecret: string | null; username: string }>('/api/v1/auth/2fa/otp/pair', {
    code,
    publicKey: publicKeySpki,
    deviceName,
  });
}

export function fetchPending(deviceId: string, privateKey: string): Promise<PendingRequest[]> {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signMessage(privateKey, `pending|${deviceId}|${timestamp}`);
  return post<PendingRequest[]>('/api/v1/auth/2fa/otp/pending', { deviceId, timestamp, signature });
}

export function decideRequest(requestId: string, decision: Decision, deviceId: string, privateKey: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signMessage(privateKey, `decision|${requestId}|${decision}|${deviceId}|${timestamp}`);
  return post<void>(`/api/v1/auth/2fa/otp/requests/${encodeURIComponent(requestId)}/decision`, {
    deviceId,
    decision,
    timestamp,
    signature,
  });
}

/**
 * Gỡ thiết bị trên máy chủ, gọi trước khi xoá khóa trên điện thoại.
 * Máy chủ xoá thiết bị và đăng xuất mọi phiên của tài khoản.
 * Trả 401 khi máy chủ không còn thiết bị này (đã gỡ trên web), khi đó coi như đã thu hồi.
 */
export function revokeDevice(deviceId: string, privateKey: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signMessage(privateKey, `revoke|${deviceId}|${timestamp}`);
  return post<void>('/api/v1/auth/2fa/otp/device/revoke', { deviceId, timestamp, signature });
}

export function enrollDevice(deviceId: string, code: string, privateKey: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signMessage(privateKey, `enroll|${deviceId}|${code}|${timestamp}`);
  return post<{ recoveryCodes: string[] }>('/api/v1/auth/2fa/otp/enroll', { deviceId, code, timestamp, signature });
}
