import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { chatTitle, type ChatSummary } from "../api/chats";
import {
  authHeaders,
  downloadMessageFile,
  formatSize,
  isDownloaded,
  messageFileUrl,
  openMessageFile,
} from "../api/files";
import {
  changeMemberRole,
  fetchGroupDetails,
  inviteToGroup,
  leaveGroup,
  listMedia,
  removeMember,
  renameGroup,
  type GroupDetails,
  type GroupMember,
  type MediaItem,
  type UserSuggestion,
} from "../api/groups";
import { colors } from "../theme";
import { BOTTOM_INSET, TOP_INSET } from "../utils/layout";
import ActionSheet, { type ActionItem } from "./ActionSheet";
import ImageViewer from "./ImageViewer";
import UserPickerModal from "./UserPickerModal";

type Props = {
  chat: ChatSummary;
  myId: number | null;
  onRenamed: (name: string) => void;
  onLeft: () => void;
  onClose: () => void;
};

type MediaKind = "IMAGE" | "FILE";

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/**
 * Thông tin đoạn chat: thành viên và quản lý nhóm (chỉ quản trị viên), đổi tên, rời nhóm,
 * và kho ảnh, tệp của cuộc trò chuyện. Ảnh và tệp dùng cùng cách xem, tải và mở như trong khung chat.
 */
