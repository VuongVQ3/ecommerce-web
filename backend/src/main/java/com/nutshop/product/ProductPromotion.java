package com.nutshop.product;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** A sale price for one product between startsAt (inclusive) and endsAt (exclusive). */
@Entity
@Table(name = "product_promotions")
public class ProductPromotion {

	public enum Status {
		UPCOMING, RUNNING, ENDED, CANCELLED
	}

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "product_id", nullable = false, updatable = false)
	private Long productId;

	@Column(name = "sale_price", nullable = false)
	private long salePrice;

	@Column(name = "starts_at", nullable = false)
	private Instant startsAt;

	@Column(name = "ends_at", nullable = false)
	private Instant endsAt;

	@Column(nullable = false)
	private boolean active = true;

	@Column(name = "created_by", updatable = false)
	private UUID createdBy;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected ProductPromotion() {
	}

	ProductPromotion(Long productId, long salePrice, Instant startsAt, Instant endsAt, UUID createdBy, Instant now) {
		this.productId = productId;
		this.salePrice = salePrice;
		this.startsAt = startsAt;
		this.endsAt = endsAt;
		this.createdBy = createdBy;
		this.createdAt = now;
		this.updatedAt = now;
	}

	public Status status(Instant now) {
		if (!active) {
			return Status.CANCELLED;
		}
		if (now.isBefore(startsAt)) {
			return Status.UPCOMING;
		}
		return now.isBefore(endsAt) ? Status.RUNNING : Status.ENDED;
	}

	void reschedule(long salePrice, Instant startsAt, Instant endsAt, Instant now) {
		this.salePrice = salePrice;
		this.startsAt = startsAt;
		this.endsAt = endsAt;
		this.updatedAt = now;
	}

	/** Running: stops now. */
	void endAt(Instant now) {
		this.endsAt = now;
		this.updatedAt = now;
	}

	/** Not started yet: never takes effect (kept for history). */
	void cancel(Instant now) {
		this.active = false;
		this.updatedAt = now;
	}

	public UUID getId() {
		return id;
	}

	public Long getProductId() {
		return productId;
	}

	public long getSalePrice() {
		return salePrice;
	}

	public Instant getStartsAt() {
		return startsAt;
	}

	public Instant getEndsAt() {
		return endsAt;
	}

	public boolean isActive() {
		return active;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}
}
