package org.linkwave.auth.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import org.linkwave.auth.dto.TokensDto;
import org.linkwave.auth.entity.User;
import org.linkwave.auth.repository.UserRepository;
import org.linkwave.auth.security.DefaultUserDetails;
import org.linkwave.auth.security.PrivilegedTokenGuard;
import org.linkwave.auth.security.jwt.AccessTokenFactory;
import org.linkwave.auth.security.jwt.AccessTokenFactoryImpl;
import org.linkwave.auth.security.jwt.JwtRefreshSerializer;
import org.linkwave.auth.security.jwt.RefreshTokenFactory;
import org.linkwave.auth.security.jwt.RefreshTokenFactoryImpl;
import org.linkwave.auth.security.totp.ChallengeService;
import org.linkwave.auth.security.utils.MobileClient;
import org.linkwave.auth.service.OtpService;
import org.linkwave.auth.service.TwoFactorService;
import org.linkwave.shared.auth.JwtAccessSerializer;
import org.linkwave.shared.auth.Token;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.util.List;

import static org.linkwave.auth.security.utils.Cookies.createRefreshCookie;
import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NO_CONTENT;
import static org.springframework.http.HttpStatus.TOO_MANY_REQUESTS;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;

/**
 * API 2FA. setup, confirm, disable yêu cầu access token của ADMIN/ROOT (kiểm tra trong controller).
 * verify nhận challenge từ bước đăng nhập và mã TOTP, rồi mới cấp token đầy đủ.
 */
@RestController
@RequestMapping("/api/v1/auth/2fa")
@RequiredArgsConstructor
public class TwoFactorController {

    private final JwtRefreshSerializer refreshSerializer;
    private final JwtAccessSerializer accessSerializer;
    private final TwoFactorService twoFactor;
    private final ChallengeService challenges;
    private final UserRepository userRepository;
    private final UserDetailsService userDetailsService;
    private final OtpService otp;
    private final PrivilegedTokenGuard guard;

    private final RefreshTokenFactory refreshTokenFactory = new RefreshTokenFactoryImpl();
    private final AccessTokenFactory accessTokenFactory = new AccessTokenFactoryImpl();

    public record CodeRequest(@NotBlank String code) {
    }

    /** Hoặc gửi code (TOTP hoặc mã khôi phục), hoặc gửi requestId đã được duyệt trên otp-app. */
    public record VerifyRequest(@NotBlank String challenge, String code, String requestId) {
    }

    public record ConfirmResponse(List<String> recoveryCodes) {
    }

    @PostMapping("/setup")
    public TwoFactorService.SetupResponse setup(HttpServletRequest request) {
        final Token token = requirePrivilegedToken(request);
        return twoFactor.setup(token.userId(), token.username());
    }

    @PostMapping("/confirm")
    public ConfirmResponse confirm(@RequestBody @Valid CodeRequest body, HttpServletRequest request) {
        final Token token = requirePrivilegedToken(request);
        return new ConfirmResponse(twoFactor.confirm(token.userId(), body.code()));
    }

    @PostMapping("/disable")
    @ResponseStatus(NO_CONTENT)
    public void disable(@RequestBody @Valid CodeRequest body, HttpServletRequest request) {
        final Token token = requirePrivilegedToken(request);
        requireCheck(twoFactor.disable(token.userId(), body.code()));
        // Tắt 2FA thì gỡ luôn thiết bị đã ghép (nếu có) và đăng xuất mọi phiên.
        // Nếu không gỡ thiết bị, web sẽ hiện "chờ xác nhận bật 2FA" dù 2FA đã tắt.
        otp.unpair(token.userId());
    }

    @PostMapping("/verify")
    public ResponseEntity<TokensDto> verify(@RequestBody @Valid VerifyRequest body,
                                                 HttpServletRequest request) {
        final Long userId = challenges.verify(body.challenge());
        if (body.requestId() != null && !body.requestId().isBlank()) {
            otp.consumeApproved(userId, body.requestId());
        } else {
            if (body.code() == null || body.code().isBlank()) {
                throw new ResponseStatusException(BAD_REQUEST, "Thiếu mã xác thực");
            }
            requireCheck(twoFactor.verifyLogin(userId, body.code()));
        }

        final String username = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(UNAUTHORIZED, "Tài khoản không tồn tại"))
                .getUsername();
        final DefaultUserDetails details = (DefaultUserDetails) userDetailsService.loadUserByUsername(username);
        if (!details.isEnabled()) {
            throw new ResponseStatusException(UNAUTHORIZED, "Tài khoản đã bị khóa");
        }

        final var authentication = new UsernamePasswordAuthenticationToken(details, null, details.getAuthorities());
        final Token refreshToken = org.linkwave.auth.security.utils.TokenAuthorities.withMfa(
                refreshTokenFactory.build(authentication), true);
        final Token accessToken = accessTokenFactory.build(refreshToken);
        final String serializedRefreshToken = refreshSerializer.serialize(refreshToken);
        final ResponseCookie cookie = createRefreshCookie(
                serializedRefreshToken,
                Duration.between(refreshToken.createdAt(), refreshToken.expireAt()));

        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(new TokensDto(refreshToken.expireAt(), accessSerializer.serialize(accessToken),
                        userRepository.findById(userId).map(User::isMustChangePassword).orElse(false),
                        MobileClient.isMobile(request) ? serializedRefreshToken : null));
    }

    private Token requirePrivilegedToken(HttpServletRequest request) {
        return guard.require(request);
    }

    private static void requireCheck(TwoFactorService.Check check) {
        switch (check) {
            case OK -> { }
            case LOCKED -> throw new ResponseStatusException(TOO_MANY_REQUESTS,
                    "Nhập sai quá nhiều lần, thử lại sau 5 phút");
            case INVALID -> throw new ResponseStatusException(UNAUTHORIZED, "Mã xác thực không đúng");
        }
    }

}