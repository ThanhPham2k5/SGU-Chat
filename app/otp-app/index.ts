// Phải nạp trước mọi thứ khác: cung cấp crypto.getRandomValues cho thư viện khóa ECDSA.
import 'react-native-get-random-values';
import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);
