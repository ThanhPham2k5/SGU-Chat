"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";

import { AuthLayout } from "@/components/auth/AuthLayout";
import { OtpPairingPanel } from "@/components/auth/OtpPairingPanel";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { TextField } from "@/components/ui/TextField";
import { LINK, SECTION_TITLE } from "@/components/ui/styles";
import { ApiError } from "@/lib/api/client";
import { disableTwoFactor } from "@/lib/auth/auth-api";
import { setAccessToken } from "@/lib/auth/session";
import { useAuthGate } from "@/lib/auth/useAuthGate";

type Feedback = { text: string; tone: "info" | "error" };

export default function TwoFactorPage() {
    const router = useRouter();
    const { status, isRoot } = useAuthGate(true);

    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<Feedback | null>(null);

    if (status !== "ready") {
        return (
            <AuthLayout
                title="Xác thực hai lớp"
                subtitle={status === "forbidden" ? "Trang này chỉ dành cho ADMIN và ROOT." : "Đang kiểm tra phiên đăng nhập..."}
                footer={<Link href="/chat" className={LINK}>Về trang chat</Link>}
            >
                <p className="text-sm text-muted">{status === "forbidden" ? "Bạn không có quyền truy cập." : ""}</p>
            </AuthLayout>
        );
    }

    async function disable(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const value = code.trim();
        if (!value) {
            setNotice({ text: "Nhập mã 6 số từ otp-app hoặc mã khôi phục để tắt 2FA.", tone: "error" });
            return;
        }
        if (!window.confirm("Tắt xác thực hai lớp? Mọi phiên đăng nhập sẽ bị đăng xuất và bạn phải đăng nhập lại.")) return;
        setBusy(true);
        setNotice(null);
        try {
            await disableTwoFactor(value);
            // Máy chủ đã đăng xuất mọi phiên sau khi tắt 2FA
            setAccessToken(null);
            router.replace("/login");
        } catch (err) {
            setNotice({ text: err instanceof ApiError ? err.message : "Đã có lỗi xảy ra. Vui lòng thử lại.", tone: "error" });
        } finally {
            setBusy(false);
        }
    }

    return (
        <AuthLayout
            title="Xác thực hai lớp"
            subtitle="ADMIN và ROOT đăng nhập bằng ứng dụng otp-app. Không cần app xác thực bên thứ ba."
            footer={
                <div className="flex flex-col gap-2">
                    {isRoot ? (
                        <Link href="/security/2fa/reset" className={LINK}>Đặt lại 2FA cho ADMIN</Link>
                    ) : null}
                    <Link href="/admin" className={LINK}>Quay lại trang quản trị</Link>
                </div>
            }
        >
            <div className="flex flex-col gap-6">
                <OtpPairingPanel />

                <form noValidate onSubmit={disable} className="flex flex-col gap-3 border-t border-line pt-5">
                    <h2 className={SECTION_TITLE}>Tắt xác thực hai lớp</h2>
                    <TextField
                        label="Mã 6 số từ otp-app hoặc mã khôi phục"
                        name="disableCode"
                        autoComplete="one-time-code"
                        spellCheck={false}
                        value={code}
                        onChange={(event) => setCode(event.target.value)}
                    />
                    {notice ? <Notice text={notice.text} tone={notice.tone} /> : null}
                    <Button type="submit" variant="danger" disabled={busy}>
                        Tắt 2FA
                    </Button>
                </form>
            </div>
        </AuthLayout>
    );
}
