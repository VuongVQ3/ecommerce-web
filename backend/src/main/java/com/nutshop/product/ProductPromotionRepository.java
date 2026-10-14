package com.nutshop.product;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface ProductPromotionRepository extends JpaRepository<ProductPromotion, UUID> {

	/** The promotion in effect at {@code at} for each product (at most one: overlaps are excluded by the database). */
	@Query("""
			SELECT p FROM ProductPromotion p
			WHERE p.productId IN :productIds AND p.active = true AND p.startsAt <= :at AND p.endsAt > :at""")
	List<ProductPromotion> findRunning(@Param("productIds") Collection<Long> productIds, @Param("at") Instant at);

	/** Active promotions of a product touching [from, to). */
	@Query("""
			SELECT p FROM ProductPromotion p
			WHERE p.productId = :productId AND p.active = true AND p.startsAt < :to AND p.endsAt > :from
			ORDER BY p.startsAt""")
	List<ProductPromotion> findActiveBetween(@Param("productId") Long productId, @Param("from") Instant from,
			@Param("to") Instant to);

	/** Running or upcoming (not ended) active promotions of a product. */
	@Query("SELECT p FROM ProductPromotion p WHERE p.productId = :productId AND p.active = true AND p.endsAt > :now")
	List<ProductPromotion> findCurrentOrUpcoming(@Param("productId") Long productId, @Param("now") Instant now);

	List<ProductPromotion> findAllByOrderByStartsAtDesc();
}
