import { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';

import { HomeScreen } from './src/screens/HomeScreen';
import { PairScreen } from './src/screens/PairScreen';
import { loadDevices, saveDevices } from './src/storage/deviceStore';
import type { StoredDevice } from './src/storage/deviceStore';
import { colors } from './src/theme';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [devices, setDevices] = useState<StoredDevice[]>([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadDevices()
      .then(setDevices)
      .catch(() => setDevices([]))
      .finally(() => setLoading(false));
  }, []);

  async function replaceDevices(next: StoredDevice[]) {
    await saveDevices(next);
    setDevices(next);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <StatusBar barStyle="dark-content" />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (adding || devices.length === 0) {
    return (
      <>
        <StatusBar barStyle="dark-content" />
        <PairScreen
          onCancel={devices.length > 0 ? () => setAdding(false) : undefined}
          onPaired={async (device) => {
            // Ghép lại cùng một tài khoản thì thay thiết bị cũ, vì máy chủ đã thu hồi khóa cũ
            const kept = devices.filter((d) => d.account === '' || d.account !== device.account);
            await replaceDevices([...kept, device]);
            setAdding(false);
          }}
        />
      </>
    );
  }

  return (
    <>
      <StatusBar barStyle="dark-content" />
      <HomeScreen
        devices={devices}
        onAddAccount={() => setAdding(true)}
        onEnrolled={async (deviceId) => {
          await replaceDevices(devices.map((d) => (d.deviceId === deviceId ? { ...d, enrolled: true } : d)));
        }}
        onUnlink={async (deviceId) => {
          await replaceDevices(devices.filter((d) => d.deviceId !== deviceId));
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
});
