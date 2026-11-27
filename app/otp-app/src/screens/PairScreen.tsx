import { useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { generateKeyPair } from '../crypto/keys';
import { pairDevice } from '../api/otpApi';
import { BOTTOM_INSET, TOP_INSET } from '../layout';
import type { StoredDevice } from '../storage/deviceStore';
import { colors } from '../theme';

type Props = {
  onPaired: (device: StoredDevice) => void;
  onCancel?: () => void;
};

function deviceName(): string {
  return Platform.OS === 'ios' ? 'SGU Approve trên iOS' : 'SGU Approve trên Android';
}

/** Ghép thiết bị với một tài khoản ADMIN/ROOT bằng mã QR trên web (hoặc nhập tay mã ghép). */
export function PairScreen({ onPaired, onCancel }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [manualCode, setManualCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);
  // Cờ đồng bộ: camera có thể báo cùng một mã nhiều lần trước khi state kịp cập nhật.
  const inFlight = useRef(false);

  async function pair(rawCode: string) {
    const code = rawCode.trim();
    if (!code || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setScanning(false);
    try {
      const keys = generateKeyPair();
      const result = await pairDevice(code, keys.publicKeySpki, deviceName());
      onPaired({
        deviceId: result.deviceId,
        privateKey: keys.privateKey,
        publicKeySpki: keys.publicKeySpki,
        totpSecret: result.totpSecret,
        account: result.username,
        name: deviceName(),
        enrolled: false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra. Vui lòng thử lại.');
      setScanning(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const cameraReady = permission?.granted === true;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: TOP_INSET + 16, paddingBottom: BOTTOM_INSET + 16 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Ghép tài khoản</Text>
      <Text style={styles.body}>
        Trên trang web, vào Bảo mật, Xác thực hai lớp, bấm Bật 2FA bằng otp-app rồi quét mã QR bên dưới.
        Mã chỉ dùng được một lần trong 2 phút.
      </Text>

      {cameraReady ? (
        <View style={styles.cameraFrame}>
          <CameraView
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={scanning ? (result) => pair(result.data) : undefined}
          />
        </View>
      ) : (
        <Pressable style={styles.secondaryButton} onPress={requestPermission}>
          <Text style={styles.secondaryText}>Cho phép dùng camera để quét QR</Text>
        </Pressable>
      )}

      <Text style={styles.label}>Hoặc nhập mã ghép</Text>
      <TextInput
        style={styles.input}
        value={manualCode}
        onChangeText={setManualCode}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="Ví dụ: ABCDE23456"
        placeholderTextColor={colors.muted}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.primaryButton, busy && styles.disabled]}
        onPress={() => pair(manualCode)}
        disabled={busy}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Ghép tài khoản</Text>}
      </Pressable>

      {onCancel ? (
        <Pressable style={styles.linkButton} onPress={onCancel}>
          <Text style={styles.linkText}>Quay lại</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { paddingHorizontal: 16, gap: 14 },
  title: { fontSize: 24, fontWeight: '700', color: colors.ink },
  body: { fontSize: 15, lineHeight: 22, color: colors.muted },
  cameraFrame: { height: 300, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.ink },
  label: { fontSize: 14, fontWeight: '600', color: colors.ink },
  input: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    fontSize: 16,
    color: colors.ink,
  },
  error: { color: colors.danger, fontSize: 14 },
  primaryButton: {
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  linkButton: { alignSelf: 'center', paddingVertical: 6 },
  linkText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.6 },
});
