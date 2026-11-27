package org.linkwave.auth.service;

import lombok.RequiredArgsConstructor;
import org.linkwave.auth.entity.AuditLog;
import org.linkwave.auth.entity.TwoFactorReset;
import org.linkwave.auth.entity.User;
import org.linkwave.auth.repository.AuditLogRepository;
import org.linkwave.auth.repository.OtpDeviceRepository;
import org.linkwave.auth.repository.OtpPairingRepository;
import org.linkwave.auth.repository.TotpRecoveryCodeRepository;
import org.linkwave.auth.repository.TotpSecretRepository;
import org.linkwave.auth.repository.TwoFactorResetRepository;
import org.linkwave.auth.repository.UserRepository;
import org.linkwave.auth.security.DefaultUserDetails;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.ZonedDateTime;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.NOT_FOUND;

/**
 * ROOT đặt lại 2FA cho ADMIN khi ADMIN mất thiết bị.
 * Quy trình: ROOT yêu cầu, chờ hết thời gian (mặc định 24 giờ), ROOT xác nhận thực hiện, hoặc hủy trước đó.
 * Khi thực hiện: xóa bí mật TOTP, mã khôi phục, thiết bị ghép, mã ghép, và đăng xuất mọi phiên của ADMIN.
 */
@Service
@RequiredArgsConstructor
public class TwoFactorResetService {

    public record ResetItem(Long userId, String username, ZonedDateTime requestedAt, ZonedDateTime executeAfter) {
    }

    private final TwoFactorResetRepository resets;
    private final TotpSecretRepository secrets;
    private final TotpRecoveryCodeRepository recoveryCodes;
    private final OtpDeviceRepository devices;
    private final OtpPairingRepository pairings;
    private final UserRepository users;
    private final UserDetailsService userDetailsService;
    private final UserService userService;
    private final AuditLogRepository auditLogs;

    /** Thời gian chờ trước khi đặt lại có hiệu lực. Mặc định 24 giờ. Có thể đặt biến môi trường để test. */
    @Value("${TWOFA_RESET_DELAY_MINUTES:1440}")
    private long delayMinutes;

    @Transactional(readOnly = true)
    public List<ResetItem> pending() {
        return resets.findAll().stream()
                .map(r -> new ResetItem(
                        r.getUserId(),
                        users.findById(r.getUserId()).map(User::getUsername).orElse(""),
                        r.getRequestedAt(),
                        r.getExecuteAfter()))
                .toList();
    }

    @Transactional
    public void request(Long rootId, String username) {
        final DefaultUserDetails target = loadTarget(username);
        if (target.getId().equals(rootId)) {
            throw new ResponseStatusException(BAD_REQUEST, "Không thể tự đặt lại 2FA của chính mình");
        }
        final Set<String> roles = target.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .collect(Collectors.toSet());
        if (roles.contains("ROLE_ROOT") || !roles.contains("ROLE_ADMIN")) {
            throw new ResponseStatusException(BAD_REQUEST, "Chỉ đặt lại 2FA cho tài khoản ADMIN");
        }

        final ZonedDateTime now = ZonedDateTime.now();
        resets.save(TwoFactorReset.builder()
                .userId(target.getId())
                .requestedBy(rootId)
                .requestedAt(now)
                .executeAfter(now.plusMinutes(delayMinutes))
                .build());
        audit(rootId, target.getId(), "2FA_RESET_REQUESTED");
    }

    @Transactional
    public void execute(Long rootId, Long targetId) {
        final TwoFactorReset reset = resets.findById(targetId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Không có yêu cầu đặt lại cho tài khoản này"));
        if (reset.getExecuteAfter().isAfter(ZonedDateTime.now())) {
            throw new ResponseStatusException(CONFLICT, "Chưa đến thời gian thực hiện đặt lại");
        }

        secrets.deleteById(targetId);
        recoveryCodes.deleteByUserId(targetId);
        devices.deleteById(targetId);
        pairings.deleteByUserId(targetId);
        resets.delete(reset);
        userService.logoutAllDevices(targetId);
        audit(rootId, targetId, "2FA_RESET_DONE");
    }

    @Transactional
    public void cancel(Long targetId) {
        if (!resets.existsById(targetId)) {
            throw new ResponseStatusException(NOT_FOUND, "Không có yêu cầu đặt lại cho tài khoản này");
        }
        resets.deleteById(targetId);
    }

    private DefaultUserDetails loadTarget(String username) {
        try {
            return (DefaultUserDetails) userDetailsService.loadUserByUsername(username == null ? "" : username.trim());
        } catch (UsernameNotFoundException e) {
            throw new ResponseStatusException(NOT_FOUND, "Không tìm thấy tài khoản");
        }
    }

    private void audit(Long actorId, Long targetId, String action) {
        auditLogs.save(AuditLog.builder()
                .actorId(actorId)
                .action(action)
                .targetType("USER")
                .targetId(String.valueOf(targetId))
                .build());
    }

}
