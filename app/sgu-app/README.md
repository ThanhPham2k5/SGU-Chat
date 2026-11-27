# sgu-app

Ứng dụng chat SGU Chat trên điện thoại. Dùng chung backend và tài khoản với web.

## Chức năng dự kiến

- Đăng nhập bằng tài khoản do nhà trường cấp, bắt buộc đổi mật khẩu ở lần đầu.
- Danh sách hội thoại: chat riêng, nhóm lớp, nhóm môn, nhóm khoa.
- Gửi và nhận tin nhắn theo thời gian thực qua ws-server.
- Gửi tệp và ảnh.
- Thông báo đẩy khi có tin mới (cần backend lưu token thiết bị).

Tài khoản ADMIN và ROOT đăng nhập bằng mã 2FA. Mã này lấy từ app `otp-app`, không phải từ app chat.

## Chạy

```powershell
cd app\sgu-app
npm install
npx expo run:android
```

Trước khi chạy, tạo file `.env` trong `sgu-app/` với:

```
EXPO_PUBLIC_API_URL=http://localhost:8080
EXPO_PUBLIC_WS_URL=ws://localhost:9090
```

Xem cách dùng `adb reverse` trong `app/README.md`.

## Cấu trúc (dự kiến)

```
sgu-app/
  App.tsx          điểm vào
  src/api/         gọi REST qua api-gateway
  src/realtime/    kết nối WebSocket
  src/screens/     màn hình đăng nhập, chat, cài đặt
  src/storage/     lưu token (SecureStore)
```

## Ghi chú cho lập trình viên

- Token lưu bằng `expo-secure-store`, không lưu trong AsyncStorage.
- Không để mật khẩu hay token trong mã nguồn; đọc từ biến môi trường.
- iOS chưa được kiểm thử. Mọi thay đổi phải kiểm tra lại trên Android trước khi ghi nhận là xong.