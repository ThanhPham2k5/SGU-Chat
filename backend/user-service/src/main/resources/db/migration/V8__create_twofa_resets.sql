-- V8: ROOT đặt lại 2FA cho ADMIN, có thời gian chờ trước khi thực hiện

CREATE TABLE twofa_resets (
    user_id BIGINT PRIMARY KEY,

    requested_by BIGINT NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    execute_after TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_twofa_resets_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);
