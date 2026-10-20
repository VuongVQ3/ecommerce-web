package com.nutshop.product;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ProductRepository extends JpaRepository<Product, Long>, JpaSpecificationExecutor<Product> {

	@Override
	@EntityGraph(attributePaths = "category")
	Page<Product> findAll(Specification<Product> spec, Pageable pageable);

	@EntityGraph(attributePaths = "category")
	Optional<Product> findBySlug(String slug);

	/** Row lock for back-office edits that must count something first (e.g. images per product). */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("SELECT p FROM Product p WHERE p.id = :id")
	Optional<Product> lockById(@Param("id") Long id);

	long countByCategoryId(Long categoryId);

	@Query("SELECT COALESCE(MAX(p.sortOrder), 0) FROM Product p")
	int maxSortOrder();

	/**
	 * Search-as-you-type: products on sale whose name, folded (no case, no accents, see TextFold), contains
	 * {@code contains}; names starting with the term first, then the shop's order.
	 */
	@Query("""
			SELECT p FROM Product p
			WHERE p.active = true AND p.price > 0
			  AND lower(function('translate', p.name, :accented, :plain)) LIKE :contains ESCAPE '\\'
			ORDER BY CASE WHEN lower(function('translate', p.name, :accented, :plain)) LIKE :prefix ESCAPE '\\'
			              THEN 0 ELSE 1 END,
			         p.sortOrder, p.id""")
	List<Product> suggest(@Param("accented") String accented, @Param("plain") String plain,
			@Param("contains") String contains, @Param("prefix") String prefix, Pageable page);

	/** One query for a whole cart (avoids N+1 when enriching cart lines). */
	@EntityGraph(attributePaths = "category")
	List<Product> findByIdIn(Collection<Long> ids);
}
