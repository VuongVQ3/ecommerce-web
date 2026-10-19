package com.nutshop.product;

import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import org.springframework.data.jpa.domain.Specification;

import java.time.Instant;
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

	/**
	 * Orders by a nutrition figure, products without figures last (NULLS LAST), then by the storefront order. Adds no
	 * filter. Skipped for the count query of a page.
	 */
	static Specification<Product> orderByNutrient(String field, boolean ascending) {
		return (root, query, cb) -> {
			Class<?> result = query.getResultType();
			if (result == Long.class || result == long.class) {
				return null;
			}
			Expression<Integer> missing = cb.<Integer>selectCase().when(cb.isNull(root.get(field)), 1).otherwise(0);
			query.orderBy(cb.asc(missing), ascending ? cb.asc(root.get(field)) : cb.desc(root.get(field)),
					cb.asc(root.get("sortOrder")), cb.asc(root.get("id")));
			return null;
		};
	}

	/**
	 * Orders by the price buyers pay now: COALESCE(running sale price, regular price), then by id for a stable order.
	 * Adds no filter. Skipped for the count query of a page.
	 */
	static Specification<Product> orderByCurrentPrice(boolean ascending, Instant now) {
		return (root, query, cb) -> {
			Class<?> result = query.getResultType();
			if (result == Long.class || result == long.class) {
				return null;
			}
			Subquery<Long> sale = query.subquery(Long.class);
			Root<ProductPromotion> promo = sale.from(ProductPromotion.class);
			sale.select(promo.get("salePrice"))
				.where(cb.equal(promo.get("productId"), root.get("id")), cb.isTrue(promo.get("active")),
						cb.lessThanOrEqualTo(promo.get("startsAt"), now), cb.greaterThan(promo.get("endsAt"), now),
						cb.lessThan(promo.<Long>get("salePrice"), root.<Long>get("price")));
			Expression<Long> current = cb.coalesce(sale, root.<Long>get("price"));
			query.orderBy(ascending ? cb.asc(current) : cb.desc(current), cb.asc(root.get("id")));
			return null;
		};
	}
}
