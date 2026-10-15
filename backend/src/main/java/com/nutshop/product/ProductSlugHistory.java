package com.nutshop.product;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * Slugs a product used before (product_slug_history), so old links and shared URLs redirect to the current address.
 * An old slug belongs to one product only; a product that takes one of its own old slugs back removes it from here.
 */
@Component
public class ProductSlugHistory {

	private final JdbcTemplate jdbc;

	public ProductSlugHistory(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	/** The product that used to have {@code slug}. */
	public Optional<Long> productFor(String slug) {
		return jdbc.queryForList("SELECT product_id FROM product_slug_history WHERE old_slug = ?", Long.class, slug)
			.stream()
			.findFirst();
	}

	/** True when {@code slug} is an old slug of a product other than {@code selfId} (null = a new product). */
	public boolean usedByOther(String slug, Long selfId) {
		return productFor(slug).filter(id -> !id.equals(selfId)).isPresent();
	}

	/** Called in the transaction that changes the slug. */
	void changed(long productId, String oldSlug, String newSlug) {
		if (oldSlug.equals(newSlug)) {
			return;
		}
		jdbc.update("DELETE FROM product_slug_history WHERE product_id = ? AND old_slug = ?", productId, newSlug);
		jdbc.update("""
				INSERT INTO product_slug_history (product_id, old_slug) VALUES (?, ?)
				ON CONFLICT (old_slug) DO UPDATE SET product_id = EXCLUDED.product_id, created_at = now()""", productId,
				oldSlug);
	}
}
