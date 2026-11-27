import { forwardRef, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import { login, verifyTwoFactor } from "../api/auth";
import { colors } from "../theme";

type Props = {
  onSignedIn: (passwordChangeRequired: boolean) => void;
};

type FieldProps = TextInputProps & { label: string };

const Field = forwardRef<TextInput, FieldProps>(function Field({ label, ...inputProps }, ref) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput ref={ref} style={styles.input} placeholderTextColor={colors.muted} {...inputProps} />
    </View>
  );
});

export default function LoginScreen({ onSignedIn }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const passwordRef = useRef<TextInput>(null);

  // Cuộn xuống khi bàn phím hiện, để ô đang nhập không bị che.
  function scrollToBottom() {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
  }

  async function submitCredentials() {
    if (!username.trim() || !password) {
      setError("Nhập tên đăng nhập và mật khẩu.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await login(username.trim(), password);
      if (result.kind === "twoFactor") {
        setChallenge(result.challenge);
      } else {
        onSignedIn(result.passwordChangeRequired);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đăng nhập thất bại.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    if (!challenge || !code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await verifyTwoFactor(challenge, code.trim());
      onSignedIn(result.passwordChangeRequired);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xác thực thất bại.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.logoWrap}>
          <Image source={require("../../assets/icon.png")} style={styles.logo} />
        </View>
        <Text style={styles.title}>SGU Chat</Text>
        <Text style={styles.subtitle}>Đăng nhập bằng tài khoản do nhà trường cấp</Text>

        <View style={styles.card}>
          {challenge === null ? (
            <>
              <Field
                label="Tên đăng nhập hoặc MSSV"
                placeholder="Ví dụ: gv01"
                autoCapitalize="none"
                autoCorrect={false}
                value={username}
                onChangeText={setUsername}
                onFocus={scrollToBottom}
                editable={!busy}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
              <Field
                ref={passwordRef}
                label="Mật khẩu"
                placeholder="Nhập mật khẩu"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                onFocus={scrollToBottom}
                editable={!busy}
                returnKeyType="go"
                onSubmitEditing={submitCredentials}
              />
              <Pressable
                style={({ pressed }) => [styles.button, (busy || pressed) && styles.buttonPressed]}
                onPress={submitCredentials}
                disabled={busy}
              >
                {busy ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>Đăng nhập</Text>}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.hint}>
                Tài khoản này bật xác thực hai lớp. Nhập mã 6 số trong ứng dụng xác thực, hoặc mã khôi phục.
              </Text>
              <Field
                label="Mã xác thực"
                placeholder="Nhập mã"
                autoCapitalize="none"
                value={code}
                onChangeText={setCode}
                onFocus={scrollToBottom}
                editable={!busy}
                returnKeyType="go"
                onSubmitEditing={submitCode}
              />
              <Pressable
                style={({ pressed }) => [styles.button, (busy || pressed) && styles.buttonPressed]}
                onPress={submitCode}
                disabled={busy}
              >
                {busy ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>Xác nhận</Text>}
              </Pressable>
              <Pressable
                onPress={() => {
                  setChallenge(null);
                  setCode("");
                  setError(null);
                }}
                disabled={busy}
              >
                <Text style={styles.link}>Quay lại</Text>
              </Pressable>
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { flexGrow: 1, justifyContent: "center", padding: 20 },
  logoWrap: {
    alignSelf: "center",
    width: 88,
    height: 88,
    borderRadius: 44,
    overflow: "hidden",
    backgroundColor: colors.surface,
    marginBottom: 8,
  },
  logo: { width: 88, height: 88 },
  title: { fontSize: 24, fontWeight: "600", textAlign: "center", color: colors.ink },
  subtitle: { fontSize: 14, textAlign: "center", color: colors.muted, marginTop: 4, marginBottom: 20 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 20,
    gap: 16,
  },
  hint: { fontSize: 14, lineHeight: 20, color: colors.muted },
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
  link: { color: colors.primary, fontSize: 14, textAlign: "center", fontWeight: "600" },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
});