package org.linkwave.auth.security;

import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;

import java.time.Duration;

/**
 * Bọc AuthenticationManager gốc: chặn đăng nhập khi tài khoản đang bị khóa tạm,
 * và ghi nhận số lần sai.
 */
@RequiredArgsConstructor
public class ThrottledAuthenticationManager implements AuthenticationManager {

    private final AuthenticationManager delegate;
    private final LoginAttemptService attempts;

    @Override
    public Authentication authenticate(Authentication authentication) throws AuthenticationException {
        final String username = authentication.getName();

        final Duration locked = attempts.lockedFor(username);
        if (!locked.isZero()) {
            final long minutes = Math.max(1, (locked.toSeconds() + 59) / 60);
            throw new LockedException("Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau " + minutes + " phút.");
        }

        try {
            final Authentication result = delegate.authenticate(authentication);
            attempts.reset(username);
            return result;
        } catch (BadCredentialsException e) {
            attempts.recordFailure(username);
            throw e;
        }
    }
}