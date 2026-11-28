import { useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { messageFileUrl, saveImageToGallery } from "../api/files";
import { BOTTOM_INSET, TOP_INSET } from "../utils/layout";

/** Xem ảnh toàn màn hình và tải về bộ sưu tập. Dùng chung cho khung chat và kho ảnh. */
export default function ImageViewer({
  messageId,
  filename,
  headers,
  onClose,
}: {
  messageId: string;
  filename: string;
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
      await saveImageToGallery(messageId, filename);
      setNotice("Đã lưu vào bộ sưu tập.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Không lưu được ảnh.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.viewer}>
        <View style={[styles.bar, { paddingTop: TOP_INSET + 8 }]}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.close}>Đóng</Text>
          </Pressable>
          <Pressable onPress={save} disabled={saving} hitSlop={12}>
            {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.action}>Tải về</Text>}
          </Pressable>
        </View>

        <View style={styles.body}>
          <Image
            source={{ uri: messageFileUrl(messageId), headers }}
            style={styles.image}
            resizeMode="contain"
          />
        </View>

        {notice ? <Text style={[styles.notice, { paddingBottom: BOTTOM_INSET }]}>{notice}</Text> : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  viewer: { flex: 1, backgroundColor: "#000000" },
  bar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  close: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  action: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  body: { flex: 1 },
  image: { width: "100%", height: "100%" },
  notice: { color: "#ffffff", textAlign: "center", fontSize: 14, paddingHorizontal: 16 },
});
