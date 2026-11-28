import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { createGroup } from "../api/groups";
import type { ChatSummary } from "../api/chats";
import { colors } from "../theme";
import { BOTTOM_INSET, TOP_INSET } from "../utils/layout";

const MAX_NAME = 100;

export default function CreateGroupModal({
  onCreated,
  onClose,
}: {
  onCreated: (chat: ChatSummary) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const value = name.trim();
    if (!value) {
      setError("Nhập tên nhóm.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const chat = await createGroup(value);
      onCreated(chat);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tạo được nhóm.");
      setBusy(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>Tạo nhóm</Text>
          <Pressable onPress={onClose} hitSlop={8} disabled={busy}>
            <Text style={styles.close}>Đóng</Text>
          </Pressable>
        </View>

        <Text style={styles.label}>Tên nhóm</Text>
        <TextInput
          style={styles.input}
          placeholder="Ví dụ: Nhóm đồ án lớp 22DTHH1"
          placeholderTextColor={colors.muted}
          value={name}
          onChangeText={setName}
          maxLength={MAX_NAME}
          editable={!busy}
          autoFocus
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [styles.button, (busy || pressed) && styles.buttonPressed]}
          onPress={submit}
          disabled={busy}
        >
          {busy ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>Tạo nhóm</Text>}
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingTop: TOP_INSET,
    paddingHorizontal: 16,
    paddingBottom: BOTTOM_INSET,
  },
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
  label: { fontSize: 14, fontWeight: "600", color: colors.ink, marginTop: 20, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
  },
  error: { color: colors.danger, fontSize: 14, marginTop: 10 },
  button: {
    marginTop: 20,
    height: 44,
    borderRadius: 6,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: { backgroundColor: colors.primaryHover },
  buttonText: { color: colors.surface, fontSize: 16, fontWeight: "600" },
});
