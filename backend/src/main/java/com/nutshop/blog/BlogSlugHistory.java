package com.nutshop.blog;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * Slugs a published post used before (blog_slug_history), so links to a renamed post redirect to its current
 * address. Works like ProductSlugHistory: an old slug belongs to one post; a post that takes one of its old slugs
 * back removes it. Slugs of a post that was never published were never public and are not kept.
 */
@Component
public class BlogSlugHistory {

	private final JdbcTemplate jdbc;

	public BlogSlugHistory(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	/** The post that used to have {@code slug}. */
	public Optional<Long> postFor(String slug) {
		return jdbc.queryForList("SELECT post_id FROM blog_slug_history WHERE old_slug = ?", Long.class, slug)
			.stream()
			.findFirst();
	}

	/** True when {@code slug} is an old slug of a post other than {@code selfId} (null = a new post). */
	boolean usedByOther(String slug, Long selfId) {
		return postFor(slug).filter(id -> !id.equals(selfId)).isPresent();
	}

	/** Called in the transaction that changes the slug of a post that has been published. */
	void changed(long postId, String oldSlug, String newSlug) {
		if (oldSlug.equals(newSlug)) {
			return;
		}
		jdbc.update("DELETE FROM blog_slug_history WHERE post_id = ? AND old_slug = ?", postId, newSlug);
		jdbc.update("""
				INSERT INTO blog_slug_history (post_id, old_slug) VALUES (?, ?)
				ON CONFLICT (old_slug) DO UPDATE SET post_id = EXCLUDED.post_id, created_at = now()""", postId, oldSlug);
	}
}