export default function GroupInfoModal({ chat, myId, onRenamed, onLeft, onClose }: Props) {
  const isGroup = chat.type === "GROUP";

  const [details, setDetails] = useState<GroupDetails | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const [mediaKind, setMediaKind] = useState<MediaKind>("IMAGE");
  // Lưu kèm loại đã tải để biết danh sách hiện tại có đúng loại đang chọn không.
  const [media, setMedia] = useState<{ kind: MediaKind; items: MediaItem[] } | null>(null);
  const [headers, setHeaders] = useState<Record<string, string>>({});
  const [downloaded, setDownloaded] = useState<Record<string, boolean>>({});
  const [busyMediaId, setBusyMediaId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<MediaItem | null>(null);

  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [picker, setPicker] = useState(false);
  const [memberAction, setMemberAction] = useState<GroupMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const me = details?.members.find((m) => m.userId === String(myId));
  const isManager = me?.isAdmin ?? false;
  const loadingMedia = media?.kind !== mediaKind;

  useEffect(() => {
    authHeaders().then(setHeaders).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isGroup) return;
    let active = true;
    fetchGroupDetails(chat.id)
      .then((d) => {
        if (active) setDetails(d);
      })
      .catch((err) => {
        if (active) setDetailsError(errorText(err, "Không tải được thành viên."));
      });
    return () => {
      active = false;
    };
  }, [chat.id, isGroup]);

  useEffect(() => {
    let active = true;
    const kind = mediaKind;
    listMedia(chat.id, kind, 0, 30)
      .then((items) => {
        if (!active) return;
        setMedia({ kind, items });
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setMedia({ kind, items: [] });
        setError(errorText(err, "Không tải được danh sách."));
      });
    return () => {
      active = false;
    };
  }, [chat.id, mediaKind]);

  // Kiểm tra tệp nào đã được tải về máy để hiện "Mở" hoặc "Tải về".
  useEffect(() => {
    if (media?.kind !== "FILE") return;
    for (const item of media.items) {
      if (item.removedAt || downloaded[item.messageId] !== undefined) continue;
      isDownloaded(item.messageId, item.filename)
        .then((ok) => setDownloaded((prev) => ({ ...prev, [item.messageId]: ok })))
        .catch(() => {});
    }
  }, [media, downloaded]);

  async function reloadDetails() {
    if (!isGroup) return;
    setDetails(await fetchGroupDetails(chat.id));
  }

  // Mọi thao tác đổi nhóm đều đi qua đây: khoá nút, báo lỗi, rồi tải lại thông tin nhóm.
  async function run(action: () => Promise<unknown>, after?: () => void) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      after?.();
      await reloadDetails();
    } catch (err) {
      setError(errorText(err, "Thao tác thất bại."));
    } finally {
      setBusy(false);
    }
  }

  function saveName() {
    const value = newName.trim();
    if (!value || !details) return;
    run(() => renameGroup(chat.id, value, details), () => {
      onRenamed(value);
      setRenaming(false);
    });
  }

  function inviteUser(user: UserSuggestion) {
    setPicker(false);
    run(() => inviteToGroup(chat.id, user.username), () => {
      setNotice(`Đã gửi lời mời tới ${user.name || user.username}.`);
    });
  }

  function memberActions(member: GroupMember): ActionItem[] {
    return [
      {
        label: member.isAdmin ? "Bỏ quyền quản trị viên" : "Đặt làm quản trị viên",
        onPress: () => run(() => changeMemberRole(chat.id, member.userId, member.isAdmin ? "MEMBER" : "ADMIN")),
      },
      {
        label: "Xoá khỏi nhóm",
        destructive: true,
        onPress: () =>
          Alert.alert("Xoá thành viên?", `${member.name} sẽ bị xoá khỏi nhóm.`, [
            { text: "Huỷ", style: "cancel" },
            { text: "Xoá", style: "destructive", onPress: () => run(() => removeMember(chat.id, member.userId)) },
          ]),
      },
    ];
  }

  function confirmLeave() {
    Alert.alert("Rời nhóm?", "Bạn sẽ không còn thấy tin nhắn mới của nhóm này.", [
      { text: "Huỷ", style: "cancel" },
      {
        text: "Rời nhóm",
        style: "destructive",
        onPress: async () => {
          if (busy) return;
          setBusy(true);
          setError(null);
          try {
            await leaveGroup(chat.id);
            onLeft();
          } catch (err) {
            setError(errorText(err, "Không rời được nhóm."));
            setBusy(false);
          }
        },
      },
    ]);
  }

  async function downloadItem(item: MediaItem) {
    if (busyMediaId) return;
    setBusyMediaId(item.messageId);
    setError(null);
    try {
      await downloadMessageFile(item.messageId, item.filename);
      setDownloaded((prev) => ({ ...prev, [item.messageId]: true }));
    } catch (err) {
      setError(errorText(err, "Không tải được tệp."));
    } finally {
      setBusyMediaId(null);
    }
  }

  async function openItem(item: MediaItem) {
    if (busyMediaId) return;
    setBusyMediaId(item.messageId);
    setError(null);
    try {
      await openMessageFile(item.messageId, item.filename, item.contentType);
    } catch (err) {
      setError(errorText(err, "Không mở được tệp."));
    } finally {
      setBusyMediaId(null);
    }
  }

  const subtitle = isGroup
    ? "Nhóm chat"
    : chat.user?.username
      ? `@${chat.user.username}`
      : "Đoạn chat riêng";

  const items = media?.items.filter((item) => !item.removedAt) ?? [];

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>Thông tin</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.close}>Đóng</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: BOTTOM_INSET + 16 }]}>
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.card}>
            <Text style={styles.chatName} numberOfLines={2}>
              {chatTitle(chat)}
            </Text>
            <Text style={styles.sub}>{subtitle}</Text>

            {isGroup && isManager ? (
              renaming ? (
                <View style={styles.renameRow}>
                  <TextInput
                    style={styles.input}
                    value={newName}
                    onChangeText={setNewName}
                    maxLength={100}
                    editable={!busy}
                    autoFocus
                  />
                  <Pressable
                    style={({ pressed }) => [styles.smallButton, pressed && styles.smallPressed]}
                    onPress={saveName}
                    disabled={busy || !newName.trim()}
                  >
                    <Text style={styles.smallButtonText}>Lưu</Text>
                  </Pressable>
                  <Pressable onPress={() => setRenaming(false)} hitSlop={8} disabled={busy}>
                    <Text style={styles.muted}>Huỷ</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={() => {
                    setNewName(chatTitle(chat));
                    setRenaming(true);
                  }}
                >
                  <Text style={styles.link}>Đổi tên nhóm</Text>
                </Pressable>
              )
            ) : null}
          </View>

          {isGroup ? (
            <View style={styles.card}>
              <View style={styles.sectionHead}>
                <Text style={styles.section}>
                  Thành viên{details ? ` (${details.members.length})` : ""}
                </Text>
                {isManager ? (
                  <Pressable onPress={() => setPicker(true)} disabled={busy}>
                    <Text style={styles.link}>Mời thêm</Text>
                  </Pressable>
                ) : null}
              </View>

              {detailsError ? <Text style={styles.error}>{detailsError}</Text> : null}
              {!details && !detailsError ? <ActivityIndicator color={colors.primary} /> : null}

              {details?.members.map((m) => {
                const isMe = m.userId === String(myId);
                const canManage = isManager && !isMe && !busy;
                return (
                  <Pressable
                    key={m.userId}
                    style={({ pressed }) => [styles.row, pressed && canManage && styles.pressed]}
                    disabled={!canManage}
                    onPress={() => setMemberAction(m)}
                  >
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {m.name}
                        {isMe ? " (bạn)" : ""}
                      </Text>
                      <Text style={styles.rowMeta}>
                        {m.isAdmin ? "Quản trị viên" : "Thành viên"}
                        {m.isOnline ? " · Đang hoạt động" : ""}
                      </Text>
                    </View>
                    {canManage ? <Text style={styles.more}>⋯</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <View style={styles.card}>
            <View style={styles.segment}>
              {(["IMAGE", "FILE"] as const).map((kind) => {
                const on = mediaKind === kind;
                return (
                  <Pressable
                    key={kind}
                    style={[styles.segmentItem, on && styles.segmentOn]}
                    onPress={() => setMediaKind(kind)}
                  >
                    <Text style={[styles.segmentText, on && styles.segmentTextOn]}>
                      {kind === "IMAGE" ? "Ảnh" : "Tệp"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {loadingMedia ? <ActivityIndicator color={colors.primary} /> : null}
            {!loadingMedia && items.length === 0 ? (
              <Text style={styles.empty}>Chưa có {mediaKind === "IMAGE" ? "ảnh" : "tệp"} nào.</Text>
            ) : null}

            {!loadingMedia && mediaKind === "IMAGE" && items.length > 0 ? (
              <View style={styles.grid}>
                {items.map((item) => (
                  <Pressable key={item.messageId} onPress={() => setViewing(item)} style={styles.thumb}>
                    <Image
                      source={{ uri: messageFileUrl(item.messageId), headers }}
                      style={styles.thumbImage}
                      resizeMode="cover"
                    />
                  </Pressable>
                ))}
              </View>
            ) : null}

            {!loadingMedia && mediaKind === "FILE"
              ? media?.items.map((item) => {
                  const removed = !!item.removedAt;
                  const isBusy = busyMediaId === item.messageId;
                  return (
                    <View key={item.messageId} style={styles.row}>
                      <View style={styles.rowBody}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {removed ? "Tin nhắn đã thu hồi" : item.filename}
                        </Text>
                        <Text style={styles.rowMeta}>{formatSize(item.size)}</Text>
                      </View>
                      {removed ? null : isBusy ? (
                        <ActivityIndicator color={colors.primary} />
                      ) : downloaded[item.messageId] ? (
                        <Pressable onPress={() => openItem(item)} hitSlop={8}>
                          <Text style={styles.fileAction}>Mở</Text>
                        </Pressable>
                      ) : (
                        <Pressable onPress={() => downloadItem(item)} hitSlop={8}>
                          <Text style={styles.fileAction}>Tải về</Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })
              : null}
          </View>

          {isGroup ? (
            <Pressable
              style={({ pressed }) => [styles.leave, pressed && styles.leavePressed]}
              onPress={confirmLeave}
              disabled={busy}
            >
              <Text style={styles.leaveText}>Rời nhóm</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </View>

      {picker ? (
        <UserPickerModal title="Mời vào nhóm" onPick={inviteUser} onClose={() => setPicker(false)} />
      ) : null}

      {memberAction ? (
        <ActionSheet
          title={memberAction.name}
          actions={memberActions(memberAction)}
          onClose={() => setMemberAction(null)}
        />
      ) : null}

      {viewing ? (
        <ImageViewer
          messageId={viewing.messageId}
          filename={viewing.filename}
          headers={headers}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper, paddingTop: TOP_INSET },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  title: { fontSize: 18, fontWeight: "600", color: colors.ink },
  close: { fontSize: 15, fontWeight: "600", color: colors.primary },
  content: { padding: 16, gap: 12 },
  notice: { color: colors.primary, fontSize: 14 },
  error: { color: colors.danger, fontSize: 14 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    gap: 8,
  },
  chatName: { fontSize: 18, fontWeight: "600", color: colors.ink },
  sub: { fontSize: 13, color: colors.muted },
  link: { fontSize: 14, fontWeight: "600", color: colors.primary, marginTop: 4 },
  muted: { fontSize: 14, color: colors.muted },
  renameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    color: colors.ink,
  },
  smallButton: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 6, backgroundColor: colors.primary },
  smallPressed: { backgroundColor: colors.primaryHover },
  smallButtonText: { color: colors.surface, fontSize: 14, fontWeight: "600" },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  section: { fontSize: 15, fontWeight: "600", color: colors.ink },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 8 },
  pressed: { backgroundColor: colors.tint },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, color: colors.ink },
  rowMeta: { fontSize: 12, color: colors.muted },
  more: { fontSize: 20, color: colors.muted },
  fileAction: { fontSize: 14, fontWeight: "600", color: colors.primary },
  empty: { color: colors.muted, fontSize: 14, textAlign: "center", paddingVertical: 12 },
  segment: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    overflow: "hidden",
  },
  segmentItem: { flex: 1, alignItems: "center", paddingVertical: 8 },
  segmentOn: { backgroundColor: colors.tint },
  segmentText: { fontSize: 14, color: colors.muted, fontWeight: "600" },
  segmentTextOn: { color: colors.primary },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  thumb: { width: "31%", aspectRatio: 1, borderRadius: 6, overflow: "hidden", backgroundColor: colors.paper },
  thumbImage: { width: "100%", height: "100%" },
  leave: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  leavePressed: { backgroundColor: colors.tint },
  leaveText: { color: colors.danger, fontSize: 15, fontWeight: "600" },
});
