package com.nutshop.auth;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, UUID> {

	/** Row lock so the same link cannot be redeemed twice concurrently. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	Optional<PasswordResetToken> findByTokenHash(String tokenHash);

	/** Only the newest link should work: called before issuing a new one and after a successful reset. */
	@Modifying
	@Query("UPDATE PasswordResetToken t SET t.usedAt = :now WHERE t.user.id = :userId AND t.usedAt IS NULL")
	int invalidateUnused(@Param("userId") UUID userId, @Param("now") Instant now);
}
