package com.nutshop.product;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ProductRepository extends JpaRepository<Product, Long>, JpaSpecificationExecutor<Product> {

	@Override
	@EntityGraph(attributePaths = "category")
	Page<Product> findAll(Specification<Product> spec, Pageable pageable);

	@EntityGraph(attributePaths = "category")
	Optional<Product> findBySlug(String slug);

	/** One query for a whole cart (avoids N+1 when enriching cart lines). */
	@EntityGraph(attributePaths = "category")
	List<Product> findByIdIn(Collection<Long> ids);
}
