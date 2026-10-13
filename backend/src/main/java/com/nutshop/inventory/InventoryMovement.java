package com.nutshop.inventory;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

/** Audit row for every stock change. See V9__orders.sql for the meaning of the signed quantity per type. */
@Entity
@Table(name = "inventory_movements")
public class InventoryMovement {

	public enum Type {
		ORDER_RESERVE, ORDER_CANCEL, ORDER_SHIP, IMPORT, ADJUST
	}

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "product_id", nullable = false, updatable = false)
	private Long productId;

	@Column(nullable = false, updatable = false)
	private int quantity;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, updatable = false)
	private Type type;

	@Column(name = "order_id", updatable = false)
	private UUID orderId;

	@Column(name = "actor_id", updatable = false)
	private UUID actorId;

	private String note;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt = Instant.now();

	protected InventoryMovement() {
	}

	public InventoryMovement(Long productId, int quantity, Type type, UUID orderId, UUID actorId, String note) {
		this.productId = productId;
		this.quantity = quantity;
		this.type = type;
		this.orderId = orderId;
		this.actorId = actorId;
		this.note = note;
	}

	public Long getProductId() {
		return productId;
	}

	public int getQuantity() {
		return quantity;
	}

	public Type getType() {
		return type;
	}

	public UUID getOrderId() {
		return orderId;
	}

	public String getNote() {
		return note;
	}
}
