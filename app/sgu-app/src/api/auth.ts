import { apiFetch, ApiError } from "./client";
import { clearAccessToken, setAccessToken } from "../storage/tokens";

type TokensResponse = {
  accessToken: string;
  passwordChangeRequired?: boolean;
};

type LoginResponse = Partial<TokensResponse> & {
  twoFactorRequired?: boolean;
  challenge?: string;
};

export type LoginResult =
  | { kind: "signedIn"; passwordChangeRequired: boolean }
  | { kind: "twoFactor"; challenge: string };

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

  await setAccessToken(body.accessToken);
  return { kind: "signedIn", passwordChangeRequired: body.passwordChangeRequired === true };
}

/** Bước 2 cho ADMIN/ROOT đã bật 2FA: challenge cộng mã TOTP hoặc mã khôi phục. */
export async function verifyTwoFactor(challenge: string, code: string): Promise<{ passwordChangeRequired: boolean }> {
  try {
    const body = await apiFetch<TokensResponse>(
      "/api/v1/auth/2fa/verify",
      { method: "POST", body: JSON.stringify({ challenge, code }) },
      false,
    );
    await setAccessToken(body.accessToken);
    return { passwordChangeRequired: body.passwordChangeRequired === true };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      throw new Error("Mã không đúng hoặc đã dùng. Đợi mã mới (mỗi mã đổi sau 30 giây) rồi thử lại.");
    }
    throw err;
  }
}

/**
 * Đổi mật khẩu. Máy chủ thu hồi mọi phiên đang có, nên người dùng phải đăng nhập lại.
 */
export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  await apiFetch<void>("/api/v1/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ oldPassword, newPassword }),
  });
  await clearAccessToken();
}

export async function logout(): Promise<void> {
  await clearAccessToken();
}