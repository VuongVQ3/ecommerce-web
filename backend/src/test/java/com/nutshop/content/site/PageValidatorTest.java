package com.nutshop.content.site;

import com.nutshop.content.ContentReferenceService.Target;
import com.nutshop.content.ContentReferenceService.TargetType;
import com.nutshop.content.fragment.FragmentValidator.Mode;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** Page content against the real registry (shared/cms-components.json), without a database. */
class PageValidatorTest {

	private static final JsonMapper JSON = JsonMapper.builder().build();
	private static final ComponentRegistry REGISTRY = new ComponentRegistry(JSON);
	private static final UUID IMAGE = UUID.fromString("00000000-0000-0000-0000-00000000000a");
	private static final UUID PDF = UUID.fromString("00000000-0000-0000-0000-00000000000b");
	private static final UUID FAQ = UUID.fromString("00000000-0000-0000-0000-0000000000f1");

	private static final PageValidator.Lookup LOOKUP = new PageValidator.Lookup() {
		@Override
		public Optional<String> assetKind(UUID id) {
			return id.equals(IMAGE) ? Optional.of("IMAGE") : id.equals(PDF) ? Optional.of("PDF") : Optional.empty();
		}

		@Override
		public Optional<String> fragmentModel(UUID id) {
			return id.equals(FAQ) ? Optional.of("faq") : Optional.empty();
		}

		@Override
		public boolean productExists(long id) {
			return id < 100;
		}

		@Override
		public boolean categoryExists(String slug) {
			return slug.equals("hat-dinh-duong");
		}

		@Override
		public boolean modelExists(String slug) {
			return slug.equals("faq");
		}
	};

	private static PageValidator.Result check(String template, String blocks, Mode mode) {
		return PageValidator.validate(REGISTRY, template, JSON.readTree("{\"regions\":{\"main\":" + blocks + "}}"),
				JSON.readTree("{}"), mode, LOOKUP);
	}

	@Test
	void theRegistryIsTheSharedFile() {
		assertThat(REGISTRY.components()).containsKeys("hero", "rich-text", "image", "image-text", "product-grid",
				"product-carousel", "fragment", "fragment-list", "faq", "cta", "marquee", "pdf-download", "spacer", "container");
		assertThat(REGISTRY.allows("landing", "marquee")).isTrue();
		assertThat(REGISTRY.allows("content", "marquee")).isFalse();
		assertThat(REGISTRY.allows("content", "pdf-download")).isTrue();
		assertThat(REGISTRY.regions()).containsExactly("main");
	}

	@Test
	void propsAreCheckedAndNormalizedLikeFragmentFields() {
		var result = check("landing", """
				[{"id": "h1", "type": "hero", "props": {"headline": "  Tết sum vầy ", "image": "%s", "align": "center", "extra": 1}},
				 {"id": "p1", "type": "pdf-download", "props": {"asset": "%s"}}]""".formatted(IMAGE, PDF), Mode.DRAFT);
		assertThat(result.errors()).isEmpty();
		JsonNode hero = result.content().path("regions").path("main").get(0);
		assertThat(hero.path("props").path("headline").asString()).isEqualTo("Tết sum vầy");
		assertThat(hero.path("props").has("extra")).isFalse();
		assertThat(result.references()).containsExactly(new Target(TargetType.ASSET, IMAGE.toString()),
				new Target(TargetType.ASSET, PDF.toString()));

		var wrong = check("landing", """
				[{"id": "h1", "type": "hero", "props": {"headline": 5, "image": "%s", "align": "giua"}},
				 {"id": "p1", "type": "pdf-download", "props": {"asset": "%s"}}]""".formatted(PDF, IMAGE), Mode.DRAFT);
		assertThat(wrong.errors()).containsEntry("blocks.h1.props.headline", "Cần nhập chữ")
			.containsEntry("blocks.h1.props.image", "Cần chọn ảnh")
			.containsKey("blocks.h1.props.align")
			.containsEntry("blocks.p1.props.asset", "Cần chọn file PDF");
	}

	@Test
	void requiredPropsOnlyWhenPublishingIncludingRequiredWhen() {
		String blocks = """
				[{"id": "g1", "type": "product-grid", "props": {"mode": "category"}},
				 {"id": "g2", "type": "product-grid", "props": {"mode": "manual"}},
				 {"id": "t1", "type": "rich-text", "props": {}}]""";
		assertThat(check("landing", blocks, Mode.DRAFT).errors()).isEmpty();
		assertThat(check("landing", blocks, Mode.PUBLISH).errors()).containsOnlyKeys("blocks.g1.props.categorySlug",
				"blocks.g2.props.productIds", "blocks.t1.props.markdown");
	}

	@Test
	void refsAreCheckedAgainstTheDatabase() {
		var result = check("landing", """
				[{"id": "g1", "type": "product-grid", "props": {"mode": "category", "categorySlug": "khong-co"}},
				 {"id": "l1", "type": "fragment-list", "props": {"model": "khong-co", "folder": "Sai Thu Muc"}},
				 {"id": "f1", "type": "faq", "props": {"fragmentIds": ["%s"], "folder": "/faq"}}]""".formatted(FAQ), Mode.DRAFT);
		assertThat(result.errors()).containsOnlyKeys("blocks.g1.props.categorySlug", "blocks.l1.props.model",
				"blocks.l1.props.folder");
	}

	@Test
	void templatesTypesIdsAndNestingAreEnforced() {
		var result = check("content", """
				[{"id": "m1", "type": "marquee", "props": {"items": ["a"]}},
				 {"id": "x1", "type": "carousel3d", "props": {}},
				 {"id": "t1", "type": "rich-text", "props": {"markdown": "a"}},
				 {"id": "t1", "type": "rich-text", "props": {"markdown": "b"}}]""", Mode.DRAFT);
		assertThat(result.errors()).containsKey("blocks.m1.type").containsKey("blocks.x1.type").containsKey("content");
		assertThat(result.content().path("regions").path("main")).hasSize(1);

		var nested = check("landing", """
				[{"id": "c1", "type": "container", "props": {"columns": "2"}, "children": [
				   {"id": "c2", "type": "container", "props": {"columns": "1"}},
				   {"id": "t2", "type": "rich-text", "props": {"markdown": "trong cột"}}]}]""", Mode.DRAFT);
		assertThat(nested.errors()).containsOnlyKeys("blocks.c2.type");
		assertThat(nested.content().path("regions").path("main").get(0).path("children")).hasSize(1);
		// Children only on a container
		var stray = check("landing", """
				[{"id": "t1", "type": "rich-text", "props": {"markdown": "a"}, "children": [{"id": "t2", "type": "spacer"}]}]""",
				Mode.DRAFT);
		assertThat(stray.content().path("regions").path("main").get(0).has("children")).isFalse();
	}

	@Test
	void pagePropertiesAreValidatedToo() {
		var result = PageValidator.validate(REGISTRY, "content", JSON.readTree("{\"regions\":{\"main\":[]}}"),
				JSON.readTree("{\"seoTitle\": \"" + "x".repeat(71) + "\", \"ogImage\": \"" + PDF + "\", \"noindex\": true}"),
				Mode.DRAFT, LOOKUP);
		assertThat(result.errors()).containsOnlyKeys("properties.seoTitle", "properties.ogImage");
		assertThat(PageValidator.validate(REGISTRY, "content", JSON.readTree("[]"), null, Mode.DRAFT, LOOKUP).errors())
			.containsKey("content");
	}
}
