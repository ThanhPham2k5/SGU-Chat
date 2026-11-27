import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { logout } from "../api/auth";
import { ChatSummary, MessageDto, chatTitle, fetchChats, messagePreview } from "../api/chats";
import { RealtimeEvent, chatSocket, eventToMessage } from "../api/chatSocket";
import { formatTime } from "../utils/format";
import { BOTTOM_INSET, TOP_INSET } from "../utils/layout";
import { colors } from "../theme";

const PAGE_SIZE = 30;

type Props = {
  onOpenChat: (chat: ChatSummary) => void;
  onSignedOut: () => void;
};

function ChatRow({ chat, onPress }: { chat: ChatSummary; onPress: () => void }) {
  const title = chatTitle(chat);
  const last = chat.lastMessage;
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{title.trim().charAt(0).toUpperCase() || "?"}</Text>
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {title}
          </Text>
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

  // Giữ bản mới nhất của danh sách để trình xử lý sự kiện đọc đúng dữ liệu.
  const chatsRef = useRef(chats);
  chatsRef.current = chats;

  async function loadPage(offset: number, reset: boolean) {
    try {
      setError(null);
      const page = await fetchChats(offset, PAGE_SIZE);
      setChats((prev) => {
        if (reset) return page;
        const known = new Set(prev.map((c) => c.id));
        return [...prev, ...page.filter((c) => !known.has(c.id))];
      });
      setHasMore(page.length === PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được danh sách chat.");
    }
  }

  useEffect(() => {
    loadPage(0, true).finally(() => setLoading(false));
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
      if (event.type === "removed" || event.type === "updated" || event.type === "membership" || event.type === "reconnected") {
        loadPage(0, true);
      }
    });
  }, []);

  async function refresh() {
    setRefreshing(true);
    await loadPage(0, true);
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

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Đoạn chat</Text>
        <Pressable onPress={handleLogout} hitSlop={8}>
          <Text style={styles.logout}>Đăng xuất</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ChatRow chat={item} onPress={() => onOpenChat(item)} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={styles.footer} color={colors.primary} /> : null
          }
          ListEmptyComponent={
            <Text style={styles.empty}>{error ?? "Chưa có đoạn chat nào."}</Text>
          }
          contentContainerStyle={
            chats.length === 0
              ? [styles.emptyContainer, { paddingBottom: BOTTOM_INSET }]
              : { paddingBottom: BOTTOM_INSET }
          }
        />
      )}

      {error && chats.length > 0 ? <Text style={styles.error}>{error}</Text> : null}
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
  rowTop: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  rowTitle: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.ink },
  rowTime: { fontSize: 12, color: colors.muted, fontVariant: ["tabular-nums"] },
  rowPreview: { fontSize: 14, color: colors.muted },
  separator: { height: 1, backgroundColor: colors.line, marginLeft: 72 },
  empty: { textAlign: "center", color: colors.muted, padding: 24 },
  emptyContainer: { flexGrow: 1, justifyContent: "center" },
  error: { color: colors.danger, fontSize: 14, padding: 12 },
});