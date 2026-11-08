package org.linkwave.auth.security;

import lombok.RequiredArgsConstructor;
import org.linkwave.auth.entity.Role;
import org.linkwave.auth.repository.UserRepository;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class DefaultUserDetailsService implements UserDetailsService {

    /**
     * Vai trò nền: mọi tài khoản đã đăng nhập đều có ROLE_USER.
     * Các service kiểm tra hasRole("USER"), nên vai trò bổ sung (LECTURER, ADMIN, ROOT...)
     * không được thay thế ROLE_USER. Gán thêm ở đây để không phụ thuộc dữ liệu gán tay.
     */
    static final String BASE_ROLE = "ROLE_USER";

    private final UserRepository userRepository;

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        return userRepository.findByUsername(username).map(user -> {
            final Set<SimpleGrantedAuthority> authorities = new LinkedHashSet<>();
            authorities.add(new SimpleGrantedAuthority(BASE_ROLE));
            user.getRoles().stream()
                    .map(Role::getName)
                    .map(SimpleGrantedAuthority::new)
                    .forEach(authorities::add);

            return new DefaultUserDetails(
                    user.getId(),
                    user.getUsername(),
                    user.getPassword(),
                    user.isDeleted(),
                    user.isBlocked(),
                    List.copyOf(authorities));
        }).orElseThrow(() -> new UsernameNotFoundException("username not found"));
    }

}