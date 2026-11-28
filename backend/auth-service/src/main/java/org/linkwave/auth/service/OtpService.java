package org.linkwave.auth.service;

import lombok.RequiredArgsConstructor;
import org.linkwave.auth.entity.AuditLog;
import org.linkwave.auth.entity.OtpDevice;
import org.linkwave.auth.entity.OtpPairing;
import org.linkwave.auth.entity.OtpRequest;
import org.linkwave.auth.entity.User;
import org.linkwave.auth.repository.AuditLogRepository;
import org.linkwave.auth.repository.OtpDeviceRepository;
import org.linkwave.auth.repository.OtpPairingRepository;
import org.linkwave.auth.repository.OtpRequestRepository;
import org.linkwave.auth.repository.UserRepository;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.NOT_FOUND;
import static org.springframework.http.HttpStatus.TOO_MANY_REQUESTS;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;

/**
 * Duyệt đăng nhập bằng ứng dụng otp-app.
 * Thiết bị ký bằng ECDSA P-256 (SHA256withECDSA, chữ ký DER dạng base64). Máy chủ chỉ giữ khóa công khai.
 * Thông điệp ký:
 *   pending|{deviceId}|{timestamp}
 *   decision|{requestId}|{APPROVE|REJECT}|{deviceId}|{timestamp}
 *   revoke|{deviceId}|{timestamp}
 */
@Service
@RequiredArgsConstructor
public class OtpService {

    static final Duration PAIRING_TTL = Duration.ofMinutes(2);
    static final Duration REQUEST_TTL = Duration.ofMinutes(2);
    static final long MAX_CLOCK_SKEW_SECONDS = 60;

    static final String PENDING = "PENDING";
    static final String APPROVED = "APPROVED";
    static final String REJECTED = "REJECTED";
    static final String CONSUMED = "CONSUMED";
    static final String EXPIRED = "EXPIRED";

    private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int CODE_LENGTH = 10;
    private static final SecureRandom RANDOM = new SecureRandom();
    // Không inject PasswordEncoder từ SecurityConfig để tránh vòng phụ thuộc bean (giống TwoFactorService)
    private static final BCryptPasswordEncoder PASSWORDS = new BCryptPasswordEncoder();
    private static final String EC_ALGORITHM = "EC";
    private static final String SIGNATURE_ALGORITHM = "SHA256withECDSA";

    public enum Decision { APPROVE, REJECT }

    public record PairingResponse(String code, ZonedDateTime expiresAt) {
    }

    /** totpSecret: bí mật TOTP (base32) để app dùng khi không có mạng. Chỉ trả về một lần lúc ghép. */
    public record PairResponse(String deviceId, String totpSecret, String username) {
    }

    public record DeviceStatus(boolean paired, boolean totpEnabled, String deviceName, ZonedDateTime pairedAt) {
    }

    public record RequestResponse(String requestId, String number, ZonedDateTime expiresAt) {
    }

    public record PendingItem(String requestId, String number, ZonedDateTime createdAt, ZonedDateTime expiresAt) {
    }

    private final OtpDeviceRepository devices;
    private final OtpPairingRepository pairings;
    private final OtpRequestRepository requests;
    private final AuditLogRepository auditLogs;
    private final TwoFactorService twoFactor;
    private final UserRepository users;
    private final UserService userService;

