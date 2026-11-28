package org.linkwave.auth.dto;

import java.time.Instant;

/**
 * Phản hồi cấp token. refreshToken chỉ có khi client là app di động (gửi header X-Client: mobile),
 * vì app không nhận được cookie Secure qua http. Web vẫn chỉ dùng cookie.
 */
public record TokensDto(Instant refreshExpiration, String accessToken, boolean passwordChangeRequired,
                        String refreshToken) {

    public TokensDto(Instant refreshExpiration, String accessToken, boolean passwordChangeRequired) {
        this(refreshExpiration, accessToken, passwordChangeRequired, null);
    }
}
