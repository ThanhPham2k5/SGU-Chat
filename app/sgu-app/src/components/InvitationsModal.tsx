import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { chatSocket } from "../api/chatSocket";
import { acceptInvitation, declineInvitation, listInvitations, type Invitation } from "../api/groups";
import { colors } from "../theme";
import { TOP_INSET } from "../utils/layout";

/** Danh sách lời mời vào nhóm. Chấp nhận hoặc từ chối từng lời mời. Tự cập nhật khi có lời mời mới. */
export default function InvitationsModal({
  onChanged,
  onClose,
}: {
  onChanged: () => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listInvitations()
      .then((list) => {
        if (active) setItems(list);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Không tải được lời mời.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Lời mời mới đến qua realtime (sự kiện INVITATION): tải lại danh sách ngay khi đang mở.
  useEffect(() => {
    return chatSocket.subscribe((event) => {
      if (event.type !== "membership") return;
      listInvitations()
        .then(setItems)
        .catch(() => {});
    });
  }, []);

  async function respond(invitation: Invitation, accept: boolean) {
    if (busyId) return;
    setBusyId(invitation.id);
    setError(null);
    try {
      if (accept) {
        await acceptInvitation(invitation.id);
      } else {
        await declineInvitation(invitation.id);
      }
      setItems((prev) => prev.filter((item) => item.id !== invitation.id));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không xử lý được lời mời.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>Lời mời vào nhóm</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.close}>Đóng</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading ? (
          <ActivityIndicator style={styles.loader} color={colors.primary} />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={<Text style={styles.empty}>Không có lời mời nào.</Text>}
            renderItem={({ item }) => {
              const busy = busyId === item.id;
              return (
                <View style={styles.row}>
                  <Text style={styles.groupTitle} numberOfLines={1}>
                    {item.groupTitle || "Nhóm chat"}
                  </Text>
                  <Text style={styles.inviter} numberOfLines={1}>
                    Mời bởi {item.inviter}
                  </Text>
                  <View style={styles.actions}>
                    {busy ? <ActivityIndicator color={colors.primary} /> : null}
                    <Pressable
                      style={({ pressed }) => [styles.decline, pressed && styles.pressed]}
                      onPress={() => respond(item, false)}
                      disabled={busy}
                    >
                      <Text style={styles.declineText}>Từ chối</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.accept, pressed && styles.acceptPressed]}
                      onPress={() => respond(item, true)}
                      disabled={busy}
                    >
                      <Text style={styles.acceptText}>Tham gia</Text>
                    </Pressable>
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface, paddingTop: TOP_INSET, paddingHorizontal: 16 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  title: { fontSize: 18, fontWeight: "600", color: colors.ink },
  close: { fontSize: 15, fontWeight: "600", color: colors.primary },
  loader: { marginTop: 40 },
  error: { color: colors.danger, fontSize: 14, marginTop: 8 },
  empty: { textAlign: "center", color: colors.muted, padding: 24 },
  row: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 4 },
  groupTitle: { fontSize: 15, fontWeight: "600", color: colors.ink },
  inviter: { fontSize: 13, color: colors.muted },
  actions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 8 },
  decline: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.line,
  },
  declineText: { color: colors.muted, fontSize: 14, fontWeight: "600" },
  accept: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6, backgroundColor: colors.primary },
  acceptPressed: { backgroundColor: colors.primaryHover },
  acceptText: { color: colors.surface, fontSize: 14, fontWeight: "600" },
  pressed: { backgroundColor: colors.tint },
});
