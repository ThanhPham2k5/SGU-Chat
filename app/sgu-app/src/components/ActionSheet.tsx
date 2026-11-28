import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";
import { BOTTOM_INSET } from "../utils/layout";

export type ActionItem = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
};

/** Menu nổi từ đáy màn hình, dùng cho thao tác trên một đoạn chat hoặc nút "+". */
export default function ActionSheet({
  title,
  actions,
  onClose,
}: {
  title?: string;
  actions: ActionItem[];
  onClose: () => void;
}) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: BOTTOM_INSET }]} onPress={() => {}}>
          {title ? (
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
          ) : null}
          {actions.map((action) => (
            <Pressable
              key={action.label}
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
              onPress={() => {
                onClose();
                action.onPress();
              }}
            >
              <Text style={[styles.actionText, action.destructive && styles.destructive]}>{action.label}</Text>
            </Pressable>
          ))}
          <Pressable style={({ pressed }) => [styles.action, pressed && styles.pressed]} onPress={onClose}>
            <Text style={styles.cancel}>Huỷ</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.muted,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  action: { paddingVertical: 14, paddingHorizontal: 12, borderRadius: 8 },
  pressed: { backgroundColor: colors.tint },
  actionText: { fontSize: 16, color: colors.ink },
  destructive: { color: colors.danger },
  cancel: { fontSize: 16, fontWeight: "600", color: colors.primary, textAlign: "center" },
});
