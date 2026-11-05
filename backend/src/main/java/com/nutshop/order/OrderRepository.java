package com.nutshop.order;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface OrderRepository extends JpaRepository<Order, UUID>, JpaSpecificationExecutor<Order> {

	long countByStatus(OrderStatus status);

	/** Id, code and time of an order, nothing about the customer (the admin's new-order polling). */
	interface LatestOrder {
		UUID getId();

		String getCode();

		Instant getCreatedAt();
	}

	/** The newest order of any status; selects only the three columns of {@link LatestOrder} (idx_orders_created_at). */
	Optional<LatestOrder> findFirstByOrderByCreatedAtDesc();

	/** Open orders a phone is currently holding (used to cap anonymous PENDING orders per phone). */
	long countByPhoneAndStatus(String phone, OrderStatus status);

	/** Codes of orders stuck in a status since before {@code cutoff}; used by the stale-PENDING sweep. */
	@Query("SELECT o.code FROM Order o WHERE o.status = :status AND o.createdAt < :cutoff")
	List<String> findCodesByStatusAndCreatedAtBefore(@Param("status") OrderStatus status,
			@Param("cutoff") java.time.Instant cutoff);

	@EntityGraph(attributePaths = "items")
	Optional<Order> findByIdempotencyKey(String idempotencyKey);

	/** The order with its lines in one query (the shop's Telegram alerts list them). */
	@EntityGraph(attributePaths = "items")
	Optional<Order> findWithItemsById(UUID id);

	@EntityGraph(attributePaths = "items")
	Optional<Order> findByCode(String code);

	/** Row lock so a cancel cannot race another status change of the same order. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	Optional<Order> findWithLockByCodeAndUserId(String code, UUID userId);

	/** Row lock: two staff clicking "ship" at once are serialized, the second sees the new status. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	Optional<Order> findWithLockByCode(String code);

	boolean existsByCode(String code);

	/**
	 * Deletes the order row: its lines, status history, notes and tracking links go with it (ON DELETE CASCADE); its
	 * stock movements stay, with order_id NULL (ON DELETE SET NULL).
	 */
	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query(value = "DELETE FROM orders WHERE id = :id", nativeQuery = true)
	int deleteRowById(@Param("id") UUID id);

	Page<Order> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);

	/** Guest orders placed with this email (case-insensitive), locked: attached once the email is verified. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("SELECT o FROM Order o WHERE o.userId IS NULL AND lower(o.email) = lower(:email)")
	List<Order> findGuestOrdersByEmailForUpdate(@Param("email") String email);
}
