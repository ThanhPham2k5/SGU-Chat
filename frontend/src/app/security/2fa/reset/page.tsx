"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { TextField } from "@/components/ui/TextField";
import { HELP, LINK, SECTION_TITLE } from "@/components/ui/styles";
import { ApiError } from "@/lib/api/client";
import {
    cancelTwoFactorReset,
    executeTwoFactorReset,
    listTwoFactorResets,
    requestTwoFactorReset,
} from "@/lib/auth/auth-api";
import type { TwoFactorReset } from "@/lib/auth/auth-api";
import { useAuthGate } from "@/lib/auth/useAuthGate";

type Feedback = { text: string; tone: "info" | "error" };

const DATE_TIME = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });

/**
 * ROOT đặt lại 2FA cho ADMIN khi ADMIN mất điện thoại.
 * Không tức thì: yêu cầu chỉ thực hiện được sau thời gian chờ (mặc định 24 giờ), và ROOT có thể hủy trong thời gian đó.
 * Thực hiện xong sẽ xóa 2FA, xóa thiết bị đã ghép và đăng xuất tài khoản ADMIN.
 */
export default function TwoFactorResetPage() {
    const { status, isRoot } = useAuthGate(true, true);
    const allowed = status === "ready" && isRoot;

    const [username, setUsername] = useState("");
    const [usernameError, setUsernameError] = useState<string | undefined>(undefined);
    const [items, setItems] = useState<TwoFactorReset[]>([]);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<Feedback | null>(null);

    useEffect(() => {
        if (!allowed) return;
        void reload();
        // reload chỉ đọc danh sách từ máy chủ, không cần đưa vào danh sách phụ thuộc
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allowed]);

    async function reload() {
        try {
            setItems(await listTwoFactorResets());
        } catch (err) {
            setNotice({ text: describe(err), tone: "error" });
        }
    }

    async function submitRequest(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const value = username.trim();
        if (!value) {
            setUsernameError("Nhập tên đăng nhập của ADMIN.");
            return;
        }
        setUsernameError(undefined);
        setBusy(true);
        setNotice(null);
        try {
            await requestTwoFactorReset(value);
            setUsername("");
            setNotice({ text: "Đã tạo yêu cầu. Xem thời gian có hiệu lực ở danh sách bên dưới.", tone: "info" });
            await reload();
        } catch (err) {
            setNotice({ text: describe(err), tone: "error" });
        } finally {
            setBusy(false);
        }
    }

    async function execute(item: TwoFactorReset) {
        if (!window.confirm(`Đặt lại 2FA cho ${item.username}? Tài khoản này sẽ bị đăng xuất và phải ghép lại otp-app.`)) return;
        await act(() => executeTwoFactorReset(item.userId), `Đã đặt lại 2FA cho ${item.username}.`);
    }

    async function cancel(item: TwoFactorReset) {
        await act(() => cancelTwoFactorReset(item.userId), `Đã hủy yêu cầu của ${item.username}.`);
    }

    async function act(task: () => Promise<void>, doneText: string) {
        setBusy(true);
        setNotice(null);
        try {
            await task();
            setNotice({ text: doneText, tone: "info" });
            await reload();
        } catch (err) {
            setNotice({ text: describe(err), tone: "error" });
        } finally {
            setBusy(false);
        }
    }

    if (!allowed) {
        return (
            <AuthLayout
                title="Đặt lại 2FA cho ADMIN"
                subtitle={status === "ready" ? "Chỉ ROOT đã xác thực 2FA mới được dùng trang này." : "Đang kiểm tra phiên đăng nhập..."}
                footer={<Link href="/chat" className={LINK}>Về trang chat</Link>}
            >
                <p className="text-sm text-muted">{status === "ready" ? "Bạn không có quyền truy cập." : ""}</p>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout
            title="Đặt lại 2FA cho ADMIN"
            subtitle="Dùng khi ADMIN mất điện thoại hoặc không còn truy cập otp-app."
            footer={<Link href="/security/2fa" className={LINK}>Quay lại thiết lập 2FA của bạn</Link>}
        >
            <div className="flex flex-col gap-6">
                <p className="text-sm leading-relaxed text-muted">
                    Đặt lại xóa 2FA, thiết bị đã ghép và đăng xuất tài khoản ADMIN. Yêu cầu chỉ thực hiện được sau thời gian chờ,
                    và có thể hủy trước khi hết thời gian.
                </p>

                <form noValidate onSubmit={submitRequest} className="flex flex-col gap-3" aria-busy={busy}>
                    <h2 className={SECTION_TITLE}>Yêu cầu đặt lại</h2>
                    <TextField
                        label="Tên đăng nhập của ADMIN"
                        name="resetUsername"
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        error={usernameError}
                    />
                    <Button type="submit" variant="secondary" disabled={busy} className="self-start">
                        Tạo yêu cầu
                    </Button>
                </form>

                {notice ? <Notice text={notice.text} tone={notice.tone} /> : null}

                <section className="flex flex-col gap-3 border-t border-line pt-5" aria-labelledby="reset-list-title">
                    <h2 id="reset-list-title" className={SECTION_TITLE}>Yêu cầu đang chờ</h2>
                    {items.length === 0 ? (
                        <p className={HELP}>Không có yêu cầu nào đang chờ.</p>
                    ) : (
                        <ul className="flex flex-col gap-3">
                            {items.map((item) => {
                                const ready = new Date(item.executeAfter).getTime() <= Date.now();
                                return (
                                    <li
                                        key={item.userId}
                                        className="flex flex-col gap-2 rounded-md border border-line bg-paper px-4 py-3"
                                    >
                                        <span className="font-medium text-ink">{item.username}</span>
                                        <span className={HELP}>Yêu cầu lúc {DATE_TIME.format(new Date(item.requestedAt))}</span>
                                        <span className={HELP}>
                                            {ready
                                                ? "Đã hết thời gian chờ, có thể thực hiện."
                                                : `Thực hiện được từ ${DATE_TIME.format(new Date(item.executeAfter))}`}
                                        </span>
                                        <div className="flex flex-wrap gap-2">
                                            {ready ? (
                                                <Button variant="danger" size="sm" disabled={busy} onClick={() => execute(item)}>
                                                    Thực hiện đặt lại
                                                </Button>
                                            ) : null}
                                            <Button variant="secondary" size="sm" disabled={busy} onClick={() => cancel(item)}>
                                                Hủy yêu cầu
                                            </Button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
            </div>
        </AuthLayout>
    );
}

function describe(err: unknown): string {
    if (err instanceof ApiError) return err.message;
    return "Đã có lỗi xảy ra. Vui lòng thử lại.";
}