package org.linkwave.auth.repository;

import org.linkwave.auth.entity.OtpRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface OtpRequestRepository extends JpaRepository<OtpRequest, UUID> {

    List<OtpRequest> findByUserIdAndStatus(Long userId, String status);

}
