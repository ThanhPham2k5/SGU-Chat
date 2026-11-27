package org.linkwave.auth.repository;

import org.linkwave.auth.entity.OtpPairing;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface OtpPairingRepository extends JpaRepository<OtpPairing, String> {

    void deleteByUserId(Long userId);

}
