# SGU Approve (otp-app)

Ứng dụng duyệt đăng nhập cho tài khoản ADMIN và ROOT của SGU Chat. Thay cho app xác thực bên thứ ba (Google Authenticator, v.v.), theo yêu cầu của giảng viên: mọi bước xác thực hai lớp đều do hệ thống SGU Chat tự làm.

Tài liệu này gồm hai phần: **hướng dẫn người dùng** (ADMIN, ROOT) và **hướng dẫn cho lập trình viên** (cài đặt, cấu trúc, giao thức).

---

## Phần 1. Hướng dẫn người dùng

### 1.1. Ứng dụng làm gì

Khi đăng nhập bằng web, tài khoản ADMIN hoặc ROOT không chỉ cần mật khẩu. Web hiện một **số đối chiếu gồm 2 chữ số**. Ứng dụng trên điện thoại hiện đúng số đó, và bạn chỉ bấm **Approve** khi hai số trùng nhau. Nếu bạn không đăng nhập, bấm **Reject**.

Ngoài ra, ứng dụng giữ một **mã 6 số** đổi mỗi 30 giây để dùng khi không nhận được yêu cầu (ví dụ điện thoại hết pin hoặc không có mạng).

### 1.2. Lần đầu: bật 2FA và ghép thiết bị

1. Đăng nhập web bằng tài khoản ADMIN/ROOT. Vào **Bảo mật > Xác thực hai lớp**.
2. Bấm **Bật 2FA bằng otp-app**, nhập mật khẩu. Nếu đã bật 2FA trước đó thì nhập thêm mã 6 số hiện tại.
3. Web hiện mã QR và mã ghép (hiệu lực **2 phút**).
4. Mở SGU Approve trên điện thoại, chọn **Ghép thiết bị**, quét mã QR (hoặc nhập mã ghép).
5. Khi ghép xong, thẻ tài khoản xuất hiện trong app. Web sẽ báo "Đã ghép thiết bị... chọn Xác nhận bật 2FA".
6. Trong app, bấm **Xác nhận bật 2FA**. App hiện **8 mã khôi phục**.
7. **Ghi lại 8 mã này ở nơi an toàn.** Mỗi mã dùng được một lần. Đây là cách duy nhất vào lại tài khoản nếu mất điện thoại và không có quyền khác (xem 1.6). App không lưu mã này.

Mỗi tài khoản ghép tối đa một thiết bị. Một điện thoại có thể chứa nhiều tài khoản: ghép lần lượt từng tài khoản, mỗi tài khoản một thẻ.

### 1.3. Đăng nhập hằng ngày

1. Đăng nhập web bằng tên và mật khẩu.
2. Web hiện **số đối chiếu 2 chữ số** và chờ bạn duyệt.
3. Mở SGU Approve. Yêu cầu hiện ra kèm số. **Kiểm tra số trùng với web.**
4. Bấm **Approve**, xác nhận bằng vân tay, khuôn mặt hoặc PIN của điện thoại.
5. Web tự đăng nhập.

Yêu cầu hết hạn sau **2 phút**. Bấm **Reject** nếu số không trùng hoặc bạn không đăng nhập.

> Số đối chiếu chỉ để kiểm tra đúng yêu cầu. Không bao giờ duyệt khi số không khớp.

### 1.4. Khi không nhận được yêu cầu

1. Trên web, bấm **Không nhận được yêu cầu? Nhập mã 6 số**.
2. Trong app, thẻ tài khoản có nút **Hiện mã 6 số dự phòng**. Nhập mã đang hiện vào web.
3. Hoặc dùng một **mã khôi phục** chưa dùng ở ô tương ứng trên web.

Nhập sai 5 lần liên tiếp, tài khoản bị khóa 5 phút.

### 1.5. Gỡ ghép và xóa thiết bị

- **Gỡ trên app:** bấm **Xoá khỏi điện thoại** ở thẻ tài khoản rồi xác nhận. App gỡ thiết bị trên máy chủ rồi mới xóa khóa trên điện thoại. Mọi phiên đăng nhập của tài khoản đó sẽ bị đăng xuất.
- **Gỡ trên web:** vào **Bảo mật > Xác thực hai lớp > Gỡ ghép thiết bị**. Mọi phiên cũng bị đăng xuất.

> Chỉ xóa app trên điện thoại mà chưa gỡ trên web, web vẫn đòi duyệt qua thiết bị đó. Vì vậy hãy gỡ ghép trước khi xóa app.

Nếu mất mạng khi bấm Xoá, app báo "chưa gỡ được trên máy chủ" và giữ lại thẻ. Có mạng thì thử lại.

