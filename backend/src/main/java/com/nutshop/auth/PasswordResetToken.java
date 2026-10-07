package com.nutshop.auth;

import com.nutshop.user.User;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "password_reset_tokens")
public class PasswordResetToken {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "user_id")
	private User user;

	/** SHA-256 (hex) of the token in the emailed link. */
	@Column(name = "token_hash", nullable = false, unique = true, length = 64)
	private String tokenHash;

	@Column(name = "expires_at", nullable = false)
	private Instant expiresAt;

	@Column(name = "used_at")
	private Instant usedAt;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected PasswordResetToken() {
	}

	public PasswordResetToken(User user, String tokenHash, Instant createdAt, Instant expiresAt) {
		this.user = user;
		this.tokenHash = tokenHash;
		this.createdAt = createdAt;
		this.expiresAt = expiresAt;
	}

	/** Not used yet and not expired. */
	public boolean isUsable(Instant now) {
		return usedAt == null && expiresAt.isAfter(now);
	}

	public void markUsed(Instant now) {
		if (usedAt == null) {
			usedAt = now;
		}
	}

	public UUID getId() {
		return id;
	}

	public User getUser() {
		return user;
	}

	public Instant getExpiresAt() {
		return expiresAt;
	}

	public Instant getUsedAt() {
		return usedAt;
	}
}
