-- V7: OTP approval app (ghép cặp thiết bị, yêu cầu duyệt đăng nhập ADMIN/ROOT)

-- Một tài khoản ghép tối đa một thiết bị. Ghép lại sẽ thay khóa cũ.
CREATE TABLE otp_devices (
    user_id BIGINT PRIMARY KEY,

    device_id UUID NOT NULL UNIQUE,
    public_key TEXT NOT NULL,
    device_name VARCHAR(100) NOT NULL,

    paired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ,

    CONSTRAINT fk_otp_devices_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

-- Mã ghép dùng một lần, chỉ lưu SHA-256 của mã.
CREATE TABLE otp_pairings (
    code_hash VARCHAR(64) PRIMARY KEY,

    user_id BIGINT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_otp_pairings_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

-- Yêu cầu duyệt đăng nhập. number là số đối chiếu 2 chữ số hiển thị trên web và trên điện thoại.
CREATE TABLE otp_requests (
    id UUID PRIMARY KEY,

    user_id BIGINT NOT NULL,
    number VARCHAR(2) NOT NULL,
    status VARCHAR(16) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    decided_at TIMESTAMPTZ,

    CONSTRAINT fk_otp_requests_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_otp_requests_status
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CONSUMED', 'EXPIRED')),

    CONSTRAINT chk_otp_requests_number
        CHECK (number ~ '^[0-9]{2}$')
);

CREATE INDEX idx_otp_requests_user_status
    ON otp_requests(user_id, status);
