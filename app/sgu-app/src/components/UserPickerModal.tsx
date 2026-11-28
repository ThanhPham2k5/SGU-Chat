import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { searchUsers, type UserSuggestion } from "../api/groups";
import { colors } from "../theme";
import { TOP_INSET } from "../utils/layout";

/** Tìm và chọn một người dùng, dùng cho nhắn riêng và mời vào nhóm. */
export default function UserPickerModal({
  title,
  onPick,
  onClose,
}: {
  title: string;
  onPick: (user: UserSuggestion) => void;
  onClose: () => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<UserSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tìm sau 300 ms kể từ lần gõ cuối. Kết quả cũ bị bỏ nếu người dùng đã gõ tiếp.
  useEffect(() => {
    const q = keyword.trim();
    if (!q) return;
    let active = true;
    const timer = setTimeout(() => {
      setSearching(true);
      searchUsers(q)
        .then((list) => {
          if (!active) return;
          setResults(list);
          setError(null);
        })
        .catch((err) => {
          if (active) setError(err instanceof Error ? err.message : "Không tìm được người dùng.");
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [keyword]);

  function onChangeKeyword(value: string) {
    setKeyword(value);
    if (!value.trim()) {
      setResults([]);
      setError(null);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.close}>Đóng</Text>
          </Pressable>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Nhập tên hoặc tên đăng nhập"
          placeholderTextColor={colors.muted}
          value={keyword}
          onChangeText={onChangeKeyword}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />

        {searching ? <ActivityIndicator style={styles.loader} color={colors.primary} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            keyword.trim() && !searching && !error ? (
              <Text style={styles.empty}>Không tìm thấy người dùng nào.</Text>
            ) : undefined
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              onPress={() => onPick(item)}
            >
              <Text style={styles.name} numberOfLines={1}>
                {item.name || item.username}
              </Text>
              <Text style={styles.username} numberOfLines={1}>
                {item.username}
              </Text>
            </Pressable>
          )}
        />
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
  input: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
  },
  loader: { marginTop: 16 },
  error: { color: colors.danger, fontSize: 14, marginTop: 8 },
  empty: { textAlign: "center", color: colors.muted, padding: 24 },
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  pressed: { backgroundColor: colors.tint },
  name: { fontSize: 15, fontWeight: "600", color: colors.ink },
  username: { fontSize: 13, color: colors.muted, marginTop: 2 },
});