package com.nutshop.content.fragment;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** The field list of a model, and which changes would break fragments already written with it. */
class ModelFieldsTest {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private static FieldDef f(String name, String type, boolean multiple, String rules) {
		return new FieldDef(name, "Nhãn " + name, type, false, multiple, null, JSON.readTree(rules));
	}

	@Test
	void namesAreUniqueCamelCase() {
		var errors = ModelFields.check(List.of(f("headline", "text", false, "{}"), f("Headline", "text", false, "{}"),
				f("headline", "text", false, "{}"), f("cta-label", "text", false, "{}")), slug -> true);
		assertThat(errors).containsOnlyKeys("fields[1].name", "fields[2].name", "fields[3].name");
		assertThat(errors.get("fields[2].name")).isEqualTo("Trùng tên field “headline”");
	}

	@Test
	void typesAndRulesAreChecked() {
		var errors = ModelFields.check(List.of(f("a", "color", false, "{}"), f("b", "enum", false, "{}"),
				f("c", "list", false, "{\"itemType\": \"asset\"}"), f("d", "boolean", true, "{}"),
				f("e", "asset", false, "{\"allowedKinds\": [\"VIDEO\"]}"), f("g", "fragment", false, "{\"allowedModels\": [\"khong-co\"]}"),
				f("h", "number", false, "{\"min\": 5, \"max\": 1}"), f("i", "text", false, "{\"maxLength\": 9999}")),
				slug -> slug.equals("faq"));
		assertThat(errors).containsOnlyKeys("fields[0].type", "fields[1].rules.options", "fields[2].rules.itemType",
				"fields[3].multiple", "fields[4].rules.allowedKinds", "fields[5].rules.allowedModels", "fields[6].rules.max",
				"fields[7].rules.maxLength");
		assertThat(ModelFields.check(List.of(f("faqs", "fragment", true, "{\"allowedModels\": [\"faq\"]}"),
				f("tags", "list", false, "{\"itemType\": \"text\", \"maxItems\": 10}")), slug -> slug.equals("faq"))).isEmpty();
	}

	@Test
	void removingOrRetypingIsBreakingAddingAndRelabellingIsNot() {
		List<FieldDef> before = List.of(f("headline", "text", false, "{}"), f("image", "asset", false, "{}"),
				f("tags", "list", false, "{\"itemType\": \"text\"}"), f("order", "number", false, "{}"));
		List<FieldDef> after = List.of(new FieldDef("headline", "Tiêu đề mới", "text", true, false, "Gợi ý", JSON.readTree("{\"maxLength\": 10}")),
				f("image", "asset", true, "{}"), f("tags", "list", false, "{\"itemType\": \"number\"}"), f("extra", "text", false, "{}"));
		assertThat(ModelFields.breakingChanges(before, after)).containsExactly("image", "tags", "order");
		assertThat(ModelFields.breakingChanges(before, before)).isEmpty();
	}
}
