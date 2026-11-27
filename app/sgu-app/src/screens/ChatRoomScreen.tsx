import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import {
  ChatSummary,
  MAX_FILE_BYTES,
  MessageDto,
  chatTitle,
  fetchMessages,
  messagePreview,
  sendText,
  uploadFile,
} from "../api/chats";
import { RealtimeEvent, chatSocket, eventToMessage } from "../api/chatSocket";
import {
  authHeaders,
  downloadMessageFile,
  formatSize,
  isDownloaded,
  isImage,
  messageFileUrl,
  openMessageFile,
  saveImageToGallery,
} from "../api/files";
import { formatTime, timeValue } from "../utils/format";
import { BOTTOM_INSET, TOP_INSET } from "../utils/layout";
import { colors } from "../theme";

const PAGE_SIZE = 30;

type Props = {
  chat: ChatSummary;
  myId: number | null;
  onBack: () => void;
};

function mergeNewestFirst(prev: MessageDto[], incoming: MessageDto[]): MessageDto[] {
  const known = new Set(prev.map((m) => m.id));
  const merged = [...prev, ...incoming.filter((m) => !known.has(m.id))];
  return merged.sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt));
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export default function ChatRoomScreen({ chat, myId, onBack }: Props) {
  // Tin nhắn xếp mới nhất trước, hiển thị ngược để tin mới nằm dưới cùng.
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState<Record<string, boolean>>({});
  const [viewing, setViewing] = useState<MessageDto | null>(null);
  const [headers, setHeaders] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    authHeaders().then(setHeaders).catch(() => {});
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardOpen(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Kiểm tra tệp nào đã được tải về máy (chỉ với tệp không phải ảnh).
  useEffect(() => {
    for (const m of messages) {
      if (!m.filename || m.removedAt || isImage(m.contentType) || downloaded[m.id] !== undefined) continue;
      isDownloaded(m.id, m.filename)
        .then((ok) => setDownloaded((prev) => ({ ...prev, [m.id]: ok })))
        .catch(() => {});
    }
  }, [messages]);

  async function loadPage(offset: number) {
    const page = await fetchMessages(chat.id, offset, PAGE_SIZE);
    setMessages((prev) => mergeNewestFirst(prev, page));
    setHasMore(page.length === PAGE_SIZE);
  }

  useEffect(() => {
    setLoading(true);
    loadPage(0)
      .catch((err) => setError(errorText(err, "Không tải được tin nhắn.")))
      .finally(() => setLoading(false));
  }, [chat.id]);

  // Nhận tin realtime của đoạn chat này.
  useEffect(() => {
    return chatSocket.subscribe((event: RealtimeEvent) => {
      switch (event.type) {
        case "message":
          if (event.chatId !== chat.id) return;
          setMessages((prev) => mergeNewestFirst(prev, [eventToMessage(event)]));
          return;
        case "removed":
          if (event.chatId !== chat.id) return;
          setMessages((prev) => prev.map((m) => (m.id === event.id ? { ...m, removedAt: event.timestamp } : m)));
          return;
        case "updated":
          if (event.chatId !== chat.id) return;
          setMessages((prev) => prev.map((m) => (m.id === event.id ? { ...m, text: event.text } : m)));
          return;
        case "historyCleared":
          if (event.chatId === chat.id) setMessages([]);
          return;
        case "chatDeleted":
          if (event.chatId === chat.id) onBack();
          return;
        case "reconnected":
          loadPage(0).catch(() => {});
          return;
        default:
          return;
      }
    });
  }, [chat.id, onBack]);

  async function loadOlder() {
    if (!hasMore || loading || loadingMore) return;
    setLoadingMore(true);
    try {
      await loadPage(messages.length);
    } catch (err) {
      setError(errorText(err, "Không tải thêm được tin nhắn."));
    } finally {
      setLoadingMore(false);
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setError(null);
    setDraft("");

    // Qua WebSocket thì server sẽ phát lại tin, nên không cần thêm vào danh sách ở đây.
    if (chatSocket.sendText(chat.id, text)) return;

    // Chưa kết nối realtime thì gửi qua REST.
    setSending(true);
    try {
      const sent = await sendText(chat.id, text);
      const mine: MessageDto = { ...sent, author: { id: myId ?? 0, username: "", name: "" } };
      setMessages((prev) => mergeNewestFirst(prev, [mine]));
    } catch (err) {
      setDraft(text);
      setError(errorText(err, "Gửi tin nhắn thất bại."));
    } finally {
      setSending(false);
    }
  }

  async function attach() {
    if (uploadProgress !== null) return;
    setError(null);

    const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: true });
    if (picked.canceled || picked.assets.length === 0) return;

    const files = picked.assets;
    const tooBig = files.find((f) => f.size && f.size > MAX_FILE_BYTES);
    if (tooBig) {
      setError(`"${tooBig.name}" vượt quá 10 MB.`);
      return;
    }

    // Server chỉ nhận một tệp mỗi lần, nên gửi lần lượt.
    let done = 0;
    try {
      for (const file of files) {
        setUploadProgress(`${done + 1}/${files.length}`);
        const created = await uploadFile(chat.id, file);
        // Server phát lại qua WebSocket. Nếu chưa có realtime thì tự thêm vào danh sách.
        if (!chatSocket.sendFile(chat.id, created)) {
          const mine: MessageDto = {
            id: created.id,
            createdAt: created.createdAt,
            text: null,
            filename: created.filename,
            contentType: created.contentType,
            size: created.size,
            author: { id: myId ?? 0, username: "", name: "" },
          };
          setMessages((prev) => mergeNewestFirst(prev, [mine]));
        }
        done += 1;
      }
    } catch (err) {
      setError(`Đã gửi ${done}/${files.length} tệp. ${errorText(err, "Tải tệp lên thất bại.")}`);
    } finally {
      setUploadProgress(null);
    }
  }

  async function download(message: MessageDto) {
    if (!message.filename || busyId) return;
    setBusyId(message.id);
    setError(null);
    try {
      await downloadMessageFile(message.id, message.filename);
      setDownloaded((prev) => ({ ...prev, [message.id]: true }));
    } catch (err) {
      setError(errorText(err, "Không tải được tệp."));
    } finally {
      setBusyId(null);
    }
  }

  async function open(message: MessageDto) {
    if (!message.filename || busyId) return;
    setBusyId(message.id);
    setError(null);
    try {
      await openMessageFile(message.id, message.filename, message.contentType);
    } catch (err) {
      setError(errorText(err, "Không mở được tệp."));
    } finally {
      setBusyId(null);
    }
  }

  const isGroup = chat.type === "GROUP";
  const subtitle = isGroup ? "Nhóm" : chat.user?.online ? "Đang hoạt động" : "Ngoại tuyến";
  const uploading = uploadProgress !== null;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.back}>‹ Quay lại</Text>
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {chatTitle(chat)}
          </Text>
          <Text style={styles.headerSub}>{subtitle}</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={styles.body} behavior="padding">
        {loading ? (
          <ActivityIndicator style={styles.loader} color={colors.primary} />
        ) : (
          <FlatList
            data={messages}
            inverted
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            onEndReached={loadOlder}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              loadingMore ? <ActivityIndicator style={styles.footer} color={colors.primary} /> : null
            }
            ListEmptyComponent={<Text style={styles.empty}>Chưa có tin nhắn nào.</Text>}
            renderItem={({ item }) => {
              const mine = myId !== null && item.author?.id === myId;
              return (
                <Bubble
                  message={item}
                  mine={mine}
                  showAuthor={isGroup}
                  headers={headers}
                  busy={busyId === item.id}
                  downloaded={downloaded[item.id]}
                  onView={() => setViewing(item)}
                  onDownload={() => download(item)}
                  onOpen={() => open(item)}
                />
              );
            }}
          />
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={[styles.inputRow, { paddingBottom: keyboardOpen ? 8 : BOTTOM_INSET }]}>
          <Pressable
            style={({ pressed }) => [styles.attachButton, (uploading || pressed) && styles.attachPressed]}
            onPress={attach}
            disabled={uploading}
          >
            <Text style={styles.attachText}>{uploading ? uploadProgress : "Tệp"}</Text>
          </Pressable>
          <TextInput
            style={styles.input}
            placeholder="Nhập tin nhắn"
            placeholderTextColor={colors.muted}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={send}
            returnKeyType="send"
            editable={!sending}
            maxLength={512}
          />
          <Pressable
            style={({ pressed }) => [
              styles.sendButton,
              (!draft.trim() || sending) && styles.sendDisabled,
              pressed && styles.sendPressed,
            ]}
            onPress={send}
            disabled={!draft.trim() || sending}
          >
            {sending ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.sendText}>Gửi</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {viewing ? <ImageViewer message={viewing} headers={headers} onClose={() => setViewing(null)} /> : null}
    </View>
  );
}

