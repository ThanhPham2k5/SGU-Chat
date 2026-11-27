package org.linkwave.auth.repository;

import org.linkwave.auth.entity.TwoFactorReset;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface TwoFactorResetRepository extends JpaRepository<TwoFactorReset, Long> {
}
