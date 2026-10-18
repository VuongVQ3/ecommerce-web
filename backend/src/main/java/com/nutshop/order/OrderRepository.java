package com.nutshop.order;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface OrderRepository extends JpaRepository<Order, UUID>, JpaSpecificationExecutor<Order> {

	long countByStatus(OrderStatus status);

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

	/** Guest orders placed with this email (case-insensitive), locked: attached once the email is verified. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("SELECT o FROM Order o WHERE o.userId IS NULL AND lower(o.email) = lower(:email)")
	List<Order> findGuestOrdersByEmailForUpdate(@Param("email") String email);
}
