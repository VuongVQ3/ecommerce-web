package com.nutshop.cart;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface CartRepository extends JpaRepository<Cart, UUID> {

	@Query("SELECT c.id FROM Cart c WHERE c.userId = :userId")
	Optional<UUID> findIdByUserId(@Param("userId") UUID userId);

	/** Safe under concurrency: two first-time adds for the same user end up with one cart. */
	@Modifying(flushAutomatically = true)
	@Query(value = "INSERT INTO carts (user_id) VALUES (:userId) ON CONFLICT (user_id) DO NOTHING", nativeQuery = true)
	void createIfAbsent(@Param("userId") UUID userId);

	@Modifying
	@Query(value = "UPDATE carts SET updated_at = now() WHERE id = :cartId", nativeQuery = true)
	void touch(@Param("cartId") UUID cartId);

	/**
	 * Records a guest-cart merge. Returns 0 when this key was already merged into this cart (a retry), so the caller
	 * must not add the items again. Concurrent identical merges serialize on the unique index.
	 */
	@Modifying
	@Query(value = "INSERT INTO cart_merges (cart_id, merge_key) VALUES (:cartId, :mergeKey) ON CONFLICT (cart_id, merge_key) DO NOTHING",
			nativeQuery = true)
	int recordMerge(@Param("cartId") UUID cartId, @Param("mergeKey") String mergeKey);
}