### 1.6. Mất điện thoại hoặc mất dữ liệu app

- **Còn 8 mã khôi phục:** đăng nhập bằng một mã khôi phục ở bước 2FA, vào **Xác thực hai lớp**, bấm **Gỡ ghép thiết bị**. Sau đó đăng nhập lại và ghép thiết bị mới như mục 1.2.
- **Không còn mã khôi phục:** ADMIN nhờ ROOT khác đặt lại 2FA (mục 1.7). ROOT không tự đặt lại cho chính mình, và không đặt lại được cho ROOT khác bằng tính năng này. Khi đó cần quản trị viên cơ sở dữ liệu xử lý.

### 1.7. Đặt lại 2FA cho ADMIN (dành cho ROOT)

1. Đăng nhập ROOT (đã bật 2FA và đã qua bước duyệt).
2. Vào **Bảo mật > Xác thực hai lớp > Đặt lại 2FA cho ADMIN**.
3. Nhập tên đăng nhập của ADMIN, bấm **Tạo yêu cầu**.
4. Yêu cầu chỉ thực hiện được sau **24 giờ** (có thể đổi bằng biến `TWOFA_RESET_DELAY_MINUTES`). Trong thời gian đó có thể **Hủy yêu cầu**.
5. Khi hết thời gian, bấm **Thực hiện đặt lại**. Tài khoản ADMIN bị đăng xuất, 2FA và thiết bị ghép bị xóa. ADMIN phải bật lại 2FA khi đăng nhập.

---

## Phần 2. Hướng dẫn lập trình viên

### 2.1. Yêu cầu

- Node.js 20 trở lên, npm.
- Android Studio (có SDK và `adb`), hoặc điện thoại Android bật gỡ lỗi USB.
- Backend SGU Chat đang chạy (API gateway ở cổng 8080). Xem `backend/README` và `docker compose up -d --build`.
- Expo SDK 58 (phiên bản `expo@~58.1.0`).

### 2.2. Cài đặt

```bash
cd otp-app
npm install
npx expo install expo expo-camera expo-secure-store expo-local-authentication react react-native
```

Lệnh `npx expo install` chọn đúng phiên bản tương thích SDK. Không dùng `npm install` cho các package Expo, vì có thể lệch phiên bản.

### 2.3. Cấu hình

Tạo `.env` từ `.env.example`:

```
EXPO_PUBLIC_API_URL=http://localhost:8080
```

- Chạy trên điện thoại qua USB và `adb reverse`: giữ `localhost:8080`.
- Chạy trên máy ảo Android Studio: vẫn dùng `adb reverse tcp:8080 tcp:8080`, không dùng `10.0.2.2`.
- Chạy qua Wi-Fi: đặt `http://<IP máy tính>:8080`, máy tính và điện thoại cùng mạng.

### 2.4. Chạy

```bash
adb reverse tcp:8080 tcp:8080
npx expo run:android
```

`npx expo run:android` build và cài đè lên app cũ, không làm mất dữ liệu (khóa) đã lưu. Dữ liệu chỉ mất khi gỡ app, xóa dữ liệu app, đổi `package` hoặc đổi key ký.

Khi chỉ sửa JavaScript, chạy `npx expo start` rồi mở app đã cài. Nếu gặp lỗi `Cannot find native module`, chạy lại `npx expo run:android`.

Kiểm tra kiểu: `npm run typecheck`.

### 2.5. Cấu trúc thư mục

```
otp-app/
├── App.tsx                  Điều phối: đang ghép hay đang xem danh sách
├── index.ts                 Điểm vào, nạp react-native-get-random-values
├── app.json                 Tên, icon, package Android, quyền camera
├── assets/                  icon.png, adaptive-icon.png (nguồn SVG trong assets/src)
└── src/
    ├── api/otpApi.ts        Gọi API máy chủ, ký mọi yêu cầu
    ├── config.ts            API_URL
    ├── crypto/keys.ts       Sinh cặp khóa P-256, ký thông điệp
    ├── crypto/totp.ts       TOTP RFC 6238 (HMAC-SHA1, 6 số, 30 giây)
    ├── screens/PairScreen.tsx   Quét QR hoặc nhập mã, ghép thiết bị
    ├── screens/HomeScreen.tsx   Danh sách tài khoản, yêu cầu duyệt, gỡ thiết bị
    ├── storage/deviceStore.ts   Lưu thiết bị trong SecureStore
    ├── layout.ts, theme.ts  Khoảng cách và màu (theo giao diện web)
```

### 2.6. Lưu trữ trên điện thoại

