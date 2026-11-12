package com.nutshop.content.fragment;

import com.nutshop.content.ContentReferenceService.Target;
import com.nutshop.content.ContentReferenceService.TargetType;
import com.nutshop.content.fragment.FragmentValidator.Mode;
import com.nutshop.content.fragment.FragmentValidator.Result;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** Every field type against good and bad values, without a database (references come from a fake lookup). */
class FragmentValidatorTest {

	private static final JsonMapper JSON = JsonMapper.builder().build();
	private static final UUID IMAGE = UUID.fromString("00000000-0000-0000-0000-00000000000a");
	private static final UUID PDF = UUID.fromString("00000000-0000-0000-0000-00000000000b");
	private static final UUID FAQ = UUID.fromString("00000000-0000-0000-0000-0000000000f1");
	private static final UUID BANNER = UUID.fromString("00000000-0000-0000-0000-0000000000f2");

	private static final FragmentValidator.Lookup LOOKUP = new FragmentValidator.Lookup() {
		@Override
		public Optional<String> assetKind(UUID id) {
			return id.equals(IMAGE) ? Optional.of("IMAGE") : id.equals(PDF) ? Optional.of("PDF") : Optional.empty();
		}

		@Override
		public Optional<String> fragmentModel(UUID id) {
			return id.equals(FAQ) ? Optional.of("faq") : id.equals(BANNER) ? Optional.of("promo-banner") : Optional.empty();
		}

		@Override
		public boolean productExists(long id) {
			return id == 7;
		}
	};

	private static FieldDef field(String type, String rules) {
		return field("value", type, false, false, rules);
	}

	private static FieldDef field(String name, String type, boolean required, boolean multiple, String rules) {
		return new FieldDef(name, "Nhãn", type, required, multiple, null, JSON.readTree(rules));
	}

	/** Validates {"value": <json>} against one field. */
	private static Result check(FieldDef field, String valueJson) {
		return FragmentValidator.validate(List.of(field), JSON.readTree("{\"" + field.name() + "\":" + valueJson + "}"),
				Mode.DRAFT, LOOKUP, null);
	}

	private static String error(FieldDef field, String valueJson) {
		return check(field, valueJson).errors().get("data." + field.name());
	}

	private static JsonNode stored(FieldDef field, String valueJson) {
		Result result = check(field, valueJson);
		assertThat(result.errors()).isEmpty();
		return result.data().get(field.name());
	}

	@Test
	void textTypesCheckTheirLength() {
		FieldDef text = field("text", "{\"maxLength\": 5}");
		assertThat(stored(text, "\"  ngắn \"").asString()).isEqualTo("ngắn");
		assertThat(error(text, "\"quá dài\"")).isEqualTo("Tối đa 5 ký tự");
		assertThat(error(text, "12")).isEqualTo("Cần nhập chữ");
		// Without a rule: the type's ceiling
		assertThat(error(field("text", "{}"), "\"" + "x".repeat(501) + "\"")).isEqualTo("Tối đa 500 ký tự");
		// Textarea and markdown keep spaces and line breaks as typed
		assertThat(stored(field("textarea", "{}"), "\" a\\nb \"").asString()).isEqualTo(" a\nb ");
		assertThat(stored(field("markdown", "{}"), "\"# Tiêu đề\"").asString()).isEqualTo("# Tiêu đề");
	}

	@Test
	void numbersBooleansAndEnums() {
		FieldDef number = field("number", "{\"min\": 0, \"max\": 10}");
		assertThat(stored(number, "3.5").asDouble()).isEqualTo(3.5);
		assertThat(error(number, "-1")).isEqualTo("Nhỏ nhất là 0");
		assertThat(error(number, "11")).isEqualTo("Lớn nhất là 10");
		assertThat(error(number, "\"3\"")).isEqualTo("Cần nhập số");
		assertThat(stored(field("boolean", "{}"), "false").asBoolean()).isFalse();
		assertThat(error(field("boolean", "{}"), "\"có\"")).isEqualTo("Cần chọn có hoặc không");
		FieldDef choice = field("enum", "{\"options\": [\"Nhỏ\", \"Lớn\"]}");
		assertThat(stored(choice, "\"Lớn\"").asString()).isEqualTo("Lớn");
		assertThat(error(choice, "\"Vừa\"")).isEqualTo("Chọn một trong: Nhỏ, Lớn");
	}

	@Test
	void datesAndDatetimes() {
		assertThat(stored(field("date", "{}"), "\"2026-11-12\"").asString()).isEqualTo("2026-11-12");
		assertThat(error(field("date", "{}"), "\"12/11/2026\"")).isEqualTo("Ngày không hợp lệ (yyyy-mm-dd)");
		FieldDef datetime = field("datetime", "{}");
		assertThat(stored(datetime, "\"2026-11-12T10:00:00+07:00\"").asString()).isEqualTo("2026-11-12T03:00:00Z");
		// From a datetime input without a zone: Vietnam time
		assertThat(stored(datetime, "\"2026-11-12T10:00\"").asString()).isEqualTo("2026-11-12T03:00:00Z");
		assertThat(error(datetime, "\"ngày mai\"")).isEqualTo("Thời điểm không hợp lệ");
	}

