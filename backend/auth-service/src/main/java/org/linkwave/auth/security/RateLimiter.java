package org.linkwave.auth.security;

import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import static org.springframework.http.HttpStatus.TOO_MANY_REQUESTS;

/**
 * Giới hạn số lần gọi theo khóa trong một khoảng thời gian (bộ đếm cố định, lưu trong bộ nhớ).
 * Lưu ý: mất khi khởi động lại, và mọi yêu cầu qua gateway có cùng IP nên khóa phải dựa vào dữ liệu nghiệp vụ.
 */
@Component
public class RateLimiter {

    private static final int MAX_KEYS = 10_000;

    private record Window(long startedAt, int count) {
    }

    private final Map<String, Window> windows = new ConcurrentHashMap<>();

    public void check(String key, int maxPerWindow, Duration window) {
        final long now = System.currentTimeMillis();
        final long span = window.toMillis();
        final Window updated = windows.compute(key, (k, w) ->
                (w == null || now - w.startedAt() >= span) ? new Window(now, 1) : new Window(w.startedAt(), w.count() + 1));
        if (windows.size() > MAX_KEYS) {
            windows.clear();
        }
        if (updated.count() > maxPerWindow) {
            throw new ResponseStatusException(TOO_MANY_REQUESTS, "Quá nhiều yêu cầu, vui lòng thử lại sau");
        }
    }

}
