package org.linkwave.userservice.controller;

import lombok.RequiredArgsConstructor;
import org.linkwave.shared.auth.DefaultUserDetails;
import org.linkwave.userservice.entity.ScopeType;
import org.linkwave.userservice.service.AccessPolicyService;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Set;

@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class AccessController {

    private final AccessPolicyService accessPolicyService;

    public record AccessDto(Long userId, int level, Set<String> schoolPermissions) {
    }

    /** Cấp và quyền toàn trường của một tài khoản. Xem người khác cần user.view toàn trường. */
    @GetMapping("/{id}/access")
    public AccessDto getAccess(@PathVariable Long id) {
        final Long actorId = currentUserId();
        if (!actorId.equals(id)) {
            accessPolicyService.require(actorId, "user.view", ScopeType.SCHOOL, null);
        }
        return new AccessDto(
                id,
                accessPolicyService.levelOf(id),
                accessPolicyService.permissionsFor(id, ScopeType.SCHOOL, null)
        );
    }

    private Long currentUserId() {
        return ((DefaultUserDetails) SecurityContextHolder.getContext().getAuthentication().getPrincipal()).id();
    }

}