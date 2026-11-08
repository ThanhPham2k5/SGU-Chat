package org.linkwave.auth.security;

import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Đếm số lần đăng nhập sai theo tên đăng nhập, lưu trong bộ nhớ.
 * Sai MAX_FAILURES lần trong vòng WINDOW thì tạm khóa đăng nhập LOCK_DURATION.
 * Vì lưu trong bộ nhớ nên chỉ áp dụng đúng khi chạy một bản auth-service.
 */
@Component
public class LoginAttemptService {

    static final int MAX_FAILURES = 5;
    static final Duration WINDOW = Duration.ofMinutes(15);
    static final Duration LOCK_DURATION = Duration.ofMinutes(15);

    private final ConcurrentHashMap<String, Attempts> attempts = new ConcurrentHashMap<>();

    /** Thời gian còn lại của lần khóa, Duration.ZERO nếu không bị khóa. */
    public Duration lockedFor(String username) {
        final String key = key(username);
        final Attempts current = attempts.get(key);
        if (current == null || current.lockedUntil == null) {
            return Duration.ZERO;
        }
        final Duration remaining = Duration.between(Instant.now(), current.lockedUntil);
        if (remaining.isZero() || remaining.isNegative()) {
            attempts.remove(key, current);
            return Duration.ZERO;
        }
        return remaining;
    }

    public void recordFailure(String username) {
        attempts.compute(key(username), (k, current) -> {
            final Instant now = Instant.now();
            final Attempts attempt = (current == null || current.windowStart.plus(WINDOW).isBefore(now))
                    ? new Attempts(now)
                    : current;
            attempt.failures++;
            if (attempt.failures >= MAX_FAILURES) {
                attempt.lockedUntil = now.plus(LOCK_DURATION);
            }
            return attempt;
        });
    }

    public void reset(String username) {
        attempts.remove(key(username));
    }

    private static String key(String username) {
        return username == null ? "" : username.trim().toLowerCase(Locale.ROOT);
    }

    private static final class Attempts {
        private final Instant windowStart;
        private int failures;
        private Instant lockedUntil;

        private Attempts(Instant windowStart) {
            this.windowStart = windowStart;
        }
    }
}