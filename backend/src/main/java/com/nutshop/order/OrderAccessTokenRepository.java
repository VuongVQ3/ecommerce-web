package com.nutshop.order;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface OrderAccessTokenRepository extends JpaRepository<OrderAccessToken, UUID> {

	List<OrderAccessToken> findByOrderId(UUID orderId);

	@Modifying(flushAutomatically = true)
	@Query("DELETE FROM OrderAccessToken t WHERE t.orderId = :orderId")
	int deleteByOrderId(@Param("orderId") UUID orderId);

	@Modifying(flushAutomatically = true)
	@Query("DELETE FROM OrderAccessToken t WHERE t.orderId = :orderId AND t.expiresAt <= :now")
	int deleteExpired(@Param("orderId") UUID orderId, @Param("now") Instant now);
}
