import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { logout } from "../api/auth";
import { ChatSummary, MessageDto, chatTitle, clearChatHistory, fetchChats, messagePreview } from "../api/chats";
import { RealtimeEvent, chatSocket, eventToMessage } from "../api/chatSocket";
import {
  listInvitations,
  setPinned,
  startDirectChat,
  type UserSuggestion,
} from "../api/groups";
import ActionSheet, { type ActionItem } from "../components/ActionSheet";
import CreateGroupModal from "../components/CreateGroupModal";
import InvitationsModal from "../components/InvitationsModal";
import UserPickerModal from "../components/UserPickerModal";
import { formatTime } from "../utils/format";
import { BOTTOM_INSET, TOP_INSET } from "../utils/layout";
import { colors } from "../theme";

const PAGE_SIZE = 30;
// Tài khoản bot hệ thống: không ghim và không ẩn được (khớp với web).
const BOT_USERNAME = "sgu_bot";

type Props = {
  onOpenChat: (chat: ChatSummary) => void;
  onSignedOut: () => void;
};

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function isBot(chat: ChatSummary): boolean {
  return chat.type === "DUO" && chat.user?.username === BOT_USERNAME;
}

/** Đoạn chat đã ghim đứng trước, theo thời điểm ghim gần nhất. Phần còn lại giữ thứ tự của server. */
function sortChats(list: ChatSummary[]): ChatSummary[] {
  const pinned = list
    .filter((c) => c.pinned)
    .sort((a, b) => (b.pinnedAt ? Date.parse(b.pinnedAt) : 0) - (a.pinnedAt ? Date.parse(a.pinnedAt) : 0));
  return [...pinned, ...list.filter((c) => !c.pinned)];
}

function ChatRow({
  chat,
  onPress,
  onLongPress,
}: {
  chat: ChatSummary;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const title = chatTitle(chat);
  const last = chat.lastMessage;
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{title.trim().charAt(0).toUpperCase() || "?"}</Text>
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {title}
          </Text>
          {chat.pinned ? <Text style={styles.pinTag}>Ghim</Text> : null}
          {last ? <Text style={styles.rowTime}>{formatTime(last.createdAt)}</Text> : null}
        </View>
        <Text style={styles.rowPreview} numberOfLines={1}>
          {last ? messagePreview(last) : "Chưa có tin nhắn"}
        </Text>
      </View>
    </Pressable>
  );
}

