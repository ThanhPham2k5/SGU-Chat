import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { changePassword, logout } from "../api/auth";
import { colors } from "../theme";

type Props = {
  /** Đổi xong: máy chủ đã thu hồi phiên, app quay về màn đăng nhập. */
  onDone: () => void;
  onSignedOut: () => void;
};

export default function ChangePasswordScreen({ onDone, onSignedOut }: Props) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!oldPassword || !newPassword || !confirm) {
      setError("Nhập đủ ba ô mật khẩu.");
      return;
    }
    if (newPassword !== confirm) {
      setError("Mật khẩu mới và xác nhận chưa khớp.");
      return;
    }
    if (newPassword === oldPassword) {
      setError("Mật khẩu mới phải khác mật khẩu hiện tại.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await changePassword(oldPassword, newPassword);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đổi mật khẩu thất bại.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await logout();
    onSignedOut();
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Đổi mật khẩu</Text>
        <Text style={styles.subtitle}>
          Tài khoản đang dùng mật khẩu mặc định. Bạn cần đổi mật khẩu trước khi tiếp tục.
        </Text>

        <View style={styles.card}>
          <Field label="Mật khẩu hiện tại" value={oldPassword} onChangeText={setOldPassword} editable={!busy} />
          <Field label="Mật khẩu mới" value={newPassword} onChangeText={setNewPassword} editable={!busy} />
          <Field
            label="Nhập lại mật khẩu mới"
            value={confirm}
            onChangeText={setConfirm}
            editable={!busy}
            onSubmitEditing={submit}
          />

          <Pressable
            style={({ pressed }) => [styles.button, (busy || pressed) && styles.buttonPressed]}
            onPress={submit}
            disabled={busy}
          >
            {busy ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>Đổi mật khẩu</Text>}
          </Pressable>

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <Pressable onPress={handleLogout} disabled={busy} style={styles.logoutWrap}>
          <Text style={styles.link}>Đăng xuất</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  editable: boolean;
  onSubmitEditing?: () => void;
};

function Field({ label, value, onChangeText, editable, onSubmitEditing }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry
        autoCapitalize="none"
        editable={editable}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={onSubmitEditing ? "go" : "next"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { flexGrow: 1, justifyContent: "center", padding: 20, gap: 12 },
  title: { fontSize: 22, fontWeight: "600", textAlign: "center", color: colors.ink },
  subtitle: { fontSize: 14, lineHeight: 20, textAlign: "center", color: colors.muted, marginBottom: 8 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 20,
    gap: 16,
  },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: "600", color: colors.ink },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 6,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: { backgroundColor: colors.primaryHover },
  buttonText: { color: colors.surface, fontSize: 16, fontWeight: "600" },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  logoutWrap: { alignSelf: "center", padding: 8 },
  link: { color: colors.primary, fontSize: 14, fontWeight: "600" },
});