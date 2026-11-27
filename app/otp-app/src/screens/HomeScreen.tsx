import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

import { OtpApiError, decideRequest, enrollDevice, fetchPending, revokeDevice } from '../api/otpApi';
import type { Decision, PendingRequest } from '../api/otpApi';
import { secondsLeft, totpCode } from '../crypto/totp';
import { BOTTOM_INSET, TOP_INSET } from '../layout';
import type { StoredDevice } from '../storage/deviceStore';
import { colors } from '../theme';

type Props = {
  devices: StoredDevice[];
  onEnrolled: (deviceId: string) => void;
  onUnlink: (deviceId: string) => void;
  onAddAccount: () => void;
};

type PendingItem = PendingRequest & { device: StoredDevice };

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'Có lỗi xảy ra.';
}

/**
 * Yêu cầu vân tay, khuôn mặt hoặc PIN của điện thoại trước khi duyệt.
 * Người cầm máy mở khóa được mới duyệt được, kể cả khi có người biết mật khẩu web.
 */
async function requireUserPresence(): Promise<void> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Xác nhận để duyệt đăng nhập',
    cancelLabel: 'Huỷ',
    disableDeviceFallback: false,
  });
  if (result.success) return;
  const reason = (result as { error?: string }).error;
  if (reason === 'not_enrolled' || reason === 'passcode_not_set') {
    throw new Error('Hãy đặt khóa màn hình (vân tay, khuôn mặt hoặc PIN) trước khi duyệt.');
  }
  throw new Error('Chưa xác nhận được. Yêu cầu vẫn đang chờ.');
}

