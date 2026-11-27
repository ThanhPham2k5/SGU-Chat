package org.linkwave.auth.security;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.linkwave.auth.repository.DeactivatedTokenRepository;
import org.linkwave.auth.security.utils.TokenAuthorities;
import org.linkwave.shared.auth.JwtAccessParser;
import org.linkwave.shared.auth.Token;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import static org.springframework.http.HttpHeaders.AUTHORIZATION;
import static org.springframework.http.HttpStatus.FORBIDDEN;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;

/** Lấy access token từ header và kiểm tra quyền. Dùng chung cho các API 2FA, ghép thiết bị và đặt lại 2FA. */
@Component
@RequiredArgsConstructor
public class PrivilegedTokenGuard {

    private final JwtAccessParser accessParser;
    private final DeactivatedTokenRepository deactivatedTokens;

    /** ADMIN hoặc ROOT. */
    public Token require(HttpServletRequest request) {
        final String header = request.getHeader(AUTHORIZATION);
        if (header == null || !header.startsWith("Bearer ")) {
            throw new ResponseStatusException(UNAUTHORIZED, "Thiếu access token");
        }
        final Token token = accessParser.parse(header.substring(7));
        if (token == null || deactivatedTokens.existsById(token.id())) {
            throw new ResponseStatusException(UNAUTHORIZED, "Access token không hợp lệ");
        }
        final boolean privileged = token.authorities().contains("ROLE_ADMIN")
                || token.authorities().contains("ROLE_ROOT");
        if (!privileged) {
            throw new ResponseStatusException(FORBIDDEN, "Chỉ ADMIN hoặc ROOT được dùng 2FA");
        }
        return token;
    }

    /** ROOT đã xác thực 2FA. Dùng cho việc đặt lại 2FA của ADMIN. */
    public Token requireRoot(HttpServletRequest request) {
        final Token token = require(request);
        if (!token.authorities().contains("ROLE_ROOT") || !token.authorities().contains(TokenAuthorities.MFA_VERIFIED)) {
            throw new ResponseStatusException(FORBIDDEN, "Chỉ ROOT đã xác thực 2FA mới được đặt lại 2FA");
        }
        return token;
    }

}
