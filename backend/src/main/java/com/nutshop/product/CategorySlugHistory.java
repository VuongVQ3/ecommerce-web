package com.nutshop.product;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * Slugs a category used before (category_slug_history), so old links such as /danh-muc/hat-mix-granola redirect to
 * the category's current address. Same rules as {@link ProductSlugHistory}.
 */
@Component
public class CategorySlugHistory {

	private final JdbcTemplate jdbc;

	public CategorySlugHistory(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	/** The current slug of the category that used to have {@code slug}, when it is a different one. */
	public Optional<String> currentSlugFor(String slug) {
		return jdbc.queryForList("""
				SELECT c.slug FROM category_slug_history h JOIN categories c ON c.id = h.category_id
				WHERE h.old_slug = ? AND c.slug <> h.old_slug""", String.class, slug).stream().findFirst();
	}

	/** Called in the transaction that changes the slug. */
	void changed(long categoryId, String oldSlug, String newSlug) {
		if (oldSlug.equals(newSlug)) {
			return;
		}
		jdbc.update("DELETE FROM category_slug_history WHERE category_id = ? AND old_slug = ?", categoryId, newSlug);
		jdbc.update("""
				INSERT INTO category_slug_history (category_id, old_slug) VALUES (?, ?)
				ON CONFLICT (old_slug) DO UPDATE SET category_id = EXCLUDED.category_id, created_at = now()""", categoryId,
				oldSlug);
	}
}
