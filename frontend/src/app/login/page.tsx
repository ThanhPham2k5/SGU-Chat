"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { TextField } from "@/components/ui/TextField";
import { LINK } from "@/components/ui/styles";
import { ApiError } from "@/lib/api/client";
import {
    getOtpRequestStatus,
    login,
    startOtpRequest,
    verifyTwoFactor,
} from "@/lib/auth/auth-api";
import type { OtpRequest } from "@/lib/auth/auth-api";
import { isAdminUser } from "@/lib/auth/token";
import { hasErrors, validateLogin } from "@/lib/auth/validation";
import type { FieldErrors, LoginFields } from "@/lib/auth/validation";

type OtpPhase = "waiting" | "rejected" | "expired";

export default function LoginPage() {
    const router = useRouter();
    const [fields, setFields] = useState<LoginFields>({ username: "", password: "" });
    const [errors, setErrors] = useState<FieldErrors<keyof LoginFields>>({});
    const [serverError, setServerError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // Sau khi bật 2FA, trang thiết lập chuyển về đây với ?twofa=on
    const [info, setInfo] = useState<string | null>(null);
    useEffect(() => {
        if (new URLSearchParams(window.location.search).get("twofa") === "on") {
            setInfo("Đã bật xác thực hai lớp. Vui lòng đăng nhập lại bằng mật khẩu và mã xác thực.");
            window.history.replaceState(null, "", "/login");
        }
    }, []);

    // Có giá trị khi ADMIN/ROOT đã bật 2FA: chuyển sang bước xác thực
    const [challenge, setChallenge] = useState<string | null>(null);
    const [code, setCode] = useState("");
    const [codeError, setCodeError] = useState<string | undefined>(undefined);

    // Duyệt qua otp-app: có khi ADMIN/ROOT đã ghép thiết bị. Người dùng có thể chuyển sang mã TOTP.
    const [otp, setOtp] = useState<OtpRequest | null>(null);
    const [otpPhase, setOtpPhase] = useState<OtpPhase>("waiting");
    const [useTotp, setUseTotp] = useState(false);

    // Hỏi trạng thái mỗi 2 giây cho đến khi có kết quả
    useEffect(() => {
        // Hỏi trạng thái cả khi đang ở tab nhập mã 6 số, để duyệt trên app vẫn tự chuyển trang
        if (!challenge || !otp || otpPhase !== "waiting") return;
        let cancelled = false;
        const timer = window.setInterval(async () => {
            try {
                const status = await getOtpRequestStatus(challenge, otp.requestId);
                if (cancelled) return;
                if (status === "APPROVED") {
                    window.clearInterval(timer);
                    await verifyTwoFactor(challenge, { requestId: otp.requestId });
                    if (!cancelled) finishSignIn();
                } else if (status === "REJECTED") {
                    window.clearInterval(timer);
                    setOtpPhase("rejected");
                } else if (status === "EXPIRED" || status === "CONSUMED") {
                    window.clearInterval(timer);
                    setOtpPhase("expired");
                }
            } catch (error) {
                if (cancelled) return;
                window.clearInterval(timer);
                setServerError(describeTwoFactorError(error));
                setOtpPhase("expired");
            }
        }, 2000);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
        // finishSignIn chỉ dùng router và đọc localStorage, không cần đưa vào danh sách phụ thuộc
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [challenge, otp, otpPhase]);

    function handleChange(event: ChangeEvent<HTMLInputElement>) {
        const { name, value } = event.target;
        setFields((prev) => ({ ...prev, [name]: value }));
    }

    function finishSignIn() {
        router.replace(isAdminUser() ? "/admin" : "/chat");
    }

    async function requestOtp(nextChallenge: string) {
        try {
            const request = await startOtpRequest(nextChallenge);
            setOtp(request);
            setOtpPhase("waiting");
            setUseTotp(request === null);
        } catch {
            // Không tạo được yêu cầu duyệt thì vẫn cho nhập mã TOTP
            setOtp(null);
            setUseTotp(true);
        }
    }

    async function handleCredentials(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setServerError(null);

        const nextErrors = validateLogin(fields);
        setErrors(nextErrors);
        if (hasErrors(nextErrors)) {
            return;
        }

        setSubmitting(true);
        try {
            const result = await login(fields.username.trim(), fields.password);
            if (result.kind === "twoFactor") {
                setChallenge(result.challenge);
                setCode("");
                setCodeError(undefined);
                await requestOtp(result.challenge);
                setSubmitting(false);
                return;
            }
            finishSignIn();
        } catch (error) {
            setServerError(describeLoginError(error));
            setSubmitting(false);
        }
    }

    async function handleCode(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setServerError(null);

        const value = code.trim();
        if (!value) {
            setCodeError("Vui lòng nhập mã xác thực.");
            return;
        }
        setCodeError(undefined);
        if (!challenge) return;

        setSubmitting(true);
        try {
            await verifyTwoFactor(challenge, { code: value });
            finishSignIn();
        } catch (error) {
            setServerError(describeTwoFactorError(error));
            setSubmitting(false);
        }
    }

    async function resendOtp() {
        if (!challenge) return;
        setServerError(null);
        setOtpPhase("waiting");
        await requestOtp(challenge);
    }

    function backToCredentials() {
        setChallenge(null);
        setCode("");
        setCodeError(undefined);
        setServerError(null);
        setOtp(null);
        setUseTotp(false);
        setOtpPhase("waiting");
    }

    if (challenge && otp && !useTotp) {
        return (
            <AuthLayout
                title="Duyệt đăng nhập"
                subtitle="Mở ứng dụng otp-app trên điện thoại và chọn đúng số bên dưới rồi bấm Approve."
                footer={
                    <div className="flex flex-col gap-2">
                        <button type="button" onClick={() => setUseTotp(true)} className={`${LINK} cursor-pointer`}>
                            Không nhận được yêu cầu? Nhập mã 6 số
                        </button>
                        <button type="button" onClick={backToCredentials} className={`${LINK} cursor-pointer`}>
                            Quay lại đăng nhập
                        </button>
                    </div>
                }
            >
                <div className="flex flex-col items-center gap-3 rounded-md border border-line bg-paper px-4 py-6">
                    <span className="text-sm text-muted">Số đối chiếu</span>
                    <span className="font-mono text-5xl font-semibold tracking-widest text-ink" aria-live="polite">
                        {otp.number}
                    </span>
                </div>

                {otpPhase === "waiting" ? (
                    <p className="text-sm text-muted" aria-live="polite">Đang chờ bạn duyệt trên điện thoại...</p>
                ) : null}

                {otpPhase === "rejected" ? (
                    <Notice
                        text="Yêu cầu đã bị từ chối trên điện thoại. Nếu không phải bạn đăng nhập, hãy đổi mật khẩu ngay."
                        tone="error"
                    />
                ) : null}

                {otpPhase === "expired" && !serverError ? (
                    <Notice text="Yêu cầu đã hết hạn. Hãy gửi lại yêu cầu." tone="error" />
                ) : null}

                {serverError ? <Notice text={serverError} tone="error" /> : null}

                {otpPhase !== "waiting" ? (
                    <Button onClick={resendOtp} disabled={submitting}>
                        Gửi lại yêu cầu
                    </Button>
                ) : null}
            </AuthLayout>
        );
    }

    if (challenge) {
        return (
            <AuthLayout
                title="Xác thực hai lớp"
                subtitle="Nhập mã 6 số từ ứng dụng xác thực, hoặc một mã khôi phục chưa dùng."
                footer={
                    <div className="flex flex-col gap-2">
                        {otp ? (
                            <button type="button" onClick={() => setUseTotp(false)} className={`${LINK} cursor-pointer`}>
                                Dùng ứng dụng otp-app để duyệt
                            </button>
                        ) : null}
                        <button type="button" onClick={backToCredentials} className={`${LINK} cursor-pointer`}>
                            Quay lại đăng nhập
                        </button>
                    </div>
                }
            >
                <form noValidate onSubmit={handleCode} className="flex flex-col gap-5" aria-busy={submitting}>
                    <TextField
                        label="Mã xác thực"
                        name="code"
                        autoComplete="one-time-code"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={code}
                        onChange={(event) => setCode(event.target.value)}
                        error={codeError}
                        hint="Mã 6 số đổi mỗi 30 giây. Mã khôi phục chỉ dùng được một lần."
                    />

                    {serverError ? <Notice text={serverError} tone="error" /> : null}

                    <Button type="submit" disabled={submitting}>
                        {submitting ? "Đang xác thực..." : "Xác nhận"}
                    </Button>
                </form>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout
            title="Đăng nhập"
            subtitle="Dùng tên đăng nhập và mật khẩu của bạn."
            footer={<p>Tài khoản do nhà trường cấp. Nếu chưa có tài khoản, vui lòng liên hệ phòng ban phụ trách.</p>}
        >
            <form noValidate onSubmit={handleCredentials} className="flex flex-col gap-5" aria-busy={submitting}>
                {info ? <Notice text={info} tone="info" onClose={() => setInfo(null)} /> : null}

                <TextField
                    label="Tên đăng nhập"
                    name="username"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={fields.username}
                    onChange={handleChange}
                    error={errors.username}
                />

                <TextField
                    label="Mật khẩu"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    value={fields.password}
                    onChange={handleChange}
                    error={errors.password}
                />

                {serverError ? <Notice text={serverError} tone="error" /> : null}

                <Button type="submit" disabled={submitting}>
                    {submitting ? "Đang đăng nhập..." : "Đăng nhập"}
                </Button>
            </form>
        </AuthLayout>
    );
}

function describeLoginError(error: unknown): string {
    if (error instanceof ApiError) {
        if (error.status === 403) {
            return "Tài khoản đã bị khóa hoặc đã bị xóa. Vui lòng liên hệ phòng ban phụ trách.";
        }
        if (error.status === 400 || error.status === 401) {
            return "Tên đăng nhập hoặc mật khẩu không đúng.";
        }
        if (error.status === 429) {
            return "Bạn đã thử đăng nhập quá nhiều lần. Vui lòng đợi một lúc rồi thử lại.";
        }
        if (error.status >= 500) {
            return "Máy chủ đang gặp sự cố. Vui lòng thử lại sau.";
        }
    }
    return "Không kết nối được máy chủ. Vui lòng thử lại sau.";
}

function describeTwoFactorError(error: unknown): string {
    if (error instanceof ApiError) {
        if (error.status === 429) {
            return "Nhập sai quá nhiều lần. Vui lòng thử lại sau 5 phút.";
        }
        if (error.status === 400 || error.status === 401) {
            return "Mã không đúng hoặc phiên xác thực đã hết hạn (5 phút). Hãy kiểm tra lại hoặc đăng nhập lại.";
        }
        if (error.status >= 500) {
            return "Máy chủ đang gặp sự cố. Vui lòng thử lại sau.";
        }
    }
    return "Không kết nối được máy chủ. Vui lòng thử lại sau.";
}