#!/usr/bin/env bash
# Sinh cặp khóa RSA cho các service (không commit khóa lên git).
# Chạy từ thư mục gốc repo: bash backend/scripts/gen-keys.sh
# Trên Windows dùng Git Bash (có sẵn openssl). Chạy lại sẽ tạo khóa mới,
# token cũ sẽ không còn hợp lệ, nên khởi động lại mọi service sau khi chạy.
set -euo pipefail

command -v openssl >/dev/null || { echo "Cần cài openssl trước." >&2; exit 1; }

BACKEND="$(cd "$(dirname "$0")/.." && pwd)"
AUTH_MAIN="$BACKEND/auth-service/src/main/resources/keys"
AUTH_TEST="$BACKEND/auth-service/src/test/resources/keys"
mkdir -p "$AUTH_MAIN" "$AUTH_TEST"

gen_pair() {
    openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$1" 2>/dev/null
    openssl rsa -pubout -in "$1" -out "$2" 2>/dev/null
}

# auth-service: khóa access và refresh, cho cả main và test
for dir in "$AUTH_MAIN" "$AUTH_TEST"; do
    gen_pair "$dir/access_private_key.pem" "$dir/access_public_key.pem"
    gen_pair "$dir/refresh_private_key.pem" "$dir/refresh_public_key.pem"
done

# Các service kiểm tra JWT chỉ cần khóa public access; khóa phải giống auth-service
for dir in \
    "$BACKEND/user-service/src/main/resources/keys" \
    "$BACKEND/chat-service/src/main/resources/keys" \
    "$BACKEND/ws-server/src/main/resources/keys"; do
    mkdir -p "$dir"
    cp "$AUTH_MAIN/access_public_key.pem" "$dir/access_public_key.pem"
done

# Test của user-service và chat-service cần khóa access private để tạo token giả
for svc in user-service chat-service; do
    mkdir -p "$BACKEND/$svc/src/test/resources/keys"
    cp "$AUTH_MAIN/access_public_key.pem" "$BACKEND/$svc/src/test/resources/keys/access_public_key.pem"
    cp "$AUTH_MAIN/access_private_key.pem" "$BACKEND/$svc/src/test/resources/keys/access_private_key.pem"
done

echo "Đã tạo khóa mới. Khởi động lại các service để nhận khóa."