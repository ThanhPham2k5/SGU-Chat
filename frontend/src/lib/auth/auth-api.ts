import { ApiError, apiFetch } from "@/lib/api/client";
import { setAccessToken, setPasswordChangeRequired } from "@/lib/auth/session";

type TokensResponse = {
    refreshExpiration: string;
    accessToken: string;
    passwordChangeRequired?: boolean;
};

type LoginResponse = Partial<TokensResponse> & {
    twoFactorRequired?: boolean;
    challenge?: string;
};

/** Đăng nhập xong, hoặc cần nhập mã 2FA (chỉ ADMIN/ROOT đã bật 2FA). */
export type LoginResult = { kind: "signedIn" } | { kind: "twoFactor"; challenge: string };

export type TwoFactorSetup = {
    secret: string;
    otpauthUri: string;
};

export type RegisterInput = {
    username: string;
    password: string;
    name: string;
};

export async function login(username: string, password: string): Promise<LoginResult> {
    const body = await apiFetch<LoginResponse>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
        skipAuth: true,
        skipRefresh: true,
    });

    if (body.twoFactorRequired && body.challenge) {
        return { kind: "twoFactor", challenge: body.challenge };
    }
    if (!body.accessToken) {
        throw new Error("Phản hồi đăng nhập không hợp lệ");
    }
    setAccessToken(body.accessToken);
    setPasswordChangeRequired(body.passwordChangeRequired === true);
    return { kind: "signedIn" };
}

/**
 * Bước 2 khi đăng nhập. Gửi mã TOTP hoặc mã khôi phục (code), hoặc requestId đã được duyệt trên otp-app.
 * Challenge còn hiệu lực 5 phút.
 */
export async function verifyTwoFactor(
    challenge: string,
    proof: { code?: string; requestId?: string },
): Promise<void> {
    const body = await apiFetch<TokensResponse>("/api/v1/auth/2fa/verify", {
        method: "POST",
        body: JSON.stringify({ challenge, code: proof.code, requestId: proof.requestId }),
        skipAuth: true,
        skipRefresh: true,
    });
    setAccessToken(body.accessToken);
    setPasswordChangeRequired(body.passwordChangeRequired === true);
}

export type OtpRequest = { requestId: string; number: string; expiresAt: string };
export type OtpRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CONSUMED" | "EXPIRED";
export type OtpPairing = { code: string; expiresAt: string };
export type OtpDeviceStatus = {
    paired: boolean;
    totpEnabled: boolean;
    deviceName: string | null;
    pairedAt: string | null;
};

/**
 * Sau khi đúng mật khẩu: tạo yêu cầu duyệt trên otp-app và nhận số đối chiếu 2 chữ số.
 * Trả về null khi ADMIN/ROOT chưa ghép thiết bị (máy chủ trả 404), khi đó dùng mã TOTP.
 */
export async function startOtpRequest(challenge: string): Promise<OtpRequest | null> {
    try {
        return await apiFetch<OtpRequest>("/api/v1/auth/2fa/otp/requests", {
            method: "POST",
            body: JSON.stringify({ challenge }),
            skipAuth: true,
            skipRefresh: true,
        });
    } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
            return null;
        }
        throw err;
    }
}

/** Hỏi trạng thái yêu cầu duyệt. Web gọi định kỳ cho đến khi APPROVED, REJECTED hoặc EXPIRED. */
export async function getOtpRequestStatus(challenge: string, requestId: string): Promise<OtpRequestStatus> {
    const body = await apiFetch<{ status: OtpRequestStatus }>("/api/v1/auth/2fa/otp/requests/status", {
        method: "POST",
        body: JSON.stringify({ challenge, requestId }),
        skipAuth: true,
        skipRefresh: true,
    });
    return body.status;
}

/**
 * Tạo mã ghép thiết bị cho otp-app (mã dùng một lần, 2 phút). Cần access token ADMIN/ROOT.
 * Phải nhập đúng mật khẩu; nếu đã bật 2FA thì nhập thêm mã TOTP hiện tại.
 */
export function createOtpPairing(input: { password: string; code?: string }): Promise<OtpPairing> {
    return apiFetch<OtpPairing>("/api/v1/auth/2fa/otp/pairing", {
        method: "POST",
        body: JSON.stringify({ password: input.password, code: input.code || undefined }),
    });
}

