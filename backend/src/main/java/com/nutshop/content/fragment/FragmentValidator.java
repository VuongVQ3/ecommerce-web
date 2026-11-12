package com.nutshop.content.fragment;

import com.nutshop.content.ContentReferenceService.Target;
import com.nutshop.content.ContentReferenceService.TargetType;
import com.nutshop.content.fragment.FieldDef.Type;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Checks a fragment's data against its model and normalizes it: unknown keys and empty values are dropped, text is
 * kept as typed, datetimes become UTC instants. Errors come back per field ("data.question") so the editor can show
 * them under the right input. Drafts may be incomplete ({@link Mode#DRAFT} skips "required"); publishing may not.
 */
public final class FragmentValidator {

	public enum Mode {
		DRAFT, PUBLISH
	}

	/** What the validator needs to know about referenced content. */
	public interface Lookup {

		/** "IMAGE" or "PDF"; empty when there is no such asset. */
		Optional<String> assetKind(UUID id);

		/** The model slug of a fragment; empty when there is no such fragment. */
		Optional<String> fragmentModel(UUID id);

		boolean productExists(long id);
	}

	/**
	 * @param data the normalized data to store
	 * @param errors by "data.fieldName"; empty when valid
	 * @param references everything the data points to (for content_references)
	 */
	public record Result(ObjectNode data, Map<String, String> errors, Set<Target> references) {

		public boolean valid() {
			return errors.isEmpty();
		}
	}

	/** Values from a datetime input without a zone are Vietnam time. */
	static final ZoneId SHOP_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
	private static final Pattern LINK = Pattern.compile("^(/(?!/)\\S*|https?://\\S+|mailto:\\S+|tel:[+0-9 .-]+|#\\S*)$");
	static final String REQUIRED = "Bắt buộc";

	private static final JsonNodeFactory NODES = JsonNodeFactory.instance;

	private FragmentValidator() {
	}

	/**
	 * @param self the fragment being validated (it may not point to itself); null for a new one
	 */
	public static Result validate(List<FieldDef> fields, JsonNode input, Mode mode, Lookup lookup, UUID self) {
		ObjectNode data = NODES.objectNode();
		Map<String, String> errors = new LinkedHashMap<>();
		Set<Target> references = new LinkedHashSet<>();
		JsonNode source = input != null && input.isObject() ? input : NODES.objectNode();
		for (FieldDef field : fields) {
			String key = "data." + field.name();
			JsonNode raw = source.get(field.name());
			if (isEmpty(raw)) {
				if (mode == Mode.PUBLISH && field.isRequired()) {
					errors.put(key, REQUIRED);
				}
				continue;
			}
			boolean many = field.isMultiple() || field.typeEnum() == Type.LIST;
			if (many) {
				if (!raw.isArray()) {
					errors.put(key, "Cần một danh sách");
					continue;
				}
				Integer maxItems = field.intRule("maxItems");
				ArrayNode values = NODES.arrayNode();
				for (int i = 0; i < raw.size(); i++) {
					JsonNode item = raw.get(i);
					if (isEmpty(item)) {
						continue;
					}
					String problem = check(field, item, lookup, self, values, references);
					if (problem != null) {
						errors.put(key, "Mục " + (i + 1) + ": " + problem);
						break;
					}
				}
				if (maxItems != null && values.size() > maxItems) {
					errors.putIfAbsent(key, "Tối đa " + maxItems + " mục");
				}
				if (values.isEmpty()) {
					if (mode == Mode.PUBLISH && field.isRequired()) {
						errors.putIfAbsent(key, REQUIRED);
					}
					continue;
				}
				data.set(field.name(), values);
			}
			else {
				ArrayNode one = NODES.arrayNode();
				String problem = check(field, raw, lookup, self, one, references);
				if (problem != null) {
					errors.put(key, problem);
				}
				else {
					data.set(field.name(), one.get(0));
				}
			}
		}
		return new Result(data, errors, references);
	}

	/** Every reference in already stored data (for content_references); values that no longer fit are skipped. */
	public static Set<Target> references(List<FieldDef> fields, JsonNode data) {
		Set<Target> references = new LinkedHashSet<>();
		if (data == null || !data.isObject()) {
			return references;
		}
		for (FieldDef field : fields) {
			Type type = field.typeEnum();
			if (type != Type.ASSET && type != Type.FRAGMENT && type != Type.PRODUCT) {
				continue;
			}
			JsonNode value = data.get(field.name());
			if (value == null) {
				continue;
			}
			Iterable<JsonNode> items = value.isArray() ? value : List.of(value);
			for (JsonNode item : items) {
				String id = item.isNumber() ? String.valueOf(item.asLong()) : item.asString("");
				if (!id.isBlank() && id.length() <= 64) {
					references.add(new Target(type == Type.ASSET ? TargetType.ASSET
							: type == Type.FRAGMENT ? TargetType.FRAGMENT : TargetType.PRODUCT, id));
				}
			}
		}
		return references;
	}

	/** Checks one value; on success adds its normalized form to {@code out}. Returns the problem, or null. */
	private static String check(FieldDef field, JsonNode value, Lookup lookup, UUID self, ArrayNode out,
			Set<Target> references) {
		Type type = field.valueType();
		switch (type) {
			case TEXT, TEXTAREA, MARKDOWN -> {
				if (!value.isString()) {
					return "Cần nhập chữ";
				}
				String text = type == Type.TEXT ? value.asString().strip() : value.asString();
				int max = maxLength(field, type);
				if (text.length() > max) {
					return "Tối đa " + max + " ký tự";
				}
				out.add(text);
			}
			case LINK -> {
				if (!value.isString()) {
					return "Cần nhập đường dẫn";
				}
				String link = value.asString().strip();
				if (link.length() > maxLength(field, type)) {
					return "Tối đa " + maxLength(field, type) + " ký tự";
				}
				if (!LINK.matcher(link).matches()) {
					return "Đường dẫn bắt đầu bằng / (trong web) hoặc https://";
				}
				out.add(link);
			}
			case NUMBER -> {
				if (!value.isNumber()) {
					return "Cần nhập số";
				}
				double number = value.asDouble();
				Double min = field.numberRule("min");
				Double max = field.numberRule("max");
				if (min != null && number < min) {
					return "Nhỏ nhất là " + plain(min);
				}
				if (max != null && number > max) {
					return "Lớn nhất là " + plain(max);
				}
				out.add(value);
			}
			case BOOLEAN -> {
				if (!value.isBoolean()) {
					return "Cần chọn có hoặc không";
				}
				out.add(value);
			}
			case DATE -> {
				try {
					out.add(LocalDate.parse(value.asString("")).toString());
				}
				catch (DateTimeParseException ex) {
					return "Ngày không hợp lệ (yyyy-mm-dd)";
				}
			}
			case DATETIME -> {
				Instant instant = instant(value.asString(""));
				if (instant == null) {
					return "Thời điểm không hợp lệ";
				}
				out.add(instant.toString());
			}
			case ENUM -> {
				List<String> options = field.stringsRule("options");
				if (!value.isString() || !options.contains(value.asString())) {
					return "Chọn một trong: " + String.join(", ", options);
				}
				out.add(value.asString());
			}
			case ASSET -> {
				UUID id = uuid(value);
				if (id == null) {
					return "Asset không hợp lệ";
				}
				Optional<String> kind = lookup.assetKind(id);
				if (kind.isEmpty()) {
					return "Asset không còn trong kho";
				}
				List<String> kinds = field.stringsRule("allowedKinds");
				if (!kinds.isEmpty() && !kinds.contains(kind.get())) {
					return kinds.equals(List.of("PDF")) ? "Cần chọn file PDF" : "Cần chọn ảnh";
				}
				out.add(id.toString());
				references.add(new Target(TargetType.ASSET, id.toString()));
			}
			case FRAGMENT -> {
				UUID id = uuid(value);
				if (id == null) {
					return "Fragment không hợp lệ";
				}
				if (id.equals(self)) {
					return "Fragment không thể trỏ tới chính nó";
				}
				Optional<String> model = lookup.fragmentModel(id);
				if (model.isEmpty()) {
					return "Fragment không còn tồn tại";
				}
				List<String> models = field.stringsRule("allowedModels");
				if (!models.isEmpty() && !models.contains(model.get())) {
					return "Cần fragment thuộc model: " + String.join(", ", models);
				}
				out.add(id.toString());
				references.add(new Target(TargetType.FRAGMENT, id.toString()));
			}
			case PRODUCT -> {
				if (!value.isIntegralNumber() || !value.canConvertToExactIntegral() || value.asLong() <= 0) {
					return "Sản phẩm không hợp lệ";
				}
				long id = value.asLong();
				if (!lookup.productExists(id)) {
					return "Sản phẩm không còn tồn tại";
				}
				out.add(id);
				references.add(new Target(TargetType.PRODUCT, String.valueOf(id)));
			}
			case LIST -> {
				return "Kiểu danh sách không hợp lệ";
			}
		}
		return null;
	}

	private static int maxLength(FieldDef field, Type type) {
		int ceiling = ModelFields.MAX_LENGTH.get(type);
		Integer rule = field.intRule("maxLength");
		return rule == null ? ceiling : Math.min(rule, ceiling);
	}

	/** "2026-11-12T03:00:00Z", "2026-11-12T10:00:00+07:00", or "2026-11-12T10:00" (Vietnam time). */
	static Instant instant(String text) {
		try {
			return OffsetDateTime.parse(text).toInstant();
		}
		catch (DateTimeParseException ex) {
			try {
				return LocalDateTime.parse(text).atZone(SHOP_ZONE).toInstant();
			}
			catch (DateTimeParseException ex2) {
				return null;
			}
		}
	}

	private static UUID uuid(JsonNode value) {
		if (!value.isString()) {
			return null;
		}
		try {
			return UUID.fromString(value.asString().strip());
		}
		catch (IllegalArgumentException ex) {
			return null;
		}
	}

	private static boolean isEmpty(JsonNode value) {
		return value == null || value.isNull() || value.isMissingNode() || value.isString() && value.asString().isBlank()
				|| value.isArray() && value.isEmpty();
	}

	private static String plain(double number) {
		return number == Math.rint(number) ? String.valueOf((long) number) : String.valueOf(number);
	}
}
