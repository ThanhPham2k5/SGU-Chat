package org.linkwave.userservice.repository;

import org.linkwave.userservice.entity.ScopedRoleEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ScopedRoleRepository extends JpaRepository<ScopedRoleEntity, Long> {

    @Query("""
            select s from ScopedRoleEntity s
            join fetch s.role r
            left join fetch r.permissions
            where s.user.id = :userId and s.revokedAt is null
            """)
    List<ScopedRoleEntity> findActiveByUserId(@Param("userId") Long userId);

}