export function getOtpDevice(): Promise<OtpDeviceStatus> {
    return apiFetch<OtpDeviceStatus>("/api/v1/auth/2fa/otp/device");
}

/** Gỡ ghép. Máy chủ đăng xuất mọi phiên của tài khoản, nên web phải đưa người dùng về trang đăng nhập. */
export function unpairOtpDevice(): Promise<void> {
    return apiFetch<void>("/api/v1/auth/2fa/otp/device", { method: "DELETE" });
}

export type TwoFactorReset = {
    userId: number;
    username: string;
    requestedAt: string;
    executeAfter: string;
};

/** ROOT (đã xác thực 2FA): danh sách yêu cầu đặt lại 2FA của ADMIN đang chờ. */
export function listTwoFactorResets(): Promise<TwoFactorReset[]> {
    return apiFetch<TwoFactorReset[]>("/api/v1/auth/2fa/admin/resets");
}

/** ROOT yêu cầu đặt lại 2FA cho một ADMIN. Có hiệu lực sau 24 giờ, trừ khi bị hủy. */
export function requestTwoFactorReset(username: string): Promise<void> {
    return apiFetch<void>("/api/v1/auth/2fa/admin/resets", {
        method: "POST",
        body: JSON.stringify({ username }),
    });
}

/** Thực hiện đặt lại khi đã hết thời gian chờ. Xóa 2FA, ghép thiết bị và đăng xuất tài khoản đó. */
export function executeTwoFactorReset(userId: number): Promise<void> {
    return apiFetch<void>(`/api/v1/auth/2fa/admin/resets/${userId}/execute`, { method: "POST" });
}

export function cancelTwoFactorReset(userId: number): Promise<void> {
    return apiFetch<void>(`/api/v1/auth/2fa/admin/resets/${userId}`, { method: "DELETE" });
}

/** Tạo bí mật mới. Cần access token của ADMIN/ROOT. */
export function setupTwoFactor(): Promise<TwoFactorSetup> {
    return apiFetch<TwoFactorSetup>("/api/v1/auth/2fa/setup", { method: "POST" });
}

/** Xác nhận mã đầu tiên và nhận 8 mã khôi phục (chỉ hiện một lần). */
const CODE_REJECTED = "Mã không đúng hoặc đã được dùng. Hãy đợi mã mới (mỗi mã đổi sau 30 giây) rồi thử lại.";

// Server trả 401 khi mã sai hoặc mã đã dùng trong cùng 30 giây. Thông báo mặc định của apiFetch
// lại nói "phiên hết hạn", nên thay bằng thông báo đúng.
async function withCodeErrors<T>(task: () => Promise<T>): Promise<T> {
    try {
        return await task();
    } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
            throw new ApiError(401, CODE_REJECTED);
        }
        throw err;
    }
}

export async function confirmTwoFactor(code: string): Promise<string[]> {
    return withCodeErrors(async () => {
        const body = await apiFetch<{ recoveryCodes: string[] }>("/api/v1/auth/2fa/confirm", {
            method: "POST",
            body: JSON.stringify({ code }),
        });
        return body.recoveryCodes;
    });
}

export function disableTwoFactor(code: string): Promise<void> {
    return withCodeErrors(() =>
        apiFetch<void>("/api/v1/auth/2fa/disable", {
            method: "POST",
            body: JSON.stringify({ code }),
        }),
    );
}

export async function register(input: RegisterInput): Promise<void> {
    await apiFetch<void>("/api/v1/users/register", {
        method: "POST",
        body: JSON.stringify(input),
        skipAuth: true,
        skipRefresh: true,
    });
}

/** Đổi mật khẩu. Máy chủ thu hồi mọi phiên và xóa cookie refresh, nên người dùng phải đăng nhập lại. */
export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
    await apiFetch<void>("/api/v1/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ oldPassword, newPassword }),
    });
    setAccessToken(null);
    setPasswordChangeRequired(false);
}

export async function logout(): Promise<void> {
    try {
        await apiFetch<void>("/api/v1/auth/logout", { method: "POST", skipRefresh: true });
    } finally {
        setAccessToken(null);
    }
}