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

	/** IMPORT only: purchase price per unit (VND). */
	@Column(name = "unit_cost", updatable = false)
	private Long unitCost;

	/** IMPORT only. */
	@Column(updatable = false)
	private String supplier;

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

	static InventoryMovement imported(Long productId, int quantity, Long unitCost, String supplier, String note,
			UUID actorId) {
		InventoryMovement m = new InventoryMovement(productId, quantity, Type.IMPORT, null, actorId, note);
		m.unitCost = unitCost;
		m.supplier = supplier;
		return m;
	}

	public UUID getId() {
		return id;
	}

	public UUID getActorId() {
		return actorId;
	}

	public Long getUnitCost() {
		return unitCost;
	}

	public String getSupplier() {
		return supplier;
	}

	public Instant getCreatedAt() {
		return createdAt;
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
