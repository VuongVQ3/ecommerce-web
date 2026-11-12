package com.nutshop.content;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/**
 * Which content uses which (table content_references). A source (a content fragment or a page) declares everything
 * it points to each time it is saved; targets (assets, other fragments or pages, products) can then show where they
 * are used, and refuse to be deleted while in use.
 */
@Service
public class ContentReferenceService {

	/** What can be pointed at. Products are not CMS content, hence not a {@link ContentType}. */
	public enum TargetType {
		ASSET, FRAGMENT, PAGE, PRODUCT
	}

	public record Target(TargetType type, String id) {

		public Target {
			Objects.requireNonNull(type, "type");
			checkId(id);
		}
	}

	/** One place that uses a target. */
	public record Usage(ContentType sourceType, String sourceId, Instant since) {
	}

	private static final int MAX_ID_LENGTH = 64;

	private final JdbcTemplate jdbc;

	public ContentReferenceService(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	/** Everything {@code source} points to from now on: its earlier references are dropped first. */
	@Transactional
	public void replace(ContentType sourceType, String sourceId, Set<Target> targets) {
		if (sourceType != ContentType.FRAGMENT && sourceType != ContentType.PAGE) {
			throw new IllegalArgumentException("Only fragments and pages reference other content: " + sourceType);
		}
		checkId(sourceId);
		jdbc.update("DELETE FROM content_references WHERE source_type = ? AND source_id = ?", sourceType.name(), sourceId);
		for (Target target : targets) {
			jdbc.update("""
					INSERT INTO content_references (source_type, source_id, target_type, target_id) VALUES (?, ?, ?, ?)
					ON CONFLICT DO NOTHING""", sourceType.name(), sourceId, target.type().name(), target.id());
		}
	}

	/** Who uses the target, oldest reference first. */
	@Transactional(readOnly = true)
	public List<Usage> usagesOf(TargetType targetType, String targetId) {
		return jdbc.query("""
				SELECT source_type, source_id, created_at FROM content_references
				WHERE target_type = ? AND target_id = ? ORDER BY created_at, source_type, source_id""",
				(rs, n) -> new Usage(ContentType.valueOf(rs.getString("source_type")), rs.getString("source_id"),
						rs.getTimestamp("created_at").toInstant()),
				targetType.name(), targetId);
	}

	@Transactional(readOnly = true)
	public boolean isReferenced(TargetType targetType, String targetId) {
		return Boolean.TRUE.equals(jdbc.queryForObject(
				"SELECT EXISTS (SELECT 1 FROM content_references WHERE target_type = ? AND target_id = ?)", Boolean.class,
				targetType.name(), targetId));
	}

	private static void checkId(String id) {
		if (id == null || id.isBlank() || id.length() > MAX_ID_LENGTH) {
			throw new IllegalArgumentException("id must be 1-" + MAX_ID_LENGTH + " characters");
		}
	}
}
