package com.nutshop.content;

import com.nutshop.IntegrationTest;
import com.nutshop.content.ContentReferenceService.Target;
import com.nutshop.content.ContentReferenceService.TargetType;
import com.nutshop.content.ContentReferenceService.Usage;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** content_references: a source replaces its references as a whole; targets see who uses them. */
@IntegrationTest
class ContentReferenceServiceTest {

	@Autowired
	ContentReferenceService references;

	@Autowired
	JdbcTemplate jdbc;

	private String prefix;

	@BeforeEach
	void setUp() {
		prefix = "ref-" + UUID.randomUUID().toString().substring(0, 8) + "-";
	}

	@AfterEach
	void cleanUp() {
		jdbc.update("DELETE FROM content_references WHERE source_id LIKE ? OR target_id LIKE ?", prefix + "%", prefix + "%");
	}

	private Target asset(String id) {
		return new Target(TargetType.ASSET, prefix + id);
	}

	@Test
	void replaceDropsEarlierReferencesOfThatSourceOnly() {
		references.replace(ContentType.PAGE, prefix + "home", Set.of(asset("a"), asset("b"), new Target(TargetType.PRODUCT, prefix + "7")));
		references.replace(ContentType.FRAGMENT, prefix + "faq", Set.of(asset("a")));

		references.replace(ContentType.PAGE, prefix + "home", Set.of(asset("b"), asset("c")));

		assertThat(references.usagesOf(TargetType.ASSET, prefix + "a")).extracting(Usage::sourceType, Usage::sourceId)
			.containsExactly(org.assertj.core.groups.Tuple.tuple(ContentType.FRAGMENT, prefix + "faq"));
		assertThat(references.isReferenced(TargetType.ASSET, prefix + "b")).isTrue();
		assertThat(references.isReferenced(TargetType.ASSET, prefix + "c")).isTrue();
		assertThat(references.isReferenced(TargetType.PRODUCT, prefix + "7")).isFalse();
	}

	@Test
	void anEmptySetRemovesEverything() {
		references.replace(ContentType.PAGE, prefix + "home", Set.of(asset("a")));
		references.replace(ContentType.PAGE, prefix + "home", Set.of());
		assertThat(references.isReferenced(TargetType.ASSET, prefix + "a")).isFalse();
		assertThat(references.usagesOf(TargetType.ASSET, prefix + "a")).isEmpty();
	}

	@Test
	void theSameIdOfAnotherTypeIsAnotherTarget() {
		references.replace(ContentType.PAGE, prefix + "home", Set.of(new Target(TargetType.FRAGMENT, prefix + "x")));
		assertThat(references.isReferenced(TargetType.FRAGMENT, prefix + "x")).isTrue();
		assertThat(references.isReferenced(TargetType.ASSET, prefix + "x")).isFalse();
	}

	@Test
	void onlyFragmentsAndPagesAreSources() {
		assertThatThrownBy(() -> references.replace(ContentType.ASSET, prefix + "a", Set.of()))
			.isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> new Target(TargetType.ASSET, "")).isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> new Target(TargetType.ASSET, "x".repeat(65))).isInstanceOf(IllegalArgumentException.class);
	}
}
