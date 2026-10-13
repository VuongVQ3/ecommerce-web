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
}
