package com.nutshop.cart;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** A signed-in user's cart. Rows are created with an upsert (see CartRepository#createIfAbsent). */
@Entity
@Table(name = "carts")
public class Cart {

	@Id
	private UUID id;

	@Column(name = "user_id", nullable = false, unique = true, updatable = false)
	private UUID userId;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected Cart() {
	}

	public UUID getId() {
		return id;
	}

	public UUID getUserId() {
		return userId;
	}

	public Instant getUpdatedAt() {
		return updatedAt;
	}
}
