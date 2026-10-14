package com.nutshop.auth;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface EmailVerificationTokenRepository extends JpaRepository<EmailVerificationToken, UUID> {

	Optional<EmailVerificationToken> findByTokenHash(String tokenHash);

	/** A new link replaces the previous ones. */
	@Modifying
	@Query("UPDATE EmailVerificationToken t SET t.usedAt = :now WHERE t.userId = :userId AND t.usedAt IS NULL")
	int invalidateUnused(@Param("userId") UUID userId, @Param("now") Instant now);
}