- Khóa riêng P-256 và bí mật TOTP lưu trong `expo-secure-store` (Keystore trên Android), khóa `sgu_otp_devices_v2`.
- Dữ liệu cũ (`sgu_otp_device_v1`) được chuyển sang định dạng mới khi mở app.
- Khóa riêng không bao giờ rời điện thoại.

### 2.7. Giao thức

**Khóa:** ECDSA P-256. Khóa công khai gửi dạng SPKI DER base64. Chữ ký dùng `SHA256withECDSA`, dạng DER base64.

**Thông điệp ký** (chuỗi UTF-8, các trường nối bằng `|`):

| Thao tác | Thông điệp |
|---|---|
| Hỏi yêu cầu chờ | `pending\|{deviceId}\|{timestamp}` |
| Duyệt / từ chối | `decision\|{requestId}\|{APPROVE\|REJECT}\|{deviceId}\|{timestamp}` |
| Xác nhận bật 2FA | `enroll\|{deviceId}\|{code}\|{timestamp}` |
| Gỡ thiết bị | `revoke\|{deviceId}\|{timestamp}` |

`timestamp` là giây Unix, máy chủ chấp nhận lệch tối đa 60 giây.

**API** (qua gateway, tiền tố `/api/v1/auth/2fa/otp`):

| Phương thức | Đường dẫn | Dùng bởi | Xác thực |
|---|---|---|---|
| POST | `/pair` | app | Mã ghép |
| POST | `/pending` | app | Chữ ký |
| POST | `/requests/{id}/decision` | app | Chữ ký |
| POST | `/enroll` | app | Chữ ký |
| POST | `/device/revoke` | app | Chữ ký |
| POST | `/pairing` | web | Access token ADMIN/ROOT, mật khẩu, TOTP nếu đã bật |
| GET, DELETE | `/device` | web | Access token ADMIN/ROOT |
| POST | `/requests` | web | Challenge đăng nhập |
| POST | `/requests/status` | web | Challenge đăng nhập |

### 2.8. Giới hạn tần suất

Máy chủ giới hạn theo khóa nghiệp vụ (userId hoặc deviceId), trả 429 khi vượt:
- Tạo mã ghép: 5 lần / 10 phút mỗi tài khoản.
- Hỏi yêu cầu chờ: 60 lần / phút mỗi thiết bị.
- Quyết định duyệt: 30 lần / phút mỗi thiết bị.
- Gỡ thiết bị: 10 lần / phút mỗi thiết bị.
- Tạo yêu cầu đăng nhập: 10 lần / phút mỗi tài khoản.

Bộ đếm lưu trong bộ nhớ máy chủ, mất khi khởi động lại.

### 2.9. Kiểm thử thủ công

Kịch bản đầy đủ nằm ở tài liệu test riêng. Tối thiểu cần kiểm tra:
1. Ghép thiết bị và xác nhận bật 2FA.
2. Duyệt đăng nhập (Approve, Reject, hết hạn, hủy xác thực sinh trắc).
3. Mã dự phòng và mã khôi phục.
4. Gỡ thiết bị trên app (có mạng và mất mạng) và trên web.
5. Đặt lại 2FA cho ADMIN.

---

## Bảo mật

- Máy chủ chỉ giữ khóa công khai. Không thể duyệt đăng nhập nếu không có khóa riêng trên điện thoại.
- Mỗi yêu cầu duyệt chỉ dùng được một lần và hết hạn sau 2 phút.
- Mã ghép dùng một lần, hết hạn sau 2 phút, và phải đúng mật khẩu (cộng với TOTP nếu đã bật 2FA).
- Duyệt yêu cầu bằng vân tay, khuôn mặt hoặc PIN của điện thoại.
- Bí mật TOTP mã hóa AES-GCM trên máy chủ bằng khóa `TOTP_KEY_*` (lưu trong biến môi trường, không đưa vào repo).
- Triển khai thật phải dùng HTTPS.

## Giới hạn đã biết

- iOS chưa được kiểm thử.
- Bí mật TOTP được lưu trong kho bảo mật của thiết bị để dùng khi không có mạng. Ai mở được điện thoại đã khóa cùng lúc có khóa duyệt và mã dự phòng. Đây là đánh đổi đã chấp nhận.
- Nếu tài khoản ROOT bị chiếm, người đó vẫn có thể yêu cầu đặt lại 2FA cho ADMIN (sau thời gian chờ). Thông báo cho ADMIN khi có yêu cầu chưa được triển khai.
- Tính năng đặt lại 2FA không áp dụng cho ROOT. Trường hợp mất cả hai ROOT cần quản trị viên cơ sở dữ liệu.