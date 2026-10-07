package com.nutshop.cart;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CartItemRepository extends JpaRepository<CartItem, UUID> {

	List<CartItem> findByCartIdOrderByCreatedAtAscProductIdAsc(UUID cartId);

	@Query("SELECT i.quantity FROM CartItem i WHERE i.cartId = :cartId AND i.productId = :productId")
	Optional<Integer> findQuantity(@Param("cartId") UUID cartId, @Param("productId") Long productId);

	/**
	 * Adds {@code quantity} to the line (creating it if needed) and caps the result at {@code cap}, atomically in the
	 * database: concurrent adds can neither create a second row nor lose an increment.
	 */
	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query(value = """
			INSERT INTO cart_items (cart_id, product_id, quantity, price_at_add)
			VALUES (:cartId, :productId, LEAST(:quantity, :cap), :price)
			ON CONFLICT (cart_id, product_id)
			DO UPDATE SET quantity = LEAST(cart_items.quantity + EXCLUDED.quantity, :cap), updated_at = now()
			""", nativeQuery = true)
	void addCapped(@Param("cartId") UUID cartId, @Param("productId") Long productId, @Param("quantity") int quantity,
			@Param("cap") int cap, @Param("price") long price);

	/** Sets the line to exactly {@code quantity} (already capped by the caller), creating it if needed. */
	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query(value = """
			INSERT INTO cart_items (cart_id, product_id, quantity, price_at_add)
			VALUES (:cartId, :productId, :quantity, :price)
			ON CONFLICT (cart_id, product_id)
			DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()
			""", nativeQuery = true)
	void setQuantity(@Param("cartId") UUID cartId, @Param("productId") Long productId,
			@Param("quantity") int quantity, @Param("price") long price);

	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query("DELETE FROM CartItem i WHERE i.cartId = :cartId AND i.productId = :productId")
	int deleteLine(@Param("cartId") UUID cartId, @Param("productId") Long productId);

	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query("DELETE FROM CartItem i WHERE i.cartId = :cartId")
	int deleteAllLines(@Param("cartId") UUID cartId);
}
