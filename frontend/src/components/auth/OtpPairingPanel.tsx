"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import QRCode from "qrcode";

import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { TextField } from "@/components/ui/TextField";
import { HELP, LABEL, SECTION_TITLE } from "@/components/ui/styles";
import { ApiError } from "@/lib/api/client";
import {
    createOtpPairing,
    getOtpDevice,
    setupTwoFactor,
    unpairOtpDevice,
} from "@/lib/auth/auth-api";
import type { OtpDeviceStatus, OtpPairing } from "@/lib/auth/auth-api";
import { setAccessToken } from "@/lib/auth/session";

type Feedback = { text: string; tone: "info" | "error" };

const DATE_TIME = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });

/**
 * Bật 2FA và ghép otp-app. Không dùng app xác thực bên thứ ba:
 * web tạo bí mật TOTP và mã ghép, otp-app quét mã, rồi app tự xác nhận bật 2FA.
 * Tạo mã ghép cần mật khẩu, và mã TOTP hiện tại nếu đã bật 2FA.
 */
export function OtpPairingPanel({ onEnabled }: { onEnabled?: () => void }) {
    const router = useRouter();
    const [device, setDevice] = useState<OtpDeviceStatus | null>(null);
    const [pairing, setPairing] = useState<OtpPairing | null>(null);
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<Feedback | null>(null);

    const [formOpen, setFormOpen] = useState(false);
    const [password, setPassword] = useState("");
    const [totp, setTotp] = useState("");

    useEffect(() => {
        getOtpDevice()
            .then(setDevice)
            .catch((err) => setNotice({ text: describe(err), tone: "error" }));
    }, []);

    // Hỏi trạng thái mỗi 3 giây khi đang chờ ghép hoặc chờ app xác nhận bật 2FA
    const waiting = pairing !== null || (device?.paired === true && device.totpEnabled === false);
    useEffect(() => {
        if (!waiting) return;
        const timer = window.setInterval(() => {
            getOtpDevice()
                .then((status) => {
                    setDevice(status);
                    if (status.paired && status.totpEnabled) {
                        setPairing(null);
                        setQrDataUrl(null);
                        setNotice({ text: "Đã bật xác thực hai lớp qua otp-app.", tone: "info" });
                        onEnabled?.();
                    } else if (status.paired && pairing) {
                        setPairing(null);
                        setQrDataUrl(null);
                    }
                })
                .catch(() => undefined);
        }, 3000);
        return () => window.clearInterval(timer);
    }, [waiting, pairing, onEnabled]);

    async function startPairing(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setNotice(null);
        if (!password) {
            setNotice({ text: "Nhập mật khẩu để tiếp tục.", tone: "error" });
            return;
        }
        const alreadyEnabled = device?.totpEnabled === true;
        if (alreadyEnabled && !totp.trim()) {
            setNotice({ text: "Nhập mã 6 số từ otp-app hoặc mã khôi phục.", tone: "error" });
            return;
        }

        setBusy(true);
        try {
            // Lần bật 2FA đầu tiên: tạo bí mật TOTP trước khi cấp mã ghép
            if (!alreadyEnabled) {
                await setupTwoFactor();
            }
            const created = await createOtpPairing({
                password,
                code: alreadyEnabled ? totp.trim() : undefined,
            });
            // QR được tạo trên trình duyệt, không gọi dịch vụ ngoài
            setQrDataUrl(await QRCode.toDataURL(created.code, { width: 224, margin: 1 }));
            setPairing(created);
            setFormOpen(false);
            setPassword("");
            setTotp("");
        } catch (err) {
            setNotice({ text: describe(err), tone: "error" });
        } finally {
            setBusy(false);
        }
    }

    async function unpair() {
        if (!window.confirm("Gỡ ghép thiết bị? Thao tác này tắt 2FA và đăng xuất mọi phiên của tài khoản.")) return;
        setBusy(true);
        setNotice(null);
        try {
            await unpairOtpDevice();
            // Máy chủ đã đăng xuất mọi phiên, nên xóa token trên trình duyệt và về trang đăng nhập
            setAccessToken(null);
            router.replace("/login");
        } catch (err) {
            setNotice({ text: describe(err), tone: "error" });
            setBusy(false);
        }
    }

    const enabled = device?.paired === true && device.totpEnabled === true;
    const pendingConfirm = device?.paired === true && device.totpEnabled === false;

    return (
        <section className="flex flex-col gap-3" aria-labelledby="otp-pairing-title">
            <h2 id="otp-pairing-title" className={SECTION_TITLE}>Bật và ghép ứng dụng otp-app</h2>

            {enabled ? (
                <div className="flex flex-col gap-3">
                    <p className="text-sm text-ink">
                        Đã bật 2FA. Thiết bị: <span className="font-medium">{device?.deviceName}</span>
                        {device?.pairedAt ? ` (ghép ngày ${DATE_TIME.format(new Date(device.pairedAt))})` : ""}
                    </p>
                    <p className={HELP}>
                        Xóa otp-app trên điện thoại mà chưa gỡ ở đây thì vẫn bị đòi duyệt. Gỡ ghép ở đây hoặc trong otp-app
                        đều tắt 2FA và đăng xuất tài khoản.
                    </p>
                    <Button variant="danger" size="sm" onClick={unpair} disabled={busy} className="self-start">
                        Gỡ ghép thiết bị
                    </Button>
                </div>
            ) : pendingConfirm ? (
                <div className="flex flex-col gap-3">
                    <p className="text-sm leading-relaxed text-ink">
                        Đã ghép thiết bị <span className="font-medium">{device?.deviceName}</span>.
                        Mở otp-app, chọn &quot;Xác nhận bật 2FA&quot; để hoàn tất. Trang sẽ tự cập nhật.
                    </p>
                    <Button variant="secondary" size="sm" onClick={unpair} disabled={busy} className="self-start">
                        Hủy ghép
                    </Button>
                </div>
            ) : pairing && qrDataUrl ? (
                <div className="flex flex-col gap-3">
                    <p className="text-sm leading-relaxed text-ink">
                        Mở otp-app trên điện thoại, chọn &quot;Ghép thiết bị&quot; rồi quét mã QR này. Mã dùng một lần trong 2 phút.
                    </p>
                    {/* Ảnh QR tạo từ dữ liệu trên trình duyệt (data URL), nên không dùng next/image */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={qrDataUrl}
                        alt="Mã QR để ghép ứng dụng otp-app"
                        width={224}
                        height={224}
                        className="self-center rounded-md border border-line bg-surface p-2"
                    />
                    <div className="flex flex-col gap-1">
                        <span className={LABEL}>Hoặc nhập mã ghép</span>
                        <code className="break-all rounded-md border border-line bg-paper px-3 py-2 font-mono text-sm">
                            {pairing.code}
                        </code>
                    </div>
                    <p className={HELP}>Đang chờ ghép... Trang sẽ tự cập nhật khi xong.</p>
                </div>
            ) : formOpen ? (
                <form noValidate onSubmit={startPairing} className="flex flex-col gap-4" aria-busy={busy}>
                    <p className="text-sm leading-relaxed text-muted">
                        Xác nhận danh tính để tạo mã ghép.
                    </p>
                    <TextField
                        label="Mật khẩu"
                        name="pairPassword"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                    />
                    {device?.totpEnabled ? (
                        <TextField
                            label="Mã 6 số từ otp-app hoặc mã khôi phục"
                            name="pairCode"
                            autoComplete="one-time-code"
                            spellCheck={false}
                            value={totp}
                            onChange={(event) => setTotp(event.target.value)}
                            hint="Nhập sai 5 lần sẽ khóa 5 phút."
                        />
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                        <Button type="submit" size="sm" disabled={busy}>
                            {busy ? "Đang tạo mã..." : "Tạo mã ghép"}
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            onClick={() => {
                                setFormOpen(false);
                                setPassword("");
                                setTotp("");
                                setNotice(null);
                            }}
                        >
                            Hủy
                        </Button>
                    </div>
                </form>
            ) : (
                <div className="flex flex-col gap-3">
                    <p className="text-sm leading-relaxed text-muted">
                        Bạn chỉ cần ứng dụng otp-app, không cần app xác thực nào khác.
                    </p>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                            setNotice(null);
                            setFormOpen(true);
                        }}
                        disabled={busy}
                        className="self-start"
                    >
                        {device?.totpEnabled ? "Ghép thiết bị otp-app" : "Bật 2FA bằng otp-app"}
                    </Button>
                </div>
            )}

            {notice ? <Notice text={notice.text} tone={notice.tone} /> : null}
        </section>
    );
}

function describe(err: unknown): string {
    if (err instanceof ApiError) return err.message;
    return "Đã có lỗi xảy ra. Vui lòng thử lại.";
}
