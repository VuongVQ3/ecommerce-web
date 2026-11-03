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

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, UUID> {

	/** Row lock so two concurrent refreshes with the same token are serialized. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	Optional<RefreshToken> findByTokenHash(String tokenHash);

	@Modifying
	@Query("UPDATE RefreshToken t SET t.revokedAt = :now WHERE t.user.id = :userId AND t.revokedAt IS NULL")
	int revokeAllActive(@Param("userId") UUID userId, @Param("now") Instant now);

	/**
	 * Every new session token (sign-in or refresh) marks the account as in use, for the retention job. Native, on a
	 * column the User entity does not map, so a later save of the entity cannot write an older value back.
	 */
	@Modifying
	@Query(value = "UPDATE users SET last_login_at = :now WHERE id = :userId", nativeQuery = true)
	int markUserActive(@Param("userId") UUID userId, @Param("now") Instant now);
}
