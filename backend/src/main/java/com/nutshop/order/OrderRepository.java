package com.nutshop.order;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;

import java.util.Optional;
import java.util.UUID;

public interface OrderRepository extends JpaRepository<Order, UUID>, JpaSpecificationExecutor<Order> {

	long countByStatus(OrderStatus status);

	long countByCreatedAtGreaterThanEqual(java.time.Instant from);

	@EntityGraph(attributePaths = "items")
	Optional<Order> findByIdempotencyKey(String idempotencyKey);

	@EntityGraph(attributePaths = "items")
	Optional<Order> findByCode(String code);

	/** Row lock so a cancel cannot race another status change of the same order. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	Optional<Order> findWithLockByCodeAndUserId(String code, UUID userId);

	/** Row lock: two staff clicking "ship" at once are serialized, the second sees the new status. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	Optional<Order> findWithLockByCode(String code);

	boolean existsByCode(String code);

	Page<Order> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);
}