	@Test
	void links() {
		FieldDef link = field("link", "{}");
		assertThat(stored(link, "\" /san-pham/mac-ca \"").asString()).isEqualTo("/san-pham/mac-ca");
		assertThat(stored(link, "\"https://zalo.me/0912345678\"").asString()).startsWith("https://");
		assertThat(stored(link, "\"tel:0912345678\"").asString()).startsWith("tel:");
		assertThat(error(link, "\"//evil.example\"")).startsWith("Đường dẫn bắt đầu bằng /");
		assertThat(error(link, "\"javascript:alert(1)\"")).startsWith("Đường dẫn bắt đầu bằng /");
	}

	@Test
	void assetsMustExistAndBeOfAnAllowedKind() {
		FieldDef image = field("asset", "{\"allowedKinds\": [\"IMAGE\"]}");
		assertThat(stored(image, "\"" + IMAGE + "\"").asString()).isEqualTo(IMAGE.toString());
		assertThat(error(image, "\"" + PDF + "\"")).isEqualTo("Cần chọn ảnh");
		assertThat(error(field("asset", "{\"allowedKinds\": [\"PDF\"]}"), "\"" + IMAGE + "\"")).isEqualTo("Cần chọn file PDF");
		assertThat(error(image, "\"" + UUID.randomUUID() + "\"")).isEqualTo("Asset không còn trong kho");
		assertThat(error(image, "\"khong-phai-uuid\"")).isEqualTo("Asset không hợp lệ");
		assertThat(check(image, "\"" + IMAGE + "\"").references()).containsExactly(new Target(TargetType.ASSET, IMAGE.toString()));
	}

	@Test
	void fragmentsMustExistBeOfAnAllowedModelAndNotBeItself() {
		FieldDef faq = field("fragment", "{\"allowedModels\": [\"faq\"]}");
		assertThat(stored(faq, "\"" + FAQ + "\"").asString()).isEqualTo(FAQ.toString());
		assertThat(error(faq, "\"" + BANNER + "\"")).isEqualTo("Cần fragment thuộc model: faq");
		assertThat(error(faq, "\"" + UUID.randomUUID() + "\"")).isEqualTo("Fragment không còn tồn tại");
		Result self = FragmentValidator.validate(List.of(faq), JSON.readTree("{\"value\":\"" + FAQ + "\"}"), Mode.DRAFT,
				LOOKUP, FAQ);
		assertThat(self.errors()).containsEntry("data.value", "Fragment không thể trỏ tới chính nó");
	}

	@Test
	void productsMustExist() {
		FieldDef product = field("product", "{}");
		assertThat(stored(product, "7").asLong()).isEqualTo(7);
		assertThat(error(product, "8")).isEqualTo("Sản phẩm không còn tồn tại");
		assertThat(error(product, "\"7\"")).isEqualTo("Sản phẩm không hợp lệ");
		assertThat(check(product, "7").references()).containsExactly(new Target(TargetType.PRODUCT, "7"));
	}

	@Test
	void listsAndMultipleValues() {
		FieldDef list = field("list", "{\"itemType\": \"number\", \"maxItems\": 3}");
		assertThat(stored(list, "[1, 2, null]").size()).isEqualTo(2);
		assertThat(error(list, "[1, \"hai\"]")).isEqualTo("Mục 2: Cần nhập số");
		assertThat(error(list, "[1, 2, 3, 4]")).isEqualTo("Tối đa 3 mục");
		assertThat(error(list, "5")).isEqualTo("Cần một danh sách");
		FieldDef gallery = field("gallery", "asset", false, true, "{\"allowedKinds\": [\"IMAGE\"]}");
		assertThat(check(gallery, "[\"" + IMAGE + "\"]").references()).hasSize(1);
		assertThat(error(gallery, "[\"" + IMAGE + "\", \"" + PDF + "\"]")).isEqualTo("Mục 2: Cần chọn ảnh");
	}

	@Test
	void requiredOnlyWhenPublishingAndEmptyValuesAreDropped() {
		List<FieldDef> fields = List.of(field("question", "text", true, false, "{}"), field("tags", "list", true, false,
				"{\"itemType\": \"text\"}"));
		JsonNode empty = JSON.readTree("{\"question\": \"  \", \"tags\": [], \"unknown\": 1}");

		Result draft = FragmentValidator.validate(fields, empty, Mode.DRAFT, LOOKUP, null);
		assertThat(draft.errors()).isEmpty();
		assertThat(draft.data().size()).isZero();

		Result publish = FragmentValidator.validate(fields, empty, Mode.PUBLISH, LOOKUP, null);
		assertThat(publish.errors()).isEqualTo(Map.of("data.question", "Bắt buộc", "data.tags", "Bắt buộc"));
	}

	@Test
	void referencesInStoredDataAreFoundForEveryReferenceField() {
		List<FieldDef> fields = List.of(field("image", "asset", false, false, "{}"), field("faqs", "fragment", false, true, "{}"),
				field("product", "product", false, false, "{}"), field("title", "text", false, false, "{}"));
		JsonNode data = JSON.readTree("{\"image\":\"" + IMAGE + "\",\"faqs\":[\"" + FAQ + "\"],\"product\":7,\"title\":\"x\"}");
		assertThat(FragmentValidator.references(fields, data)).containsExactlyInAnyOrder(
				new Target(TargetType.ASSET, IMAGE.toString()), new Target(TargetType.FRAGMENT, FAQ.toString()),
				new Target(TargetType.PRODUCT, "7"));
	}
}
