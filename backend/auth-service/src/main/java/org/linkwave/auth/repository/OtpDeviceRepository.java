package org.linkwave.auth.repository;

import org.linkwave.auth.entity.OtpDevice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface OtpDeviceRepository extends JpaRepository<OtpDevice, Long> {

    Optional<OtpDevice> findByDeviceId(UUID deviceId);

}
