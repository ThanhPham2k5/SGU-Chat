import type { Conversation } from "@/lib/chat/types";

/** Tài khoản bot hệ thống (username trong bảng users). */
export const BOT_USERNAME = "sgu_bot";

/**
 * Chuyển thời gian từ server sang mili giây.
 * Java có thể gửi phần thập phân nhiều hơn 3 chữ số; chỉ giữ mili giây để so sánh an toàn.
 */
export function timeValue(value: string): number {
    const t = Date.parse(value.replace(/(\.\d{3})\d+/, "$1"));
    return Number.isNaN(t) ? 0 : t;
}

/** Đưa các cuộc trò chuyện được ghim (chat bot) lên đầu, giữ nguyên thứ tự còn lại. */
export function pinnedFirst(list: Conversation[]): Conversation[] {
    return [...list].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
}