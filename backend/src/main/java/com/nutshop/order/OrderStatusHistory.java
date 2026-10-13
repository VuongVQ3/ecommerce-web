package com.nutshop.order;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

/** One row per status change (and one for creation, with a null fromStatus). */
@Entity
@Table(name = "order_status_history")
public class OrderStatusHistory {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "order_id", nullable = false, updatable = false)
	private UUID orderId;

	@Enumerated(EnumType.STRING)
	@Column(name = "from_status")
	private OrderStatus fromStatus;

	@Enumerated(EnumType.STRING)
	@Column(name = "to_status", nullable = false)
	private OrderStatus toStatus;

	/** Null for guests and system actions. */
	@Column(name = "changed_by")
	private UUID changedBy;

	private String reason;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt = Instant.now();

	protected OrderStatusHistory() {
	}

	public OrderStatusHistory(UUID orderId, OrderStatus fromStatus, OrderStatus toStatus, UUID changedBy,
			String reason) {
		this.orderId = orderId;
		this.fromStatus = fromStatus;
		this.toStatus = toStatus;
		this.changedBy = changedBy;
		this.reason = reason;
	}

	public OrderStatus getFromStatus() {
		return fromStatus;
	}

	public OrderStatus getToStatus() {
		return toStatus;
	}

	public String getReason() {
		return reason;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}
}
