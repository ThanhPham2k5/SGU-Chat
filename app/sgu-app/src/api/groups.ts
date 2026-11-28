import type { ChatSummary } from "./chats";
import { apiFetch } from "./client";

const BASE = "/api/v1/chats";
const enc = encodeURIComponent;

export type UserSuggestion = {
  id: string;
  username: string;
  name: string;
};

export type GroupMember = {
  userId: string;
  username: string;
  name: string;
  /** Quản trị viên nhóm (role ADMIN). Chỉ quản trị viên mới mời, xoá, đổi vai trò và đổi tên. */
  isAdmin: boolean;
  isOnline: boolean;
};

export type GroupDetails = {
  description: string | null;
  membersLimit: number;
  isPrivate: boolean;
  members: GroupMember[];
};

export type Invitation = {
  id: string;
  groupId: string;
  groupTitle: string;
  inviter: string;
};

export type MediaItem = {
  messageId: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: string;
  authorId: number | string;
  removedAt: string | null;
};

export type ReportCategory = "HARASSMENT" | "PROFANITY" | "SPAM" | "INAPPROPRIATE" | "OTHER";

export const REPORT_CATEGORIES: { value: ReportCategory; label: string }[] = [
  { value: "HARASSMENT", label: "Quấy rối, xúc phạm" },
  { value: "PROFANITY", label: "Từ ngữ thô tục" },
  { value: "SPAM", label: "Spam, quảng cáo" },
  { value: "INAPPROPRIATE", label: "Nội dung không phù hợp" },
  { value: "OTHER", label: "Khác" },
];

type BackendMember = {
  id: number;
  role: "MEMBER" | "ADMIN";
  joinedAt: string;
  details: { username: string; name: string; isOnline: boolean } | null;
};

type BackendGroupDetails = {
  description?: string | null;
  members: BackendMember[];
  membersLimit: number;
  isPrivate?: boolean;
};

/** Tìm người dùng theo tên hoặc tên đăng nhập. Server đã loại chính mình và các liên hệ. */
export async function searchUsers(keyword: string): Promise<UserSuggestion[]> {
  const users = await apiFetch<{ id: number | string; username: string; name: string }[]>(
    `/api/v1/users?username=${enc(keyword)}&offset=0&limit=8`,
  );
  return users.map((u) => ({ id: String(u.id), username: u.username, name: u.name }));
}

/**
 * Tạo hoặc mở lại đoạn chat riêng với người đã chọn.
 * Server chỉ trả id khi tạo (view New), nên dựng đủ thông tin từ người đã chọn để hiện tên ngay.
 */
export async function startDirectChat(recipient: UserSuggestion): Promise<ChatSummary> {
  const created = await apiFetch<{ id: string }>(BASE, {
    method: "POST",
    body: JSON.stringify({ recipient: Number(recipient.id) }),
  });
  return {
    id: String(created.id),
    type: "DUO",
    user: {
      id: Number(recipient.id),
      username: recipient.username,
      name: recipient.name,
      online: false,
      deleted: false,
    },
    pinned: false,
    pinnedAt: null,
    lastMessage: null,
  };
}

/** Tạo nhóm chat. Dựng đủ thông tin để hiện ngay, vì server chỉ trả id và tên khi tạo. */
export async function createGroup(name: string): Promise<ChatSummary> {
  const created = await apiFetch<{ id: string; name?: string | null }>(`${BASE}/group`, {
    method: "POST",
    body: JSON.stringify({ name, isPrivate: false }),
  });
  return {
    id: String(created.id),
    type: "GROUP",
    name: created.name || name,
    pinned: false,
    pinnedAt: null,
    lastMessage: null,
  };
}

/** Tên hiện tại của nhóm, dùng khi nhận sự kiện đổi tên realtime. */
export async function fetchGroupName(chatId: string): Promise<string | null> {
  const d = await apiFetch<{ name?: string | null }>(`${BASE}/generic/${enc(chatId)}`);
  return d.name ?? null;
}

export async function fetchGroupDetails(chatId: string): Promise<GroupDetails> {
  const d = await apiFetch<BackendGroupDetails>(`${BASE}/${enc(chatId)}/group`);
  return {
    description: d.description ?? null,
    membersLimit: d.membersLimit,
    isPrivate: d.isPrivate ?? false,
    members: d.members.map((m) => ({
      userId: String(m.id),
      username: m.details?.username ?? "",
      name: m.details?.name || m.details?.username || String(m.id),
      isAdmin: m.role === "ADMIN",
      isOnline: m.details?.isOnline ?? false,
    })),
  };
}

/** Server yêu cầu gửi đủ mọi trường khi đổi tên, nên truyền lại thông tin nhóm hiện tại. */
export function renameGroup(chatId: string, name: string, current: GroupDetails): Promise<void> {
  return apiFetch<void>(`${BASE}/${enc(chatId)}/group`, {
    method: "PATCH",
    body: JSON.stringify({
      name,
      description: current.description,
      membersLimit: current.membersLimit,
      isPrivate: current.isPrivate,
    }),
  });
}

export function inviteToGroup(chatId: string, username: string): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`${BASE}/${enc(chatId)}/invitations`, {
    method: "POST",
    body: JSON.stringify({ username }),
  });
}

export function removeMember(chatId: string, userId: string): Promise<void> {
  return apiFetch<void>(`${BASE}/${enc(chatId)}/group/members/${enc(userId)}`, { method: "DELETE" });
}

export function leaveGroup(chatId: string): Promise<void> {
  return apiFetch<void>(`${BASE}/${enc(chatId)}/group/members`, { method: "DELETE" });
}

/** Server nhận vai trò qua query param. */
export function changeMemberRole(chatId: string, userId: string, role: "MEMBER" | "ADMIN"): Promise<void> {
  return apiFetch<void>(
    `${BASE}/${enc(chatId)}/group/members/${enc(userId)}/roles?role=${role}`,
    { method: "PATCH" },
  );
}

export function listInvitations(): Promise<Invitation[]> {
  return apiFetch<Invitation[]>(`${BASE}/invitations`);
}

export function acceptInvitation(id: string): Promise<void> {
  return apiFetch<void>(`${BASE}/invitations/${enc(id)}/accept`, { method: "POST" });
}

export function declineInvitation(id: string): Promise<void> {
  return apiFetch<void>(`${BASE}/invitations/${enc(id)}/decline`, { method: "POST" });
}

/** Ghim hoặc bỏ ghim. Server trả 422 khi đã ghim đủ 5 cuộc trò chuyện. */
export function setPinned(chatId: string, pinned: boolean): Promise<void> {
  return apiFetch<void>(`${BASE}/${enc(chatId)}/pin`, { method: pinned ? "PUT" : "DELETE" });
}

/** Ảnh hoặc tệp của cuộc trò chuyện, phân trang theo offset. */
export function listMedia(
  chatId: string,
  kind: "IMAGE" | "FILE",
  offset = 0,
  limit = 30,
): Promise<MediaItem[]> {
  return apiFetch<MediaItem[]>(
    `${BASE}/${enc(chatId)}/media?kind=${kind}&offset=${offset}&limit=${limit}`,
  );
}

export function reportMessage(messageId: string, category: ReportCategory, reason?: string): Promise<void> {
  return apiFetch<void>(`${BASE}/messages/${enc(messageId)}/report`, {
    method: "POST",
    body: JSON.stringify({ category, reason: reason?.trim() ? reason.trim() : null }),
  });
}
