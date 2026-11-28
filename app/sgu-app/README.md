# sgu-app

Ứng dụng chat SGU Chat trên điện thoại Android. Dùng chung backend và tài khoản với web.

## Chức năng

- Đăng nhập bằng tài khoản do nhà trường cấp, bắt buộc đổi mật khẩu ở lần đầu.
- ADMIN và ROOT đăng nhập bằng cách duyệt trên app `otp-app` (chọn đúng số đối chiếu), hoặc nhập mã 2FA.
- Giữ phiên tự động: khi access token hết hạn, app đổi token mới bằng refresh token lưu trên máy. Nếu refresh cũng hết hạn hoặc bị thu hồi, app quay về màn đăng nhập và báo "Phiên đăng nhập đã hết hạn".
- Danh sách hội thoại, gửi và nhận tin nhắn theo thời gian thực qua ws-server.
- Sửa tin chữ đã gửi, thu hồi tin của mình (giữ lâu trên tin nhắn). Mọi thay đổi hiện realtime cho cả đoạn chat.
- Gửi tệp và ảnh, tải về, mở tệp, lưu ảnh vào thư viện.
- Nhắn riêng, tạo nhóm, mời và xoá thành viên, đổi vai trò, đổi tên nhóm (realtime cho thành viên khác), rời nhóm. Quản trị viên nhóm mới thực hiện quản lý.
- Lời mời vào nhóm: xem, tham gia hoặc từ chối. Lời mời mới hiện ngay khi có.
- Ghim đoạn chat (tối đa 5), ẩn đoạn chat khỏi danh sách của mình (giữ lâu trên đoạn chat).
- Thông tin đoạn chat (chạm vào nút ⋮ trên thanh tiêu đề): danh sách thành viên, kho ảnh và tệp, đổi tên, rời nhóm.
- Báo cáo tin nhắn của người khác (giữ lâu trên tin nhắn).

Ngoài phạm vi hiện tại: thông báo đẩy khi có tin mới.

## Chạy

Chạy trong thư mục `app\sgu-app` bằng PowerShell:

```powershell
cd app\sgu-app
npm install
npx expo run:android
```

Trước khi chạy, tạo file `.env` trong `app/sgu-app/` với:

```
EXPO_PUBLIC_API_URL=http://localhost:8080
EXPO_PUBLIC_WS_URL=ws://localhost:9090
```

Khi dùng USB, chuyển cổng về máy tính (lệnh phải chạy lại mỗi lần cắm lại cáp):

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" reverse tcp:8080 tcp:8080
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" reverse tcp:9090 tcp:9090
```

Kiểm tra kiểu dữ liệu: `npx tsc --noEmit`. Xem thêm cách dùng `adb` và `otp-app` trong `app/README.md`.

Lưu ý khi backend thay đổi: `docker restart` không build lại image. Phải chạy `docker compose up -d --build --no-deps <tên service>` trong thư mục `backend/`. Tên service của ws-server là `ws-server-1`.

## Cấu trúc

```
sgu-app/
  App.tsx                   điểm vào, điều hướng theo state, xử lý phiên hết hạn
  index.ts                  đăng ký App với Expo
  src/api/                  gọi REST và WebSocket
    client.ts               apiFetch: gắn token, tự đổi token khi 401
    auth.ts                 đăng nhập, 2FA, đổi mật khẩu, đăng xuất
    chats.ts                danh sách chat, tin nhắn, sửa và thu hồi (REST dự phòng)
    groups.ts               nhóm, thành viên, lời mời, ghim, kho ảnh và tệp, báo cáo
    chatSocket.ts           WebSocket realtime (tin, sửa, thu hồi, đổi tên, thành viên)
    files.ts, session.ts    tải tệp, kiểm tra phiên
  src/components/           modal và thành phần dùng chung (thông tin nhóm, lời mời, xem ảnh, báo cáo...)
  src/screens/              đăng nhập, đổi mật khẩu, danh sách chat, phòng chat
  src/storage/tokens.ts     lưu access token và refresh token (SecureStore)
  src/utils/, src/theme.ts  định dạng và giao diện dùng chung
  src/config.ts             địa chỉ API và WebSocket
```

`src/app/` và `src/state/` là phần còn sót từ thời dùng Expo Router, không được `App.tsx` sử dụng. Có thể xoá cả hai thư mục.

## Ghi chú cho lập trình viên

- Access token và refresh token lưu bằng `expo-secure-store` (khoá `sgu_access_token`, `sgu_refresh_token`), không lưu trong AsyncStorage.
- Mọi yêu cầu từ app gửi header `X-Client: mobile`. Máy chủ chỉ trả refresh token trong nội dung JSON khi có header này. Web không nhận và vẫn dùng cookie.
- Đổi token: `apiFetch` gặp 401 thì gọi `/api/v1/auth/refresh-tokens` với header `X-Refresh-Token`, lưu cặp token mới (máy chủ xoay vòng refresh token, mỗi token chỉ dùng một lần). Nhiều yêu cầu 401 cùng lúc chỉ gọi refresh một lần.
- Tin nhắn realtime gửi qua WebSocket theo khung `path=...`. Sửa và thu hồi có đường REST dự phòng khi chưa kết nối realtime.
- Không để mật khẩu hay token trong mã nguồn; đọc từ biến môi trường.
- iOS chưa được kiểm thử. Mọi thay đổi phải kiểm tra lại trên Android trước khi ghi nhận là xong.