export default function ChatListScreen({ onOpenChat, onSignedOut }: Props) {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invitationCount, setInvitationCount] = useState(0);

  const [menuOpen, setMenuOpen] = useState(false);
  const [dmPickerOpen, setDmPickerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [invitesOpen, setInvitesOpen] = useState(false);
  const [actionChat, setActionChat] = useState<ChatSummary | null>(null);

  // Giữ bản mới nhất của danh sách để trình xử lý sự kiện đọc đúng dữ liệu.
  const chatsRef = useRef(chats);
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  async function loadPage(offset: number, reset: boolean) {
    try {
      const page = await fetchChats(offset, PAGE_SIZE);
      setError(null);
      setChats((prev) => {
        if (reset) return page;
        const known = new Set(prev.map((c) => c.id));
        return [...prev, ...page.filter((c) => !known.has(c.id))];
      });
      setHasMore(page.length === PAGE_SIZE);
    } catch (err) {
      setError(errorText(err, "Không tải được danh sách chat."));
    }
  }

  function refreshInvitations() {
    listInvitations()
      .then((list) => setInvitationCount(list.length))
      .catch(() => {});
  }

  useEffect(() => {
    let active = true;
    fetchChats(0, PAGE_SIZE)
      .then((page) => {
        if (!active) return;
        setError(null);
        setChats(page);
        setHasMore(page.length === PAGE_SIZE);
      })
      .catch((err) => {
        if (active) setError(errorText(err, "Không tải được danh sách chat."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    refreshInvitations();
  }, []);

  // Cập nhật danh sách khi có sự kiện realtime.
  useEffect(() => {
    return chatSocket.subscribe((event: RealtimeEvent) => {
      if (event.type === "message") {
        const message: MessageDto = eventToMessage(event);
        const known = chatsRef.current.some((c) => c.id === event.chatId);
        if (!known) {
          loadPage(0, true);
          return;
        }
        setChats((prev) => {
          const target = prev.find((c) => c.id === event.chatId);
          if (!target) return prev;
          return [{ ...target, lastMessage: message }, ...prev.filter((c) => c.id !== event.chatId)];
        });
        return;
      }
      if (event.type === "chatDeleted") {
        setChats((prev) => prev.filter((c) => c.id !== event.chatId));
        return;
      }
      if (event.type === "membership") {
        loadPage(0, true);
        refreshInvitations();
        return;
      }
      if (event.type === "removed" || event.type === "updated" || event.type === "reconnected" || event.type === "renamed") {
        loadPage(0, true);
      }
    });
  }, []);

  async function refresh() {
    setRefreshing(true);
    await loadPage(0, true);
    refreshInvitations();
    setRefreshing(false);
  }

  async function loadMore() {
    if (!hasMore || loading || loadingMore || refreshing) return;
    setLoadingMore(true);
    await loadPage(chats.length, false);
    setLoadingMore(false);
  }

  async function handleLogout() {
    await logout();
    onSignedOut();
  }

  async function togglePin(chat: ChatSummary) {
    setError(null);
    try {
      await setPinned(chat.id, !chat.pinned);
      await loadPage(0, true);
    } catch (err) {
      // Server trả 422 khi đã ghim đủ 5 cuộc trò chuyện; hiện đúng thông báo đó.
      setError(errorText(err, "Không đổi được ghim."));
    }
  }

  function confirmHide(chat: ChatSummary) {
    Alert.alert(
      "Ẩn đoạn chat?",
      "Đoạn chat sẽ ẩn khỏi danh sách của bạn. Bạn chỉ thấy tin nhắn gửi sau thời điểm này.",
      [
        { text: "Huỷ", style: "cancel" },
        { text: "Ẩn", style: "destructive", onPress: () => hideChat(chat) },
      ],
    );
  }

  async function hideChat(chat: ChatSummary) {
    setError(null);
    try {
      // Ưu tiên WebSocket; chưa kết nối realtime thì gọi REST.
      if (!chatSocket.clearHistory(chat.id)) {
        await clearChatHistory(chat.id);
      }
      setChats((prev) => prev.filter((c) => c.id !== chat.id));
    } catch (err) {
      setError(errorText(err, "Không ẩn được đoạn chat."));
    }
  }

  async function startDm(user: UserSuggestion) {
    setDmPickerOpen(false);
    try {
      const chat = await startDirectChat(user);
      onOpenChat(chat);
    } catch (err) {
      setError(errorText(err, "Không mở được đoạn chat."));
    }
  }

  const menuActions: ActionItem[] = [
    { label: "Nhắn riêng", onPress: () => setDmPickerOpen(true) },
    { label: "Tạo nhóm", onPress: () => setCreateOpen(true) },
    {
      label: invitationCount > 0 ? `Lời mời vào nhóm (${invitationCount})` : "Lời mời vào nhóm",
      onPress: () => setInvitesOpen(true),
    },
  ];

  const rowActions: ActionItem[] = actionChat
    ? [
        {
          label: actionChat.pinned ? "Bỏ ghim" : "Ghim lên đầu",
          onPress: () => togglePin(actionChat),
        },
        {
          label: "Ẩn đoạn chat",
          destructive: true,
          onPress: () => confirmHide(actionChat),
        },
      ]
    : [];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Đoạn chat</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => setMenuOpen(true)} hitSlop={10} style={styles.plusButton}>
            <Text style={styles.plusText}>+</Text>
            {invitationCount > 0 ? <View style={styles.badge} /> : null}
          </Pressable>
          <Pressable onPress={handleLogout} hitSlop={8}>
            <Text style={styles.logout}>Đăng xuất</Text>
          </Pressable>
        </View>
      </View>

      {/* Thông báo lỗi nằm ngay dưới tiêu đề, không nằm đáy màn hình để không bị thanh điều hướng che. */}
      {error ? <Text style={styles.banner}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : (
        <FlatList
          data={sortChats(chats)}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ChatRow
              chat={item}
              onPress={() => onOpenChat(item)}
              onLongPress={() => {
                if (!isBot(item)) setActionChat(item);
              }}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={styles.footer} color={colors.primary} /> : undefined
          }
          ListEmptyComponent={<Text style={styles.empty}>Chưa có đoạn chat nào.</Text>}
          contentContainerStyle={
            chats.length === 0
              ? [styles.emptyContainer, { paddingBottom: BOTTOM_INSET }]
              : { paddingBottom: BOTTOM_INSET }
          }
        />
      )}

      {menuOpen ? <ActionSheet title="Tạo mới" actions={menuActions} onClose={() => setMenuOpen(false)} /> : null}

      {actionChat ? (
        <ActionSheet title={chatTitle(actionChat)} actions={rowActions} onClose={() => setActionChat(null)} />
      ) : null}

      {dmPickerOpen ? (
        <UserPickerModal title="Nhắn riêng" onPick={startDm} onClose={() => setDmPickerOpen(false)} />
      ) : null}

      {createOpen ? (
        <CreateGroupModal
          onCreated={(chat) => {
            setCreateOpen(false);
            onOpenChat(chat);
          }}
          onClose={() => setCreateOpen(false)}
        />
      ) : null}

      {invitesOpen ? (
        <InvitationsModal
          onChanged={() => {
            refreshInvitations();
            loadPage(0, true);
          }}
          onClose={() => setInvitesOpen(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface, paddingTop: TOP_INSET },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerTitle: { fontSize: 18, fontWeight: "600", color: colors.ink },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 16 },
  plusButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.tint,
  },
  plusText: { fontSize: 20, fontWeight: "600", color: colors.primary, marginTop: -2 },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  logout: { fontSize: 14, fontWeight: "600", color: colors.primary },
  loader: { marginTop: 40 },
  footer: { paddingVertical: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  rowPressed: { backgroundColor: colors.tint },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: colors.tint,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.primary, fontSize: 17, fontWeight: "600" },
  rowBody: { flex: 1, gap: 4 },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  rowTitle: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.ink },
  pinTag: { fontSize: 11, fontWeight: "600", color: colors.primary },
  rowTime: { fontSize: 12, color: colors.muted, fontVariant: ["tabular-nums"] },
  rowPreview: { fontSize: 14, color: colors.muted },
  separator: { height: 1, backgroundColor: colors.line, marginLeft: 72 },
  empty: { textAlign: "center", color: colors.muted, padding: 24 },
  emptyContainer: { flexGrow: 1, justifyContent: "center" },
  banner: {
    color: colors.danger,
    fontSize: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.tint,
  },
});
