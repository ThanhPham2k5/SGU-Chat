package org.linkwave.auth.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import org.linkwave.auth.security.PrivilegedTokenGuard;
import org.linkwave.auth.service.TwoFactorResetService;
import org.linkwave.shared.auth.Token;
import org.springframework.web.bind.annotation.*;

import java.util.List;

import static org.springframework.http.HttpStatus.NO_CONTENT;

/** API đặt lại 2FA cho ADMIN. Chỉ ROOT đã xác thực 2FA được gọi. */
@RestController
@RequestMapping("/api/v1/auth/2fa/admin/resets")
@RequiredArgsConstructor
public class TwoFactorResetController {

    private final TwoFactorResetService resets;
    private final PrivilegedTokenGuard guard;

    public record ResetRequest(@NotBlank String username) {
    }

    @GetMapping
    public List<TwoFactorResetService.ResetItem> list(HttpServletRequest request) {
        guard.requireRoot(request);
        return resets.pending();
    }

    @PostMapping
    @ResponseStatus(NO_CONTENT)
    public void request(@RequestBody @Valid ResetRequest body, HttpServletRequest request) {
        final Token token = guard.requireRoot(request);
        resets.request(token.userId(), body.username());
    }

    @PostMapping("/{userId}/execute")
    @ResponseStatus(NO_CONTENT)
    public void execute(@PathVariable Long userId, HttpServletRequest request) {
        final Token token = guard.requireRoot(request);
        resets.execute(token.userId(), userId);
    }

    @DeleteMapping("/{userId}")
    @ResponseStatus(NO_CONTENT)
    public void cancel(@PathVariable Long userId, HttpServletRequest request) {
        guard.requireRoot(request);
        resets.cancel(userId);
    }

}
