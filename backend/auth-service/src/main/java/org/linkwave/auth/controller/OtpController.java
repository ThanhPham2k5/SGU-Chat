package org.linkwave.auth.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.linkwave.auth.security.PrivilegedTokenGuard;
import org.linkwave.auth.security.RateLimiter;
import org.linkwave.auth.security.totp.ChallengeService;
import org.linkwave.auth.service.OtpService;
import org.linkwave.shared.auth.Token;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.util.List;

import static org.springframework.http.HttpStatus.NO_CONTENT;

/**
 * API ghép cặp và duyệt đăng nhập bằng otp-app. Nằm dưới /api/v1/auth/2fa/** nên đã được permitAll ở SecurityConfig.
 * Các API công khai dựa vào challenge (web) hoặc chữ ký ECDSA của thiết bị (app), không dựa vào session.
 * Mọi API đều có giới hạn tần suất theo khóa nghiệp vụ (userId hoặc deviceId).
 */
@RestController
@RequestMapping("/api/v1/auth/2fa/otp")
@RequiredArgsConstructor
public class OtpController {

    private static final Duration MINUTE = Duration.ofMinutes(1);

    private final OtpService otp;
    private final ChallengeService challenges;
    private final PrivilegedTokenGuard guard;
    private final RateLimiter limiter;

    public record PairingRequest(@NotBlank String password, String code) {
    }

    public record PairRequest(@NotBlank String code, @NotBlank String publicKey,
                              @Size(max = 100) String deviceName) {
    }

    public record ChallengeRequest(@NotBlank String challenge) {
    }

    public record StatusRequest(@NotBlank String challenge, @NotBlank String requestId) {
    }

    public record StatusResponse(String status) {
    }

    public record SignedDeviceRequest(@NotBlank String deviceId, long timestamp, @NotBlank String signature) {
    }

    public record DecisionRequest(@NotBlank String deviceId, @NotBlank String decision,
                                  long timestamp, @NotBlank String signature) {
    }

    public record EnrollRequest(@NotBlank String deviceId, @NotBlank String code,
                                long timestamp, @NotBlank String signature) {
    }

    public record EnrollResponse(List<String> recoveryCodes) {
    }

    /**
     * ADMIN/ROOT tạo mã ghép một lần (2 phút). Phải nhập đúng mật khẩu, và đúng mã TOTP nếu đã bật 2FA.
     * Giới hạn 5 lần mỗi 10 phút cho mỗi tài khoản.
     */
    @PostMapping("/pairing")
    public OtpService.PairingResponse createPairing(@RequestBody @Valid PairingRequest body,
                                                    HttpServletRequest request) {
        final Token token = guard.require(request);
        limiter.check("pairing:" + token.userId(), 5, Duration.ofMinutes(10));
        otp.checkPairingCredentials(token.userId(), body.password(), body.code());
        return otp.createPairing(token.userId());
    }

    /** App gửi mã ghép và khóa công khai. Không cần đăng nhập vì mã ghép là bằng chứng. */
    @PostMapping("/pair")
    public OtpService.PairResponse pair(@RequestBody @Valid PairRequest body) {
        limiter.check("pair", 20, MINUTE);
        return otp.pair(body.code(), body.publicKey(), body.deviceName());
    }

    @GetMapping("/device")
    public OtpService.DeviceStatus device(HttpServletRequest request) {
        final Token token = guard.require(request);
        limiter.check("device:" + token.userId(), 120, MINUTE);
        return otp.deviceStatus(token.userId());
    }

    /** Web gỡ ghép. Đăng xuất mọi phiên của tài khoản. */
    @DeleteMapping("/device")
    @ResponseStatus(NO_CONTENT)
    public void unpair(HttpServletRequest request) {
        final Token token = guard.require(request);
        limiter.check("unpair:" + token.userId(), 10, MINUTE);
        otp.unpair(token.userId());
    }

    /** App gọi khi người dùng xóa ứng dụng hoặc gỡ ghép trên điện thoại. Chứng thực bằng chữ ký của thiết bị. */
    @PostMapping("/device/revoke")
    @ResponseStatus(NO_CONTENT)
    public void revoke(@RequestBody @Valid SignedDeviceRequest body) {
        limiter.check("revoke:" + body.deviceId(), 10, MINUTE);
        otp.revoke(body.deviceId(), body.timestamp(), body.signature());
    }

    /** App xác nhận bật 2FA. Mã TOTP do app tự tính, không cần app bên thứ ba. */
    @PostMapping("/enroll")
    public EnrollResponse enroll(@RequestBody @Valid EnrollRequest body) {
        limiter.check("enroll:" + body.deviceId(), 20, MINUTE);
        return new EnrollResponse(otp.enroll(body.deviceId(), body.code(), body.timestamp(), body.signature()));
    }

    /** Web gọi khi đến bước 2FA. Trả về số đối chiếu hiển thị trên web. */
    @PostMapping("/requests")
    public OtpService.RequestResponse createRequest(@RequestBody @Valid ChallengeRequest body) {
        final Long userId = challenges.verify(body.challenge());
        limiter.check("request:" + userId, 10, MINUTE);
        return otp.createRequest(userId);
    }

    /** Web hỏi trạng thái mỗi 2 giây, nên cho phép khoảng 60 lần mỗi phút. */
    @PostMapping("/requests/status")
    public StatusResponse status(@RequestBody @Valid StatusRequest body) {
        final Long userId = challenges.verify(body.challenge());
        limiter.check("status:" + userId, 60, MINUTE);
        return new StatusResponse(otp.requestStatus(userId, body.requestId()));
    }

    /** App hỏi các yêu cầu đang chờ, mỗi vài giây một lần cho mỗi thiết bị. */
    @PostMapping("/pending")
    public List<OtpService.PendingItem> pending(@RequestBody @Valid SignedDeviceRequest body) {
        limiter.check("pending:" + body.deviceId(), 60, MINUTE);
        return otp.pending(body.deviceId(), body.timestamp(), body.signature());
    }

    @PostMapping("/requests/{id}/decision")
    @ResponseStatus(NO_CONTENT)
    public void decide(@PathVariable String id, @RequestBody @Valid DecisionRequest body) {
        limiter.check("decision:" + body.deviceId(), 30, MINUTE);
        otp.decide(id, body.deviceId(), body.decision(), body.timestamp(), body.signature());
    }

}
