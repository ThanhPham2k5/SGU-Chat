package org.linkwave.auth.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.ZonedDateTime;

/** Yêu cầu đặt lại 2FA của một ADMIN. Chỉ thực hiện được sau execute_after. */
@Entity
@Table(name = "twofa_resets")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TwoFactorReset {

    @Id
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "requested_by", nullable = false)
    private Long requestedBy;

    @Column(name = "requested_at", nullable = false)
    private ZonedDateTime requestedAt;

    @Column(name = "execute_after", nullable = false)
    private ZonedDateTime executeAfter;

}
