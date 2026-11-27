package org.linkwave.auth.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.ZonedDateTime;

/** Mã ghép thiết bị dùng một lần. Khóa chính là SHA-256 của mã, không lưu mã gốc. */
@Entity
@Table(name = "otp_pairings")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OtpPairing {

    @Id
    @Column(name = "code_hash", length = 64)
    private String codeHash;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "expires_at", nullable = false)
    private ZonedDateTime expiresAt;

}
