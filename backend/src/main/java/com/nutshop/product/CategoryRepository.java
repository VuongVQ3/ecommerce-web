package com.nutshop.product;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface CategoryRepository extends JpaRepository<Category, Long> {

	Optional<Category> findBySlug(String slug);

	/**
	 * What the storefront shows: categories with at least one product on sale (shown and priced), each with that
	 * count, as [Category, Long].
	 */
	@Query("SELECT c, COUNT(p) FROM Category c JOIN Product p ON p.category = c WHERE p.active = true AND p.price > 0"
			+ " GROUP BY c ORDER BY c.id")
	List<Object[]> findWithProductsOnSale();

	/** Products on sale (shown and priced) in one category */
	@Query("SELECT COUNT(p) FROM Product p WHERE p.category.id = :categoryId AND p.active = true AND p.price > 0")
	long countOnSale(@org.springframework.data.repository.query.Param("categoryId") Long categoryId);
}
