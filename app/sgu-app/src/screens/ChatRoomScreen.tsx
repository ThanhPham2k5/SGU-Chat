import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
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
  deleteMessage,
  editMessageRest,
  fetchMessages,
  isEditable,
  isMemberNotice,
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
} from "../api/files";
import { fetchGroupDetails, fetchGroupName } from "../api/groups";
import ActionSheet, { type ActionItem } from "../components/ActionSheet";
import GroupInfoModal from "../components/GroupInfoModal";
import ImageViewer from "../components/ImageViewer";
import ReportModal from "../components/ReportModal";
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
  // Đoạn chat đã tải xong tin nhắn; đổi chat thì đang tải cho đến khi xong.
  const [loadedChatId, setLoadedChatId] = useState<string | null>(null);
  const loading = loadedChatId !== chat.id;
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
  const [infoOpen, setInfoOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<MessageDto | null>(null);
  // Tin đang mở menu thao tác (sửa, thu hồi, báo cáo).
  const [actionTarget, setActionTarget] = useState<MessageDto | null>(null);
  // Tin đang sửa: ô nhập hiện nội dung cũ và nút gửi thành "Lưu".
  const [editing, setEditing] = useState<MessageDto | null>(null);
  // Quản trị viên nhóm được thu hồi tin của người khác (khớp với web).
  const [isAdmin, setIsAdmin] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Tên mới sau khi đổi tên nhóm, để hiện ngay mà không cần mở lại đoạn chat.
  const [titleOverride, setTitleOverride] = useState<string | null>(null);

  const isGroup = chat.type === "GROUP";
  const isMine = useCallback((m: MessageDto) => myId !== null && m.author?.id === myId, [myId]);

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
  }, [messages, downloaded]);

  // Xác định quyền quản trị viên của nhóm để biết có thu hồi được tin của người khác không.
  useEffect(() => {
    if (!isGroup || myId === null) return;
    let active = true;
    fetchGroupDetails(chat.id)
      .then((d) => {
        if (active) setIsAdmin(d.members.some((m) => m.userId === String(myId) && m.isAdmin));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [chat.id, isGroup, myId]);

  const loadPage = useCallback(
    async (offset: number) => {
      const page = await fetchMessages(chat.id, offset, PAGE_SIZE);
      setMessages((prev) => mergeNewestFirst(prev, page));
      setHasMore(page.length === PAGE_SIZE);
    },
    [chat.id],
  );

  useEffect(() => {
    let active = true;
    fetchMessages(chat.id, 0, PAGE_SIZE)
      .then((page) => {
        if (!active) return;
        setMessages((prev) => mergeNewestFirst(prev, page));
        setHasMore(page.length === PAGE_SIZE);
      })
      .catch((err) => {
        if (active) setError(errorText(err, "Không tải được tin nhắn."));
      })
      .finally(() => {
        if (active) setLoadedChatId(chat.id);
      });
    return () => {
      active = false;
    };
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
          setMessages((prev) =>
            prev.map((m) => (m.id === event.id ? { ...m, removedAt: event.timestamp, text: null } : m)),
          );
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
        case "renamed":
          if (event.chatId === chat.id) {
            fetchGroupName(chat.id)
              .then((name) => {
                if (name) setTitleOverride(name);
              })
              .catch(() => {});
          }
          return;
        case "reconnected":
          loadPage(0).catch(() => {});
          return;
        default:
          return;
      }
    });
  }, [chat.id, onBack, loadPage]);

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

  function startEdit(message: MessageDto) {
    setEditing(message);
    setDraft(message.text ?? "");
    setError(null);
  }

  function cancelEdit() {
    setEditing(null);
    setDraft("");
  }

  async function saveEdit(message: MessageDto, text: string) {
    if (text === message.text) {
      cancelEdit();
      return;
    }
    setSending(true);
    setError(null);
    try {
      // Qua WebSocket thì server phát UPD_MESSAGE tới cả đoạn chat; chưa kết nối thì gọi REST.
      if (!chatSocket.editMessage(message.id, text)) {
        await editMessageRest(message.id, text);
        setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, text } : m)));
      }
      cancelEdit();
    } catch (err) {
      setError(errorText(err, "Không sửa được tin nhắn."));
    } finally {
      setSending(false);
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;

    if (editing) {
      await saveEdit(editing, text);
      return;
    }

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

  function confirmRecall(message: MessageDto) {
    Alert.alert(
      "Thu hồi tin nhắn?",
      "Tin nhắn sẽ hiện là đã thu hồi với mọi thành viên trong đoạn chat.",
      [
        { text: "Huỷ", style: "cancel" },
        { text: "Thu hồi", style: "destructive", onPress: () => recall(message) },
      ],
    );
  }

  async function recall(message: MessageDto) {
    setError(null);
    try {
      // Qua WebSocket thì server phát REMOVE tới cả đoạn chat; chưa kết nối thì gọi REST.
      if (!chatSocket.removeMessage(message.id)) {
        await deleteMessage(message.id);
        setMessages((prev) =>
          prev.map((m) => (m.id === message.id ? { ...m, removedAt: new Date().toISOString(), text: null } : m)),
        );
      }
      if (editing?.id === message.id) cancelEdit();
    } catch (err) {
      setError(errorText(err, "Không thu hồi được tin nhắn."));
    }
  }

  // Giữ lâu một tin: tin của mình có menu sửa/thu hồi; tin người khác báo cáo, quản trị viên có thêm thu hồi.
  function openMenu(message: MessageDto) {
    if (message.removedAt) return;
    if (!isMine(message) && !isAdmin) {
      setReportTarget(message);
      return;
    }
    setActionTarget(message);
  }

  function actionsFor(message: MessageDto): ActionItem[] {
    const items: ActionItem[] = [];
    const mine = isMine(message);
    if (mine && isEditable(message)) {
      items.push({ label: "Sửa tin nhắn", onPress: () => startEdit(message) });
    }
    if (mine || isAdmin) {
      items.push({ label: "Thu hồi tin nhắn", destructive: true, onPress: () => confirmRecall(message) });
    }
    if (!mine) {
      items.push({ label: "Báo cáo tin nhắn", onPress: () => setReportTarget(message) });
    }
    return items;
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
            {titleOverride ?? chatTitle(chat)}
          </Text>
          <Text style={styles.headerSub}>{subtitle}</Text>
        </View>
        <Pressable onPress={() => setInfoOpen(true)} hitSlop={12} style={styles.moreButton}>
          <Text style={styles.moreText}>⋮</Text>
        </Pressable>
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
              loadingMore ? <ActivityIndicator style={styles.footer} color={colors.primary} /> : undefined
            }
            ListEmptyComponent={<Text style={styles.empty}>Chưa có tin nhắn nào.</Text>}
            renderItem={({ item }) => {
              // Tin hệ thống (người tham gia, rời nhóm) hiển thị ở giữa, không có bong bóng.
              if (isMemberNotice(item)) {
                return <Text style={styles.system}>{messagePreview(item)}</Text>;
              }
              return (
                <Bubble
                  message={item}
                  mine={isMine(item)}
                  showAuthor={isGroup}
                  headers={headers}
                  busy={busyId === item.id}
                  downloaded={downloaded[item.id]}
                  onView={() => setViewing(item)}
                  onDownload={() => download(item)}
                  onOpen={() => open(item)}
                  onLongPress={() => openMenu(item)}
                />
              );
            }}
          />
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        {editing ? (
          <View style={styles.editBar}>
            <Text style={styles.editText} numberOfLines={1}>
              Đang sửa: {editing.text}
            </Text>
            <Pressable onPress={cancelEdit} hitSlop={8} disabled={sending}>
              <Text style={styles.editCancel}>Huỷ</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.inputRow, { paddingBottom: keyboardOpen ? 8 : BOTTOM_INSET }]}>
          <Pressable
            style={({ pressed }) => [styles.attachButton, (uploading || pressed) && styles.attachPressed]}
            onPress={attach}
            disabled={uploading || editing !== null}
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
            {sending ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Text style={styles.sendText}>{editing ? "Lưu" : "Gửi"}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {viewing ? (
        <ImageViewer
          messageId={viewing.id}
          filename={viewing.filename ?? "image.jpg"}
          headers={headers}
          onClose={() => setViewing(null)}
        />
      ) : null}

      {actionTarget ? (
        <ActionSheet
          title={messagePreview(actionTarget)}
          actions={actionsFor(actionTarget)}
          onClose={() => setActionTarget(null)}
        />
      ) : null}

      {infoOpen ? (
        <GroupInfoModal
          chat={chat}
          myId={myId}
          onRenamed={(name) => setTitleOverride(name)}
          onLeft={onBack}
          onClose={() => setInfoOpen(false)}
        />
      ) : null}

      {reportTarget ? (
        <ReportModal
          messageId={reportTarget.id}
          onDone={(message) => {
            setReportTarget(null);
            setNotice(message);
          }}
          onClose={() => setReportTarget(null)}
        />
      ) : null}
    </View>
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
  onLongPress,
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
  onLongPress: () => void;
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
    <Pressable
      onLongPress={removed ? undefined : onLongPress}
      delayLongPress={400}
      style={[styles.bubbleRow, mine && styles.bubbleRowMine]}
    >
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
    </Pressable>
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
  moreButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  moreText: { fontSize: 22, fontWeight: "700", color: colors.primary },
  body: { flex: 1, backgroundColor: colors.paper },
  loader: { marginTop: 40 },
  footer: { paddingVertical: 12 },
  listContent: { paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  empty: { textAlign: "center", color: colors.muted, padding: 24 },
  system: { textAlign: "center", fontSize: 12, color: colors.muted, paddingVertical: 2 },
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
  notice: { color: colors.primary, fontSize: 14, paddingHorizontal: 16, paddingVertical: 6 },
  editBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.tint,
  },
  editText: { flex: 1, fontSize: 13, color: colors.ink },
  editCancel: { fontSize: 14, fontWeight: "600", color: colors.primary },
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
});
