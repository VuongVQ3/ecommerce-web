package com.nutshop.product;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface CategoryRepository extends JpaRepository<Category, Long> {

	Optional<Category> findBySlug(String slug);

	/** What the storefront shows: categories with at least one product on sale. */
	@Query("SELECT c FROM Category c WHERE EXISTS (SELECT p.id FROM Product p WHERE p.category = c AND p.active = true)"
			+ " ORDER BY c.id")
	List<Category> findWithProductsOnSale();
}