function ImageViewer({
  message,
  headers,
  onClose,
}: {
  message: MessageDto;
  headers: Record<string, string>;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function save() {
    if (saving) return;
    setSaving(true);
    setNotice(null);
    try {
      await saveImageToGallery(message.id, message.filename ?? "image.jpg");
      setNotice("Đã lưu vào bộ sưu tập.");
    } catch (err) {
      setNotice(errorText(err, "Không lưu được ảnh."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.viewer}>
        <View style={[styles.viewerBar, { paddingTop: TOP_INSET + 8 }]}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.viewerClose}>Đóng</Text>
          </Pressable>
          <Pressable onPress={save} disabled={saving} hitSlop={12}>
            {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.viewerAction}>Tải về</Text>}
          </Pressable>
        </View>

        <View style={styles.viewerBody}>
          <Image
            source={{ uri: messageFileUrl(message.id), headers }}
            style={styles.viewerImage}
            resizeMode="contain"
          />
        </View>

        {notice ? <Text style={[styles.viewerNotice, { paddingBottom: BOTTOM_INSET }]}>{notice}</Text> : null}
      </View>
    </Modal>
  );
}

function Bubble({
  message,
  mine,
  showAuthor,
  headers,
  busy,
  downloaded,
  onView,
  onDownload,
  onOpen,
}: {
  message: MessageDto;
  mine: boolean;
  showAuthor: boolean;
  headers: Record<string, string>;
  busy: boolean;
  downloaded: boolean | undefined;
  onView: () => void;
  onDownload: () => void;
  onOpen: () => void;
}) {
  const author = message.author;
  const removed = !!message.removedAt;
  const hasFile = !!message.filename && !removed;

  let action: ReactNode;
  if (busy) {
    action = <ActivityIndicator size="small" color={colors.primary} />;
  } else if (downloaded === undefined) {
    action = null;
  } else if (downloaded) {
    action = (
      <Pressable onPress={onOpen} hitSlop={8}>
        <Text style={styles.fileAction}>Mở</Text>
      </Pressable>
    );
  } else {
    action = (
      <Pressable onPress={onDownload} hitSlop={8}>
        <Text style={styles.fileAction}>Tải về</Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
        {showAuthor && !mine && author ? (
          <Text style={styles.author}>{author.name || author.username}</Text>
        ) : null}

        {hasFile && isImage(message.contentType) ? (
          <Pressable onPress={onView}>
            <Image source={{ uri: messageFileUrl(message.id), headers }} style={styles.image} resizeMode="cover" />
          </Pressable>
        ) : hasFile ? (
          <View style={styles.fileCard}>
            <Text style={styles.fileName} numberOfLines={2}>
              {message.filename}
            </Text>
            <View style={styles.fileFooter}>
              <Text style={styles.fileSize}>{formatSize(message.size)}</Text>
              {action}
            </View>
          </View>
        ) : (
          <Text style={[styles.bubbleText, removed && styles.removedText]}>{messagePreview(message)}</Text>
        )}

        <Text style={styles.time}>{formatTime(message.createdAt)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface, paddingTop: TOP_INSET },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.surface,
  },
  back: { fontSize: 15, fontWeight: "600", color: colors.primary },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: "600", color: colors.ink },
  headerSub: { fontSize: 12, color: colors.muted },
  body: { flex: 1, backgroundColor: colors.paper },
  loader: { marginTop: 40 },
  footer: { paddingVertical: 12 },
  listContent: { paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  empty: { textAlign: "center", color: colors.muted, padding: 24 },
  bubbleRow: { flexDirection: "row", justifyContent: "flex-start" },
  bubbleRowMine: { justifyContent: "flex-end" },
  bubble: { maxWidth: "80%", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, gap: 4 },
  bubbleOther: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  bubbleMine: { backgroundColor: colors.tint },
  author: { fontSize: 12, fontWeight: "600", color: colors.primary, marginBottom: 2 },
  bubbleText: { fontSize: 15, lineHeight: 21, color: colors.ink },
  removedText: { color: colors.muted, fontStyle: "italic" },
  image: { width: 220, height: 220, borderRadius: 6, backgroundColor: colors.paper },
  fileCard: { gap: 8, minWidth: 180 },
  fileName: { fontSize: 15, fontWeight: "600", color: colors.ink },
  fileFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 20 },
  fileSize: { fontSize: 12, color: colors.muted },
  fileAction: { fontSize: 14, fontWeight: "600", color: colors.primary },
  time: { fontSize: 12, color: colors.muted, textAlign: "right", fontVariant: ["tabular-nums"] },
  error: { color: colors.danger, fontSize: 14, paddingHorizontal: 16, paddingVertical: 6 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  attachButton: {
    height: 40,
    minWidth: 56,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  attachPressed: { backgroundColor: colors.tint },
  attachText: { color: colors.primary, fontSize: 14, fontWeight: "600" },
  input: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  sendButton: {
    height: 40,
    minWidth: 64,
    borderRadius: 6,
    paddingHorizontal: 16,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { opacity: 0.45 },
  sendPressed: { backgroundColor: colors.primaryHover },
  sendText: { color: colors.surface, fontSize: 15, fontWeight: "600" },
  viewer: { flex: 1, backgroundColor: "#000000" },
  viewerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  viewerClose: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  viewerAction: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  viewerBody: { flex: 1 },
  viewerImage: { width: "100%", height: "100%" },
  viewerNotice: { color: "#ffffff", textAlign: "center", fontSize: 14, paddingHorizontal: 16 },
});