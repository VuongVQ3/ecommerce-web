package com.nutshop.content;

import com.nutshop.common.SecureTokens;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Secret links for previewing a draft (asset, content fragment or page) without signing in, valid for
 * {@code cms.preview.ttl} (24 hours by default). The raw token is only handed out once; the database keeps its
 * SHA-256 hash, like the other opaque tokens ({@link SecureTokens}).
 */
@Service
public class PreviewTokenService {

	private static final Logger log = LoggerFactory.getLogger(PreviewTokenService.class);

	/** What {@link SecureTokens#generate()} produces: 43 base64url characters. */
	private static final Pattern TOKEN_FORMAT = Pattern.compile("[A-Za-z0-9_-]{43}");

	/** Fits content_preview_tokens.target_id. */
	static final int MAX_TARGET_ID_LENGTH = 64;

	public record IssuedPreviewToken(String rawToken, Instant expiresAt) {
	}

	public record PreviewTarget(ContentType type, String targetId) {
	}

	private final JdbcTemplate jdbc;
	private final Clock clock;
	private final Duration ttl;

	public PreviewTokenService(JdbcTemplate jdbc, Clock clock, @Value("${cms.preview.ttl:PT24H}") Duration ttl) {
		this.jdbc = jdbc;
		this.clock = clock;
		this.ttl = ttl;
	}

	/** A new preview link for one item; earlier links for it stay valid until they expire or are revoked. */
	@Transactional
	public IssuedPreviewToken issue(ContentType type, String targetId, UUID actorId) {
		Objects.requireNonNull(type, "type");
		if (targetId == null || targetId.isBlank() || targetId.length() > MAX_TARGET_ID_LENGTH) {
			throw new IllegalArgumentException("targetId must be 1-" + MAX_TARGET_ID_LENGTH + " characters");
		}
		String raw = SecureTokens.generate();
		Instant now = clock.instant();
		Instant expiresAt = now.plus(ttl);
		jdbc.update("""
				INSERT INTO content_preview_tokens (token_hash, target_type, target_id, expires_at, created_by, created_at)
				VALUES (?, ?, ?, ?, ?, ?)""", SecureTokens.hash(raw), type.name(), targetId, Timestamp.from(expiresAt),
				actorId, Timestamp.from(now));
		return new IssuedPreviewToken(raw, expiresAt);
	}

	/** The item a link points to; empty when the token is missing, malformed, unknown or expired. */
	@Transactional(readOnly = true)
	public Optional<PreviewTarget> resolve(String rawToken) {
		if (rawToken == null || !TOKEN_FORMAT.matcher(rawToken).matches()) {
			return Optional.empty();
		}
		return jdbc.query("""
				SELECT target_type, target_id FROM content_preview_tokens WHERE token_hash = ? AND expires_at > ?""",
				(rs, n) -> new PreviewTarget(ContentType.valueOf(rs.getString("target_type")), rs.getString("target_id")),
				SecureTokens.hash(rawToken), Timestamp.from(clock.instant()))
			.stream()
			.findFirst();
	}

	/** Every link to the item stops working (call when the item is deleted). Returns how many were removed. */
	@Transactional
	public int revokeAll(ContentType type, String targetId) {
		return jdbc.update("DELETE FROM content_preview_tokens WHERE target_type = ? AND target_id = ?", type.name(),
				targetId);
	}

	/** Expired links are useless; remove them once a day. */
	@Scheduled(cron = "${cms.preview.cleanup-cron:0 15 4 * * *}", zone = "Asia/Ho_Chi_Minh")
	@Transactional
	public int deleteExpired() {
		int deleted = jdbc.update("DELETE FROM content_preview_tokens WHERE expires_at <= ?",
				Timestamp.from(clock.instant()));
		if (deleted > 0) {
			log.info("Preview links: {} expired tokens deleted", deleted);
		}
		return deleted;
	}
}
