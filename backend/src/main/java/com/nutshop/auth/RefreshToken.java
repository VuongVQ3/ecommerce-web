package com.nutshop.auth;

import com.nutshop.user.User;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "refresh_tokens")
public class RefreshToken {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "user_id")
	private User user;

	/** SHA-256 (hex) of the raw token. The raw token is never stored. */
	@Column(name = "token_hash", nullable = false, unique = true, length = 64)
	private String tokenHash;

	@Column(name = "expires_at", nullable = false)
	private Instant expiresAt;

	@Column(name = "revoked_at")
	private Instant revokedAt;

	/** The token issued when this one was rotated. */
	@Column(name = "replaced_by_id")
	private UUID replacedById;

	@Column(name = "user_agent", length = 512)
	private String userAgent;

	@Column(length = 64)
	private String ip;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected RefreshToken() {
	}

	public RefreshToken(User user, String tokenHash, Instant createdAt, Instant expiresAt, ClientInfo client) {
		this.user = user;
		this.tokenHash = tokenHash;
		this.createdAt = createdAt;
		this.expiresAt = expiresAt;
		this.userAgent = client.userAgent();
		this.ip = client.ip();
	}

	public boolean isRevoked() {
		return revokedAt != null;
	}

	public boolean isExpired(Instant now) {
		return !expiresAt.isAfter(now);
	}

	public void revoke(Instant now) {
		if (revokedAt == null) {
			revokedAt = now;
		}
	}

	public void replaceWith(UUID nextId) {
		this.replacedById = nextId;
	}

	public UUID getId() {
		return id;
	}

	public User getUser() {
		return user;
	}

	public String getTokenHash() {
		return tokenHash;
	}

	public Instant getExpiresAt() {
		return expiresAt;
	}

	public Instant getRevokedAt() {
		return revokedAt;
	}

	public UUID getReplacedById() {
		return replacedById;
	}
}
