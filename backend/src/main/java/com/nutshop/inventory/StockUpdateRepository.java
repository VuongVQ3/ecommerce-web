package com.nutshop.inventory;

import com.nutshop.product.Product;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * Conditional single-statement stock updates. Each returns the number of rows changed: 0 means the condition
 * failed (e.g. not enough available stock) and nothing was modified.
 */
public interface StockUpdateRepository extends Repository<Product, Long> {

	/** Holds stock for an order: only if active and enough is available (on_hand - reserved). */
	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query(value = "UPDATE products SET reserved = reserved + :q WHERE id = :id AND active AND on_hand - reserved >= :q",
			nativeQuery = true)
	int reserve(@Param("id") long id, @Param("q") int quantity);

	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query(value = "UPDATE products SET reserved = reserved - :q WHERE id = :id AND reserved >= :q", nativeQuery = true)
	int release(@Param("id") long id, @Param("q") int quantity);

	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query(value = "UPDATE products SET on_hand = on_hand - :q, reserved = reserved - :q WHERE id = :id AND reserved >= :q AND on_hand >= :q",
			nativeQuery = true)
	int ship(@Param("id") long id, @Param("q") int quantity);

	/** Receives goods (IMPORT, delta > 0) or corrects a count (ADJUST); never below what orders hold. */
	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query(value = "UPDATE products SET on_hand = on_hand + :delta WHERE id = :id AND on_hand + :delta >= reserved",
			nativeQuery = true)
	int changeOnHand(@Param("id") long id, @Param("delta") int delta);

	/** Current on_hand and reserved, row-locked until the end of the transaction (for stocktakes). */
	@Query(value = "SELECT on_hand, reserved FROM products WHERE id = :id FOR UPDATE", nativeQuery = true)
	java.util.List<Object[]> lockStock(@Param("id") long id);
}
