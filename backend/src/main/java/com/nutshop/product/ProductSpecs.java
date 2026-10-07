package com.nutshop.product;

import org.springframework.data.jpa.domain.Specification;

import java.util.Locale;

/**
 * Optional product filters. Built in Java rather than as "(:param IS NULL OR ...)" JPQL, because
 * PostgreSQL cannot infer the type of a null bind parameter and fails with "text ~~ bytea".
 */
final class ProductSpecs {

	private ProductSpecs() {
	}

	static Specification<Product> active() {
		return (root, query, cb) -> cb.isTrue(root.get("active"));
	}

	static Specification<Product> inCategory(String slug) {
		return (root, query, cb) -> cb.equal(root.get("category").get("slug"), slug);
	}

	static Specification<Product> nameContains(String q) {
		String pattern = "%" + q.trim().toLowerCase(Locale.ROOT) + "%";
		return (root, query, cb) -> cb.like(cb.lower(root.get("name")), pattern);
	}
}
