package com.nutshop.order;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

/** Internal note on an order, visible to staff only. */
@Entity
@Table(name = "order_notes")
public class OrderNote {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "order_id", nullable = false, updatable = false)
	private UUID orderId;

	@Column(name = "author_id", updatable = false)
	private UUID authorId;

	@Column(nullable = false, updatable = false, length = 1000)
	private String body;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt = Instant.now();

	protected OrderNote() {
	}

	public OrderNote(UUID orderId, UUID authorId, String body) {
		this.orderId = orderId;
		this.authorId = authorId;
		this.body = body;
	}

	public UUID getId() {
		return id;
	}

	public UUID getAuthorId() {
		return authorId;
	}

	public String getBody() {
		return body;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}
}
