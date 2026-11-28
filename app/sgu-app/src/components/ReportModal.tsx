import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { REPORT_CATEGORIES, reportMessage, type ReportCategory } from "../api/groups";
import { colors } from "../theme";
import { BOTTOM_INSET, TOP_INSET } from "../utils/layout";

/** Báo cáo một tin nhắn vi phạm. Quản trị viên sẽ xem xét trên web. */
export default function ReportModal({
  messageId,
  onDone,
  onClose,
}: {
  messageId: string;
  onDone: (message: string) => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!category || busy) return;
    setBusy(true);
    setError(null);
    try {
      await reportMessage(messageId, category, reason);
      onDone("Đã gửi báo cáo. Cảm ơn bạn.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không gửi được báo cáo.");
      setBusy(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>Báo cáo tin nhắn</Text>
          <Pressable onPress={onClose} hitSlop={8} disabled={busy}>
            <Text style={styles.close}>Đóng</Text>
          </Pressable>
        </View>

        <Text style={styles.label}>Loại vi phạm</Text>
        {REPORT_CATEGORIES.map((item) => {
          const selected = category === item.value;
          return (
            <Pressable
              key={item.value}
              style={({ pressed }) => [styles.option, pressed && styles.pressed]}
              onPress={() => setCategory(item.value)}
              disabled={busy}
            >
              <View style={[styles.radio, selected && styles.radioOn]} />
              <Text style={styles.optionText}>{item.label}</Text>
            </Pressable>
          );
        })}

        <Text style={styles.label}>Ghi chú (không bắt buộc)</Text>
        <TextInput
          style={styles.input}
          value={reason}
          onChangeText={setReason}
          placeholder="Mô tả thêm nếu cần"
          placeholderTextColor={colors.muted}
          maxLength={300}
          multiline
          editable={!busy}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            (!category || busy) && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
          onPress={submit}
          disabled={!category || busy}
        >
          {busy ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>Gửi báo cáo</Text>}
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
  label: { fontSize: 14, fontWeight: "600", color: colors.ink, marginTop: 16, marginBottom: 8 },
  option: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  pressed: { backgroundColor: colors.tint },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.line,
  },
  radioOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  optionText: { fontSize: 15, color: colors.ink },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
    minHeight: 64,
    textAlignVertical: "top",
  },
  error: { color: colors.danger, fontSize: 14, marginTop: 10 },
  button: {
    marginTop: 16,
    height: 44,
    borderRadius: 6,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { backgroundColor: colors.primaryHover },
  buttonText: { color: colors.surface, fontSize: 16, fontWeight: "600" },
});
