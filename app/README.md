# Ứng dụng di động SGU Chat

Thư mục này chứa hai ứng dụng di động:

- `sgu-app/`: ứng dụng chat trên Android (tương đương giao diện web, trừ thông báo đẩy). Dùng cùng backend với web qua api-gateway. Xem `sgu-app/README.md`.
- `otp-app/`: ứng dụng xác thực riêng, dùng để nhận mã OTP 6 số và duyệt (Approve) hoặc từ chối (Reject) đăng nhập. Không dùng chung mã với `sgu-app`.

## Công nghệ

- React Native + Expo, TypeScript. Dùng chung một ngôn ngữ với frontend Next.js.
- Android: chạy trên điện thoại thật qua USB hoặc giả lập trong Android Studio.
- iOS: mã được viết cho cả hai nền tảng nhưng **chưa kiểm thử** trên iPhone (nhóm không có thiết bị Apple và tài khoản Apple Developer).

## Yêu cầu

- Node.js 20 trở lên và npm.
- Android Studio (để có Android SDK và giả lập, hoặc chỉ cần `adb` nếu dùng điện thoại thật).
- Điện thoại Android đã bật USB debugging, hoặc giả lập đã tạo sẵn.
- Backend SGU Chat đang chạy (xem `backend/` và README gốc).

## Chạy trên điện thoại Android cắm USB

1. Bật USB debugging, cắm cáp, kiểm tra bằng `adb devices`.
2. Chạy backend trên máy tính.
3. Chuyển cổng về máy tính qua USB, để app gọi được `localhost`:
   ```powershell
   adb reverse tcp:8080 tcp:8080
   adb reverse tcp:9090 tcp:9090
   ```
   Lệnh này phải chạy lại mỗi lần cắm lại cáp.
4. Chạy app: `cd sgu-app` rồi `npx expo run:android`. Làm tương tự với `otp-app`.

## Cấu hình địa chỉ backend

Mỗi app đọc địa chỉ backend từ biến môi trường `EXPO_PUBLIC_API_URL` (và `EXPO_PUBLIC_WS_URL` cho realtime). Khi dùng USB với `adb reverse`, giá trị là `http://localhost:8080`. Khi dùng Wi-Fi, dùng IP LAN của máy tính, ví dụ `http://192.168.1.10:8080`.

## Trạng thái

| Nội dung | Android | iOS |
|---|---|---|
| sgu-app: đăng nhập, giữ phiên, danh sách chat, gửi, sửa, thu hồi tin, nhóm | Cần kiểm thử | Chưa kiểm thử |
| otp-app: nhận OTP 6 số | Cần kiểm thử | Chưa kiểm thử |
| otp-app: duyệt Approve/Reject | Chờ backend hoàn thiện | Chưa kiểm thử |