    /**
     * Trước khi cấp mã ghép: phải đúng mật khẩu và, nếu đã bật 2FA, đúng mã TOTP hiện tại (hoặc mã khôi phục).
     * Không @Transactional để bộ đếm thử sai của TOTP được lưu khi báo lỗi.
     */
    public void checkPairingCredentials(Long userId, String password, String code) {
        final User user = users.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(UNAUTHORIZED, "Phiên không hợp lệ"));
        if (password == null || !PASSWORDS.matches(password, user.getPassword())) {
            audit(userId, "OTP_PAIRING_PASSWORD_FAIL");
            // Không dùng 401: web hiểu 401 là phiên hết hạn và đăng xuất
            throw new ResponseStatusException(BAD_REQUEST, "Mật khẩu không đúng");
        }
        if (twoFactor.isEnabled(userId)) {
            final TwoFactorService.Check check = twoFactor.verifyLogin(userId, code);
            if (check == TwoFactorService.Check.LOCKED) {
                throw new ResponseStatusException(TOO_MANY_REQUESTS, "Nhập sai quá nhiều lần, vui lòng thử lại sau 5 phút");
            }
            if (check != TwoFactorService.Check.OK) {
                throw new ResponseStatusException(BAD_REQUEST, "Mã xác thực không đúng");
            }
        }
    }

    @Transactional
    public PairingResponse createPairing(Long userId) {
        if (!twoFactor.hasSecret(userId)) {
            throw new ResponseStatusException(CONFLICT, "Hãy bấm Thiết lập 2FA trước khi ghép thiết bị");
        }
        pairings.deleteByUserId(userId);
        final String code = randomCode();
        final ZonedDateTime expiresAt = ZonedDateTime.now().plus(PAIRING_TTL);
        pairings.save(OtpPairing.builder()
                .codeHash(sha256(code))
                .userId(userId)
                .expiresAt(expiresAt)
                .build());
        audit(userId, "OTP_PAIRING_CREATED");
        return new PairingResponse(code, expiresAt);
    }

    @Transactional
    public PairResponse pair(String rawCode, String publicKeyB64, String deviceName) {
        requireP256(parsePublicKey(publicKeyB64));

        final OtpPairing pairing = pairings.findById(sha256(normalizeCode(rawCode)))
                .filter(p -> p.getExpiresAt().isAfter(ZonedDateTime.now()))
                .orElseThrow(() -> new ResponseStatusException(BAD_REQUEST, "Mã ghép không đúng hoặc đã hết hạn"));
        pairings.delete(pairing);
        final Long userId = pairing.getUserId();

        final OtpDevice device = devices.findById(userId).orElseGet(OtpDevice::new);
        device.setUserId(userId);
        device.setDeviceId(UUID.randomUUID());
        device.setPublicKey(publicKeyB64);
        device.setDeviceName(deviceName == null || deviceName.isBlank() ? "Thiết bị" : deviceName.trim());
        device.setPairedAt(ZonedDateTime.now());
        device.setLastSeenAt(null);
        devices.save(device);

        expirePending(userId);
        audit(userId, "OTP_PAIRED");
        final String totpSecret = twoFactor.exportSecretBase32(userId).orElse(null);
        final String username = users.findById(userId).map(User::getUsername).orElse("");
        return new PairResponse(device.getDeviceId().toString(), totpSecret, username);
    }

    @Transactional(readOnly = true)
    public DeviceStatus deviceStatus(Long userId) {
        final boolean totpEnabled = twoFactor.isEnabled(userId);
        return devices.findById(userId)
                .map(d -> new DeviceStatus(true, totpEnabled, d.getDeviceName(), d.getPairedAt()))
                .orElse(new DeviceStatus(false, totpEnabled, null, null));
    }

    /** Web gỡ ghép: xóa thiết bị và đăng xuất mọi phiên của tài khoản. */
    @Transactional
    public void unpair(Long userId) {
        devices.findById(userId).ifPresent(devices::delete);
        expirePending(userId);
        twoFactor.clearForUnpair(userId);
        userService.logoutAllDevices(userId);
        audit(userId, "OTP_UNPAIRED");
    }

    /**
     * App gọi khi người dùng xóa ứng dụng hoặc gỡ ghép trên điện thoại.
     * Xóa thiết bị và đăng xuất mọi phiên, để không còn trạng thái "app đã gỡ nhưng web vẫn đòi duyệt".
     */
    @Transactional
    public void revoke(String deviceId, long timestamp, String signature) {
        final OtpDevice device = authenticateDevice(deviceId,
                "revoke|" + deviceId + "|" + timestamp, timestamp, signature);
        final Long userId = device.getUserId();
        devices.delete(device);
        expirePending(userId);
        twoFactor.clearForUnpair(userId);
        userService.logoutAllDevices(userId);
        audit(userId, "OTP_REVOKED_BY_APP");
    }

    /** Web gọi sau khi đúng mật khẩu, ngay khi có challenge. Trả về số đối chiếu 2 chữ số. */
    @Transactional
    public RequestResponse createRequest(Long userId) {
        if (devices.findById(userId).isEmpty()) {
            throw new ResponseStatusException(NOT_FOUND, "Chưa ghép thiết bị duyệt đăng nhập");
        }
        expirePending(userId);
        final String number = String.format("%02d", RANDOM.nextInt(100));
        final ZonedDateTime now = ZonedDateTime.now();
        final OtpRequest request = requests.save(OtpRequest.builder()
                .id(UUID.randomUUID())
                .userId(userId)
                .number(number)
                .status(PENDING)
                .createdAt(now)
                .expiresAt(now.plus(REQUEST_TTL))
                .build());
        audit(userId, "OTP_REQUEST_CREATED");
        return new RequestResponse(request.getId().toString(), number, request.getExpiresAt());
    }

    /** Web hỏi trạng thái khi đang chờ duyệt. */
    @Transactional
    public String requestStatus(Long userId, String rawId) {
        final OtpRequest request = findOwned(userId, rawId);
        if (PENDING.equals(request.getStatus()) && isExpired(request)) {
            request.setStatus(EXPIRED);
            requests.save(request);
        }
        return request.getStatus();
    }

    /** Dùng khi xác thực đăng nhập. Mỗi yêu cầu chỉ đổi thành đăng nhập được một lần. */
    @Transactional
    public void consumeApproved(Long userId, String rawId) {
        final OtpRequest request = findOwned(userId, rawId);
        if (!APPROVED.equals(request.getStatus()) || isExpired(request)) {
            throw new ResponseStatusException(UNAUTHORIZED, "Yêu cầu chưa được duyệt hoặc đã hết hạn");
        }
        request.setStatus(CONSUMED);
        requests.save(request);
        audit(userId, "OTP_LOGIN_OK");
    }

    /** App gọi định kỳ để lấy các yêu cầu đang chờ. */
    @Transactional
    public List<PendingItem> pending(String deviceId, long timestamp, String signature) {
        final OtpDevice device = authenticateDevice(deviceId,
                "pending|" + deviceId + "|" + timestamp, timestamp, signature);
        final ZonedDateTime now = ZonedDateTime.now();
        device.setLastSeenAt(now);
        devices.save(device);
        return requests.findByUserIdAndStatus(device.getUserId(), PENDING).stream()
                .filter(r -> r.getExpiresAt().isAfter(now))
                .map(r -> new PendingItem(r.getId().toString(), r.getNumber(), r.getCreatedAt(), r.getExpiresAt()))
                .toList();
    }

    /**
     * App xác nhận bật 2FA bằng mã TOTP do chính app tính từ bí mật nhận lúc ghép.
     * Trả về 8 mã khôi phục, app hiển thị một lần.
     */
    @Transactional
    public List<String> enroll(String deviceId, String code, long timestamp, String signature) {
        final OtpDevice device = authenticateDevice(deviceId,
                "enroll|" + deviceId + "|" + code + "|" + timestamp, timestamp, signature);
        final List<String> recoveryCodes = twoFactor.confirm(device.getUserId(), code);
        audit(device.getUserId(), "OTP_ENROLLED");
        return recoveryCodes;
    }

    /** App duyệt hoặc từ chối. Yêu cầu đã xử lý hoặc hết hạn thì không đổi được nữa. */
    @Transactional
    public void decide(String requestId, String deviceId, String rawDecision, long timestamp, String signature) {
        final Decision decision = parseDecision(rawDecision);
        final OtpDevice device = authenticateDevice(deviceId,
                "decision|" + requestId + "|" + decision.name() + "|" + deviceId + "|" + timestamp,
                timestamp, signature);
        final OtpRequest request = findOwned(device.getUserId(), requestId);
        if (!PENDING.equals(request.getStatus()) || isExpired(request)) {
            throw new ResponseStatusException(CONFLICT, "Yêu cầu đã hết hạn hoặc đã được xử lý");
        }
        request.setStatus(decision == Decision.APPROVE ? APPROVED : REJECTED);
        request.setDecidedAt(ZonedDateTime.now());
        requests.save(request);
        audit(device.getUserId(), decision == Decision.APPROVE ? "OTP_APPROVED" : "OTP_REJECTED");
    }

    private OtpDevice authenticateDevice(String deviceId, String message, long timestamp, String signature) {
        final UUID id = parseUuid(deviceId, UNAUTHORIZED, "Thiết bị không hợp lệ");
        final OtpDevice device = devices.findByDeviceId(id)
                .orElseThrow(() -> new ResponseStatusException(UNAUTHORIZED, "Thiết bị không hợp lệ"));
        if (Math.abs(Instant.now().getEpochSecond() - timestamp) > MAX_CLOCK_SKEW_SECONDS) {
            throw new ResponseStatusException(UNAUTHORIZED, "Yêu cầu đã quá hạn, hãy kiểm tra đồng hồ điện thoại");
        }
        verifySignature(device.getPublicKey(), message, signature);
        return device;
    }

    private OtpRequest findOwned(Long userId, String rawId) {
        final UUID id = parseUuid(rawId, BAD_REQUEST, "Mã yêu cầu không hợp lệ");
        return requests.findById(id)
                .filter(r -> r.getUserId().equals(userId))
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Không tìm thấy yêu cầu"));
    }

    private void expirePending(Long userId) {
        final ZonedDateTime now = ZonedDateTime.now();
        for (OtpRequest request : requests.findByUserIdAndStatus(userId, PENDING)) {
            request.setStatus(EXPIRED);
            request.setDecidedAt(now);
            requests.save(request);
        }
    }

    private void audit(Long userId, String action) {
        auditLogs.save(AuditLog.builder()
                .actorId(userId)
                .action(action)
                .targetType("USER")
                .targetId(String.valueOf(userId))
                .build());
    }

    private static boolean isExpired(OtpRequest request) {
        return !request.getExpiresAt().isAfter(ZonedDateTime.now());
    }

    private static Decision parseDecision(String raw) {
        try {
            return Decision.valueOf(raw);
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new ResponseStatusException(BAD_REQUEST, "Quyết định phải là APPROVE hoặc REJECT");
        }
    }

    private static UUID parseUuid(String raw, org.springframework.http.HttpStatus status, String message) {
        try {
            return UUID.fromString(raw);
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new ResponseStatusException(status, message);
        }
    }

    static PublicKey parsePublicKey(String b64) {
        try {
            return KeyFactory.getInstance(EC_ALGORITHM)
                    .generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(b64)));
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            throw new ResponseStatusException(BAD_REQUEST, "Khóa công khai không hợp lệ");
        }
    }

    private static void requireP256(PublicKey key) {
        if (!(key instanceof ECPublicKey ec) || ec.getParams().getCurve().getField().getFieldSize() != 256) {
            throw new ResponseStatusException(BAD_REQUEST, "Khóa công khai phải dùng đường cong P-256");
        }
    }

    static void verifySignature(String publicKeyB64, String message, String signatureB64) {
        try {
            final Signature verifier = Signature.getInstance(SIGNATURE_ALGORITHM);
            verifier.initVerify(parsePublicKey(publicKeyB64));
            verifier.update(message.getBytes(StandardCharsets.UTF_8));
            if (!verifier.verify(Base64.getDecoder().decode(signatureB64))) {
                throw new ResponseStatusException(UNAUTHORIZED, "Chữ ký không hợp lệ");
            }
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            throw new ResponseStatusException(UNAUTHORIZED, "Chữ ký không hợp lệ");
        }
    }

    static String normalizeCode(String raw) {
        return raw == null ? "" : raw.replace("-", "").replace(" ", "").trim().toUpperCase();
    }

    private static String randomCode() {
        final StringBuilder sb = new StringBuilder();
        for (int i = 0; i < CODE_LENGTH; i++) {
            sb.append(CODE_ALPHABET.charAt(RANDOM.nextInt(CODE_ALPHABET.length())));
        }
        return sb.toString();
    }

    static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 không khả dụng", e);
        }
    }

}
