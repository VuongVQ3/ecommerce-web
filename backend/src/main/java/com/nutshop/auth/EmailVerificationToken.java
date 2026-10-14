package com.nutshop.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** One emailed verification link: valid 24 hours, single use. Only the SHA-256 of the token is stored. */
@Entity
@Table(name = "email_verification_tokens")
public class EmailVerificationToken {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "user_id", nullable = false, updatable = false)
	private UUID userId;

	@Column(name = "token_hash", nullable = false, unique = true, updatable = false)
	private String tokenHash;

	@Column(name = "expires_at", nullable = false, updatable = false)
	private Instant expiresAt;

	@Column(name = "used_at")
	private Instant usedAt;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected EmailVerificationToken() {
	}

	EmailVerificationToken(UUID userId, String tokenHash, Instant createdAt, Instant expiresAt) {
		this.userId = userId;
		this.tokenHash = tokenHash;
		this.createdAt = createdAt;
		this.expiresAt = expiresAt;
	}

	boolean isUsable(Instant now) {
		return usedAt == null && expiresAt.isAfter(now);
	}

	void markUsed(Instant now) {
		usedAt = now;
	}

	UUID getUserId() {
		return userId;
	}
}