/** Danh sách tài khoản, yêu cầu duyệt của mọi tài khoản, và mã TOTP dự phòng từng tài khoản. */
export function HomeScreen({ devices, onEnrolled, onUnlink, onAddAccount }: Props) {
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [openBackup, setOpenBackup] = useState<Record<string, boolean>>({});
  const [recovery, setRecovery] = useState<{ account: string; codes: string[] } | null>(null);

  // Danh sách khóa thay đổi thì hỏi lại. Chỉ cần deviceId và privateKey để gọi máy chủ.
  const devicesKey = devices.map((d) => `${d.deviceId}:${d.privateKey.length}`).join('|');

  // Hỏi máy chủ mỗi 3 giây cho từng thiết bị
  useEffect(() => {
    let alive = true;
    async function poll() {
      const results = await Promise.all(
        devices.map(async (device) => {
          try {
            const items = await fetchPending(device.deviceId, device.privateKey);
            return { items: items.map((item) => ({ ...item, device })), error: null as string | null };
          } catch (err) {
            return { items: [] as PendingItem[], error: `${device.account || device.name}: ${messageOf(err)}` };
          }
        }),
      );
      if (!alive) return;
      setPending(results.flatMap((r) => r.items));
      const errors = results.map((r) => r.error).filter((e): e is string => e !== null);
      setError(errors.length > 0 ? errors.join('\n') : null);
    }
    poll();
    const timer = setInterval(poll, 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devicesKey]);

  // Đồng hồ mỗi giây cho mã TOTP và thời gian hết hạn
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function decide(item: PendingItem, decision: Decision) {
    setBusyId(item.requestId);
    setError(null);
    setNotice(null);
    try {
      if (decision === 'APPROVE') {
        await requireUserPresence();
      }
      await decideRequest(item.requestId, decision, item.device.deviceId, item.device.privateKey);
      setPending((prev) => prev.filter((p) => p.requestId !== item.requestId));
      const action = decision === 'APPROVE' ? 'đã duyệt' : 'đã từ chối';
      setNotice(`${item.device.account}: ${action} số ${item.number}.`);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmEnroll(device: StoredDevice) {
    if (!device.totpSecret) {
      setError(`${device.account}: thiết bị chưa nhận được khóa 2FA. Hãy gỡ rồi ghép lại từ web.`);
      return;
    }
    setEnrollingId(device.deviceId);
    setError(null);
    try {
      const result = await enrollDevice(device.deviceId, totpCode(device.totpSecret), device.privateKey);
      setRecovery({ account: device.account, codes: result.recoveryCodes });
      onEnrolled(device.deviceId);
    } catch (err) {
      if (err instanceof OtpApiError && err.status === 409) {
        setNotice(`${device.account}: 2FA đã được bật từ trước.`);
        onEnrolled(device.deviceId);
      } else {
        setError(messageOf(err));
      }
    } finally {
      setEnrollingId(null);
    }
  }

  function confirmUnlink(device: StoredDevice) {
    Alert.alert(
      `Xoá ${device.account || 'tài khoản'} khỏi điện thoại?`,
      'Ứng dụng sẽ gỡ thiết bị trên máy chủ rồi xoá khóa khỏi điện thoại. Mọi phiên đăng nhập của tài khoản này sẽ bị đăng xuất.',
      [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Xoá', style: 'destructive', onPress: () => unlink(device) },
      ],
    );
  }

  /**
   * Gỡ trên máy chủ trước, rồi mới xoá khóa trên điện thoại.
   * Nếu máy chủ không nhận (mất mạng, lỗi), giữ lại khóa để người dùng thử lại, tránh xoá app mà web vẫn đòi duyệt.
   */
  async function unlink(device: StoredDevice) {
    setError(null);
    try {
      await revokeDevice(device.deviceId, device.privateKey);
    } catch (err) {
      const alreadyGone = err instanceof OtpApiError && err.status === 401;
      if (!alreadyGone) {
        setError(`${device.account || device.name}: chưa gỡ được trên máy chủ (${messageOf(err)}). Khóa vẫn còn trên điện thoại, thử lại sau.`);
        return;
      }
    }
    onUnlink(device.deviceId);
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: TOP_INSET + 16, paddingBottom: BOTTOM_INSET + 16, paddingHorizontal: 16, gap: 16 }}
    >
      <View>
        <Text style={styles.title}>SGU Approve</Text>
        <Text style={styles.muted}>{devices.length} tài khoản đã ghép</Text>
      </View>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {recovery ? (
        <View style={styles.card}>
          <Text style={styles.section}>Mã khôi phục: {recovery.account}</Text>
          <Text style={styles.muted}>
            Ghi lại 8 mã này ở nơi an toàn. Mỗi mã dùng được một lần và chỉ hiện một lần.
          </Text>
          {recovery.codes.map((code) => (
            <Text key={code} style={styles.recovery}>{code}</Text>
          ))}
          <Pressable style={styles.secondary} onPress={() => setRecovery(null)}>
            <Text style={styles.secondaryText}>Tôi đã ghi lại</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.section}>Tài khoản</Text>
      {devices.map((device) => {
        const showBackup = openBackup[device.deviceId] === true;
        const backupCode = device.totpSecret ? totpCode(device.totpSecret, now) : null;
        return (
          <View key={device.deviceId} style={styles.card}>
            <Text style={styles.accountName}>{device.account || device.name}</Text>

            {!device.enrolled ? (
              <View style={{ gap: 8 }}>
                <Text style={styles.muted}>Web đang chờ xác nhận bật 2FA cho tài khoản này.</Text>
                <Pressable
                  style={[styles.approve, enrollingId === device.deviceId && styles.disabled]}
                  onPress={() => confirmEnroll(device)}
                  disabled={enrollingId === device.deviceId}
                >
                  <Text style={styles.approveText}>Xác nhận bật 2FA</Text>
                </Pressable>
              </View>
            ) : null}

            {backupCode ? (
              showBackup ? (
                <View style={{ gap: 6 }}>
                  <Text style={styles.code}>{backupCode}</Text>
                  <Text style={styles.muted}>Mã đổi sau {secondsLeft(now)} giây. Dùng khi không nhận được yêu cầu.</Text>
                  <Pressable
                    style={styles.linkButton}
                    onPress={() => setOpenBackup((prev) => ({ ...prev, [device.deviceId]: false }))}
                  >
                    <Text style={styles.linkText}>Ẩn mã</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={styles.secondary}
                  onPress={() => setOpenBackup((prev) => ({ ...prev, [device.deviceId]: true }))}
                >
                  <Text style={styles.secondaryText}>Hiện mã 6 số dự phòng</Text>
                </Pressable>
              )
            ) : null}

            <Pressable style={styles.linkButton} onPress={() => confirmUnlink(device)}>
              <Text style={styles.dangerLink}>Xoá khỏi điện thoại</Text>
            </Pressable>
          </View>
        );
      })}

      <Pressable style={styles.secondary} onPress={onAddAccount}>
        <Text style={styles.secondaryText}>Ghép thêm tài khoản</Text>
      </Pressable>

      <Text style={styles.section}>Yêu cầu đang chờ</Text>
      {pending.length === 0 ? (
        <Text style={styles.muted}>
          Chưa có yêu cầu nào. Khi có người đăng nhập bằng một tài khoản đã ghép trên web, yêu cầu sẽ hiện ở đây.
        </Text>
      ) : (
        pending.map((item) => {
          const left = Math.max(0, Math.floor((new Date(item.expiresAt).getTime() - now) / 1000));
          const busy = busyId === item.requestId;
          return (
            <View key={item.requestId} style={styles.card}>
              <Text style={styles.muted}>Tài khoản: {item.device.account || item.device.name}</Text>
              <Text style={styles.muted}>Số đối chiếu trên web</Text>
              <Text style={styles.matchNumber}>{item.number}</Text>
              <Text style={styles.muted}>
                Chỉ bấm Approve khi số này trùng với số trên màn hình web. Còn {left} giây.
              </Text>
              <View style={styles.row}>
                <Pressable
                  style={[styles.approve, busy && styles.disabled]}
                  onPress={() => decide(item, 'APPROVE')}
                  disabled={busy}
                >
                  <Text style={styles.approveText}>Approve</Text>
                </Pressable>
                <Pressable
                  style={[styles.reject, busy && styles.disabled]}
                  onPress={() => decide(item, 'REJECT')}
                  disabled={busy}
                >
                  <Text style={styles.rejectText}>Reject</Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  title: { fontSize: 24, fontWeight: '700', color: colors.ink },
  section: { fontSize: 16, fontWeight: '600', color: colors.ink },
  accountName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  muted: { fontSize: 14, lineHeight: 20, color: colors.muted },
  notice: { fontSize: 14, color: colors.primary, backgroundColor: colors.tint, padding: 10, borderRadius: 8 },
  error: { fontSize: 14, color: colors.danger },
  card: {
    gap: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  matchNumber: {
    fontSize: 48,
    fontWeight: '700',
    letterSpacing: 6,
    color: colors.ink,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  recovery: { fontSize: 16, fontFamily: 'monospace', color: colors.ink },
  row: { flexDirection: 'row', gap: 10, marginTop: 4 },
  approve: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  reject: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectText: { color: colors.danger, fontSize: 16, fontWeight: '600' },
  code: {
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: 4,
    color: colors.ink,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  secondary: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  linkButton: { alignSelf: 'flex-start', paddingVertical: 6 },
  linkText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  dangerLink: { color: colors.danger, fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.6 },
});
