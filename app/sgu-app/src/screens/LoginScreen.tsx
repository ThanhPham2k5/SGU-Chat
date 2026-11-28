import { forwardRef, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputInstance,
  TextInputProps,
  ScrollViewInstance,
  View,
} from "react-native";
import {
  getOtpRequestStatus,
  login,
  startOtpRequest,
  verifyTwoFactor,
} from "../api/auth";
import type { OtpRequest } from "../api/auth";
import { colors } from "../theme";

type Props = {
  onSignedIn: (passwordChangeRequired: boolean) => void;
};

type FieldProps = TextInputProps & { label: string };

const Field = forwardRef<TextInputInstance, FieldProps>(function Field({ label, ...inputProps }, ref) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput ref={ref} style={styles.input} placeholderTextColor={colors.muted} {...inputProps} />
    </View>
  );
});

type OtpPhase = "waiting" | "rejected" | "expired";

export default function LoginScreen({ onSignedIn }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Duyệt qua otp-app: có khi ADMIN/ROOT đã ghép thiết bị. Có thể chuyển sang mã TOTP.
  const [otp, setOtp] = useState<OtpRequest | null>(null);
  const [otpPhase, setOtpPhase] = useState<OtpPhase>("waiting");
  const [useTotp, setUseTotp] = useState(false);

  const scrollRef = useRef<ScrollViewInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);

  // Giữ hàm mới nhất để effect polling không phải khởi động lại mỗi lần render.
  const onSignedInRef = useRef(onSignedIn);
  useEffect(() => {
    onSignedInRef.current = onSignedIn;
  }, [onSignedIn]);

  // Hỏi trạng thái mỗi 2 giây cho đến khi có kết quả. Vẫn chạy khi đang ở tab nhập mã.
  useEffect(() => {
    if (!challenge || !otp || otpPhase !== "waiting") return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const status = await getOtpRequestStatus(challenge, otp.requestId);
        if (cancelled) return;
        if (status === "APPROVED") {
          clearInterval(timer);
          const result = await verifyTwoFactor(challenge, { requestId: otp.requestId });
          if (!cancelled) onSignedInRef.current(result.passwordChangeRequired);
        } else if (status === "REJECTED") {
          clearInterval(timer);
          setOtpPhase("rejected");
        } else if (status === "EXPIRED" || status === "CONSUMED") {
          clearInterval(timer);
          setOtpPhase("expired");
        }
      } catch (err) {
        if (cancelled) return;
        clearInterval(timer);
        setError(err instanceof Error ? err.message : "Không kiểm tra được yêu cầu duyệt.");
        setOtpPhase("expired");
      }
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [challenge, otp, otpPhase]);

  // Cuộn xuống khi bàn phím hiện, để ô đang nhập không bị che.
  function scrollToBottom() {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
  }

  async function requestOtp(nextChallenge: string) {
    try {
      const request = await startOtpRequest(nextChallenge);
      setOtp(request);
      setOtpPhase("waiting");
      setUseTotp(request === null);
    } catch {
      // Không tạo được yêu cầu duyệt thì vẫn cho nhập mã TOTP
      setOtp(null);
      setUseTotp(true);
    }
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
        setCode("");
        await requestOtp(result.challenge);
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
      const result = await verifyTwoFactor(challenge, { code: code.trim() });
      onSignedIn(result.passwordChangeRequired);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xác thực thất bại.");
    } finally {
      setBusy(false);
    }
  }

  async function resendOtp() {
    if (!challenge) return;
    setError(null);
    setBusy(true);
    setOtpPhase("waiting");
    await requestOtp(challenge);
    setBusy(false);
  }

  function backToCredentials() {
    setChallenge(null);
    setCode("");
    setError(null);
    setOtp(null);
    setOtpPhase("waiting");
    setUseTotp(false);
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
          ) : otp && !useTotp ? (
            <>
              <Text style={styles.hint}>
                Mở SGU Approve trên điện thoại và chọn đúng số bên dưới rồi bấm Approve.
              </Text>
              <View style={styles.otpNumberWrap}>
                <Text style={styles.otpLabel}>Số đối chiếu</Text>
                <Text style={styles.otpNumber}>{otp.number}</Text>
              </View>
              {otpPhase === "waiting" ? <Text style={styles.hint}>Đang chờ bạn duyệt trên điện thoại...</Text> : null}
              {otpPhase === "rejected" ? (
                <Text style={styles.error}>
                  Yêu cầu đã bị từ chối trên điện thoại. Nếu không phải bạn đăng nhập, hãy đổi mật khẩu ngay.
                </Text>
              ) : null}
              {otpPhase === "expired" && !error ? (
                <Text style={styles.error}>Yêu cầu đã hết hạn. Hãy gửi lại yêu cầu.</Text>
              ) : null}
              {otpPhase !== "waiting" ? (
                <Pressable
                  style={({ pressed }) => [styles.button, (busy || pressed) && styles.buttonPressed]}
                  onPress={resendOtp}
                  disabled={busy}
                >
                  {busy ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>Gửi lại yêu cầu</Text>}
                </Pressable>
              ) : null}
              <Pressable onPress={() => setUseTotp(true)} disabled={busy}>
                <Text style={styles.link}>Không nhận được yêu cầu? Nhập mã 6 số</Text>
              </Pressable>
              <Pressable onPress={backToCredentials} disabled={busy}>
                <Text style={styles.link}>Quay lại</Text>
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
              {otp ? (
                <Pressable onPress={() => setUseTotp(false)} disabled={busy}>
                  <Text style={styles.link}>Dùng SGU Approve để duyệt</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={backToCredentials} disabled={busy}>
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
  otpNumberWrap: {
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingVertical: 20,
    backgroundColor: colors.paper,
  },
  otpLabel: { fontSize: 14, color: colors.muted },
  otpNumber: { fontSize: 48, fontWeight: "600", letterSpacing: 8, color: colors.ink },
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