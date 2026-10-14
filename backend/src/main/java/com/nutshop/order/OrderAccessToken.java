package com.nutshop.order;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** One tracking link of a guest order. Only the SHA-256 of the token is stored. */
@Entity
@Table(name = "order_access_tokens")
public class OrderAccessToken {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "order_id", nullable = false, updatable = false)
	private UUID orderId;

	@Column(name = "token_hash", nullable = false, unique = true, updatable = false)
	private String tokenHash;

	@Column(name = "expires_at", nullable = false, updatable = false)
	private Instant expiresAt;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected OrderAccessToken() {
	}

	OrderAccessToken(UUID orderId, String tokenHash, Instant createdAt, Instant expiresAt) {
		this.orderId = orderId;
		this.tokenHash = tokenHash;
		this.createdAt = createdAt;
		this.expiresAt = expiresAt;
	}

	public UUID getOrderId() {
		return orderId;
	}

	public String getTokenHash() {
		return tokenHash;
	}

	public Instant getExpiresAt() {
		return expiresAt;
	}
}
