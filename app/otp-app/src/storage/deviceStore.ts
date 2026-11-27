import * as SecureStore from 'expo-secure-store';

// Danh sách thiết bị. Mỗi thiết bị ứng với một tài khoản ADMIN/ROOT trên web.
const KEY_LIST = 'sgu_otp_devices_v2';
const KEY_LEGACY = 'sgu_otp_device_v1';

export type StoredDevice = {
  deviceId: string;
  /** Khóa riêng để ký yêu cầu. Chỉ nằm trong kho bảo mật của hệ điều hành. */
  privateKey: string;
  publicKeySpki: string;
  /** Bí mật TOTP để dùng khi không có mạng. Có thể null nếu thiết bị ghép không nhận được khóa. */
  totpSecret: string | null;
  /** Tên tài khoản trên web, ví dụ tên đăng nhập ADMIN. */
  account: string;
  name: string;
  /** true khi máy chủ đã bật 2FA bằng thiết bị này. */
  enrolled: boolean;
};

export async function loadDevices(): Promise<StoredDevice[]> {
  const raw = await SecureStore.getItemAsync(KEY_LIST);
  if (raw) {
    try {
      return JSON.parse(raw) as StoredDevice[];
    } catch {
      return [];
    }
  }

  // Chuyển dữ liệu từ bản cũ (một thiết bị) sang danh sách
  const legacy = await SecureStore.getItemAsync(KEY_LEGACY);
  if (legacy) {
    try {
      const old = JSON.parse(legacy) as StoredDevice;
      const migrated: StoredDevice[] = [{ ...old, account: old.account ?? '' }];
      await saveDevices(migrated);
      await SecureStore.deleteItemAsync(KEY_LEGACY);
      return migrated;
    } catch {
      return [];
    }
  }
  return [];
}

export async function saveDevices(devices: StoredDevice[]): Promise<void> {
  await SecureStore.setItemAsync(KEY_LIST, JSON.stringify(devices));
}
