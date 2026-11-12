package com.nutshop.content;

import com.nutshop.IntegrationTest;
import com.nutshop.common.SecureTokens;
import com.nutshop.content.PreviewTokenService.IssuedPreviewToken;
import com.nutshop.content.PreviewTokenService.PreviewTarget;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Preview links against the real table. Each test builds its own service with a fixed clock, so "a day later" is a
 * second service whose clock is moved forward. Target ids are random, so tests never see each other's rows.
 */
@IntegrationTest
class PreviewTokenServiceTest {

	private static final Instant NOW = Instant.parse("2026-11-12T03:00:00Z");
	private static final Duration TTL = Duration.ofHours(24);

	@Autowired
	JdbcTemplate jdbc;

	@Autowired
	PreviewTokenService bean;

	private PreviewTokenService service;
	private String target;
	private UUID author;

	@BeforeEach
	void setUp() {
		service = at(NOW);
		target = "page-" + UUID.randomUUID();
		author = jdbc.queryForObject("""
				INSERT INTO users (email, full_name, role, terms_accepted_at) VALUES (?, 'Tác Giả', 'STAFF', now())
				RETURNING id""", UUID.class, "preview-" + UUID.randomUUID() + "@example.com");
	}

	@AfterEach
	void cleanUp() {
		jdbc.update("DELETE FROM content_preview_tokens WHERE target_id LIKE ?", target + "%");
		jdbc.update("DELETE FROM users WHERE id = ?", author);
	}

	private PreviewTokenService at(Instant now) {
		return new PreviewTokenService(jdbc, Clock.fixed(now, ZoneOffset.UTC), TTL);
	}

	private int rows(String targetId) {
		return jdbc.queryForObject("SELECT COUNT(*) FROM content_preview_tokens WHERE target_id = ?", Integer.class,
				targetId);
	}

	@Test
	void theDefaultLifetimeIs24Hours() {
		IssuedPreviewToken issued = bean.issue(ContentType.PAGE, target, null);
		assertThat(Duration.between(Instant.now(), issued.expiresAt())).isBetween(TTL.minusMinutes(1), TTL);
	}

	@Test
	void onlyTheHashIsStored() {
		IssuedPreviewToken issued = service.issue(ContentType.PAGE, target, author);

		assertThat(issued.rawToken()).hasSize(43);
		assertThat(issued.expiresAt()).isEqualTo(NOW.plus(TTL));
		var row = jdbc.queryForMap("SELECT * FROM content_preview_tokens WHERE target_id = ?", target);
		assertThat(row.get("token_hash")).isEqualTo(SecureTokens.hash(issued.rawToken()));
		assertThat(row.get("created_by")).isEqualTo(author);
		assertThat(row.get("target_type")).isEqualTo("PAGE");
		// The raw token appears in no column at all
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM content_preview_tokens t WHERE t::text LIKE ?",
				Integer.class, "%" + issued.rawToken() + "%")).isZero();
	}

	@Test
	void theRightTokenResolvesToItsTarget() {
		IssuedPreviewToken page = service.issue(ContentType.PAGE, target, author);
		IssuedPreviewToken fragment = service.issue(ContentType.FRAGMENT, target + "-cf", null);

		assertThat(service.resolve(page.rawToken())).contains(new PreviewTarget(ContentType.PAGE, target));
		assertThat(service.resolve(fragment.rawToken())).contains(new PreviewTarget(ContentType.FRAGMENT, target + "-cf"));
	}

	@Test
	void wrongMissingOrMalformedTokensResolveToNothing() {
		IssuedPreviewToken issued = service.issue(ContentType.ASSET, target, author);

		assertThat(service.resolve(null)).isEmpty();
		assertThat(service.resolve("")).isEmpty();
		assertThat(service.resolve("   ")).isEmpty();
		assertThat(service.resolve("ngắn")).isEmpty();
		assertThat(service.resolve(issued.rawToken() + "x")).isEmpty();
		assertThat(service.resolve("' OR 1=1 --" + "a".repeat(32))).isEmpty();
		// Well-formed but never issued
		assertThat(service.resolve(SecureTokens.generate())).isEmpty();
		// The stored hash is not a token either
		assertThat(service.resolve(SecureTokens.hash(issued.rawToken()))).isEmpty();
	}

	@Test
	void anExpiredTokenResolvesToNothing() {
		IssuedPreviewToken issued = service.issue(ContentType.PAGE, target, author);

		assertThat(at(NOW.plus(TTL).minusSeconds(1)).resolve(issued.rawToken())).isPresent();
		assertThat(at(NOW.plus(TTL)).resolve(issued.rawToken())).isEmpty();
		assertThat(at(NOW.plus(Duration.ofDays(3))).resolve(issued.rawToken())).isEmpty();
	}

	@Test
	void revokeAllRemovesOnlyThatItemsTokens() {
		IssuedPreviewToken first = service.issue(ContentType.PAGE, target, author);
		IssuedPreviewToken second = service.issue(ContentType.PAGE, target, null);
		IssuedPreviewToken otherItem = service.issue(ContentType.PAGE, target + "-other", author);
		// Same id, other kind of content
		IssuedPreviewToken otherType = service.issue(ContentType.ASSET, target, author);

		assertThat(service.revokeAll(ContentType.PAGE, target)).isEqualTo(2);

		assertThat(service.resolve(first.rawToken())).isEmpty();
		assertThat(service.resolve(second.rawToken())).isEmpty();
		assertThat(service.resolve(otherItem.rawToken())).contains(new PreviewTarget(ContentType.PAGE, target + "-other"));
		assertThat(service.resolve(otherType.rawToken())).contains(new PreviewTarget(ContentType.ASSET, target));
	}

	@Test
	void theDailySweepDeletesOnlyExpiredTokens() {
		service.issue(ContentType.PAGE, target + "-old", author);
		IssuedPreviewToken fresh = at(NOW.plus(Duration.ofHours(20))).issue(ContentType.PAGE, target + "-new", author);

		int deleted = at(NOW.plus(TTL).plusSeconds(1)).deleteExpired();

		assertThat(deleted).isGreaterThanOrEqualTo(1);
		assertThat(rows(target + "-old")).isZero();
		assertThat(rows(target + "-new")).isEqualTo(1);
		assertThat(at(NOW.plus(TTL).plusSeconds(1)).resolve(fresh.rawToken())).isPresent();
	}

	@Test
	void deletingTheAuthorKeepsTheLink() {
		IssuedPreviewToken issued = service.issue(ContentType.PAGE, target, author);
		jdbc.update("DELETE FROM users WHERE id = ?", author);

		assertThat(service.resolve(issued.rawToken())).isPresent();
		assertThat(jdbc.queryForList("SELECT created_by FROM content_preview_tokens WHERE target_id = ?", UUID.class,
				target)).containsExactly((UUID) null);
	}

	@Test
	void targetIdsMustFitTheColumn() {
		assertThatThrownBy(() -> service.issue(ContentType.PAGE, "", author)).isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> service.issue(ContentType.PAGE, "x".repeat(65), author))
			.isInstanceOf(IllegalArgumentException.class);
	}
}
