import { apiFetch, ApiError } from "./client";
import { clearSession, setAccessToken, setRefreshToken } from "../storage/tokens";

type TokensResponse = {
  accessToken: string;
  refreshToken?: string;
  passwordChangeRequired?: boolean;
};

type LoginResponse = Partial<TokensResponse> & {
  twoFactorRequired?: boolean;
  challenge?: string;
};

export type LoginResult =
  | { kind: "signedIn"; passwordChangeRequired: boolean }
  | { kind: "twoFactor"; challenge: string };

/** Lưu cặp token từ máy chủ. Refresh token chỉ có khi đăng nhập bằng app. */
async function storeTokens(body: TokensResponse): Promise<void> {
  await setAccessToken(body.accessToken);
  if (body.refreshToken) await setRefreshToken(body.refreshToken);
}

export async function login(username: string, password: string): Promise<LoginResult> {
  const body = await apiFetch<LoginResponse>(
    "/api/v1/auth/login",
    { method: "POST", body: JSON.stringify({ username, password }) },
    false,
  );

  if (body.twoFactorRequired && body.challenge) {
    return { kind: "twoFactor", challenge: body.challenge };
  }
  if (!body.accessToken) {
    throw new Error("Phản hồi đăng nhập không hợp lệ");
  }

  await storeTokens(body as TokensResponse);
  return { kind: "signedIn", passwordChangeRequired: body.passwordChangeRequired === true };
}

export type OtpRequest = { requestId: string; number: string; expiresAt: string };
export type OtpRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CONSUMED" | "EXPIRED";

/**
 * Bước 2 cho ADMIN/ROOT đã bật 2FA: challenge cộng một trong hai cách.
 * - code: mã TOTP hoặc mã khôi phục.
 * - requestId: yêu cầu đã được duyệt trên otp-app.
 */
export async function verifyTwoFactor(
  challenge: string,
  proof: { code?: string; requestId?: string },
): Promise<{ passwordChangeRequired: boolean }> {
  try {
    const body = await apiFetch<TokensResponse>(
      "/api/v1/auth/2fa/verify",
      { method: "POST", body: JSON.stringify({ challenge, ...proof }) },
      false,
    );
    await storeTokens(body);
    return { passwordChangeRequired: body.passwordChangeRequired === true };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      throw new Error(
        proof.requestId
          ? "Phiên duyệt đã hết hạn. Đăng nhập lại để thử lại."
          : "Mã không đúng hoặc đã dùng. Đợi mã mới (mỗi mã đổi sau 30 giây) rồi thử lại.",
      );
    }
    throw err;
  }
}

/**
 * Tạo yêu cầu duyệt trên otp-app và nhận số đối chiếu 2 chữ số.
 * Trả về null khi ADMIN/ROOT chưa ghép thiết bị (máy chủ trả 404), khi đó dùng mã TOTP.
 */
export async function startOtpRequest(challenge: string): Promise<OtpRequest | null> {
  try {
    return await apiFetch<OtpRequest>(
      "/api/v1/auth/2fa/otp/requests",
      { method: "POST", body: JSON.stringify({ challenge }) },
      false,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** Hỏi trạng thái yêu cầu duyệt. App gọi định kỳ cho đến khi có kết quả cuối. */
export async function getOtpRequestStatus(challenge: string, requestId: string): Promise<OtpRequestStatus> {
  const body = await apiFetch<{ status: OtpRequestStatus }>(
    "/api/v1/auth/2fa/otp/requests/status",
    { method: "POST", body: JSON.stringify({ challenge, requestId }) },
    false,
  );
  return body.status;
}

/**
 * Đổi mật khẩu. Máy chủ thu hồi mọi phiên đang có, nên người dùng phải đăng nhập lại.
 */
export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  await apiFetch<void>("/api/v1/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ oldPassword, newPassword }),
  });
  await clearSession();
}

export async function logout(): Promise<void> {
  await clearSession();
}
