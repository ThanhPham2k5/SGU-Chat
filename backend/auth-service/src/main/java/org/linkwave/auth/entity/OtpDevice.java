package org.linkwave.auth.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.ZonedDateTime;
import java.util.UUID;

/** Thiết bị ứng dụng otp-app đã ghép với một ADMIN/ROOT. Chỉ lưu khóa công khai. */
@Entity
@Table(name = "otp_devices")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OtpDevice {

    @Id
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "device_id", nullable = false, unique = true)
    private UUID deviceId;

    @Column(name = "public_key", nullable = false, columnDefinition = "text")
    private String publicKey;

    @Column(name = "device_name", nullable = false, length = 100)
    private String deviceName;

    @Column(name = "paired_at", nullable = false)
    private ZonedDateTime pairedAt;

    @Column(name = "last_seen_at")
    private ZonedDateTime lastSeenAt;

}
