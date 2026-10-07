package com.nutshop.cart;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * One product line in a cart. Written only through upserts in CartItemRepository, so concurrent adds of the same
 * product merge into one row (UNIQUE cart_id, product_id) instead of racing.
 */
@Entity
@Table(name = "cart_items")
public class CartItem {

	@Id
	private UUID id;

	@Column(name = "cart_id", nullable = false, updatable = false)
	private UUID cartId;

	@Column(name = "product_id", nullable = false, updatable = false)
	private Long productId;

	@Column(nullable = false)
	private int quantity;

	/** Product price (VND) when first added; only used to flag price changes, never to charge. */
	@Column(name = "price_at_add", nullable = false, updatable = false)
	private Long priceAtAdd;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected CartItem() {
	}

	public UUID getId() {
		return id;
	}

	public UUID getCartId() {
		return cartId;
	}

	public Long getProductId() {
		return productId;
	}

	public int getQuantity() {
		return quantity;
	}

	public Long getPriceAtAdd() {
		return priceAtAdd;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}
}
