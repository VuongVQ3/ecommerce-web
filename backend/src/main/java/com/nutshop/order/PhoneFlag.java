package com.nutshop.order;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** A phone number the shop watches (WATCH) or no longer takes cash-on-delivery orders from (BLOCK_COD). */
@Entity
@Table(name = "phone_flags")
public class PhoneFlag {

	public enum Level {
		WATCH, BLOCK_COD
	}

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(nullable = false, unique = true, updatable = false)
	private String phone;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private Level level;

	@Column(nullable = false)
	private String reason;

	@Column(name = "created_by", updatable = false)
	private UUID createdBy;

	@Column(name = "updated_by")
	private UUID updatedBy;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected PhoneFlag() {
	}

	PhoneFlag(String phone, Level level, String reason, UUID actorId, Instant now) {
		this.phone = phone;
		this.level = level;
		this.reason = reason;
		this.createdBy = actorId;
		this.updatedBy = actorId;
		this.createdAt = now;
		this.updatedAt = now;
	}

	void update(Level level, String reason, UUID actorId, Instant now) {
		this.level = level;
		this.reason = reason;
		this.updatedBy = actorId;
		this.updatedAt = now;
	}

	public String getPhone() {
		return phone;
	}

	public Level getLevel() {
		return level;
	}

	public String getReason() {
		return reason;
	}

	public UUID getCreatedBy() {
		return createdBy;
	}

	public UUID getUpdatedBy() {
		return updatedBy;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public Instant getUpdatedAt() {
		return updatedAt;
	}
}
