package com.nutshop.content.fragment;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.JsonNodeFactory;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * One field of a Content Fragment Model, as stored in cf_models.fields.
 * @param name camelCase, unique in the model; the key in a fragment's data
 * @param type one of {@link Type} in lowercase ("text", "asset"…)
 * @param multiple a list of values of that type (not for boolean and list)
 * @param rules per type: maxLength, min, max, options, allowedKinds, allowedModels, itemType, maxItems
 */
public record FieldDef(String name, String label, String type, Boolean required, Boolean multiple, String help,
		JsonNode rules) {

	public enum Type {
		TEXT, TEXTAREA, MARKDOWN, NUMBER, BOOLEAN, DATE, DATETIME, ENUM, ASSET, FRAGMENT, PRODUCT, LINK, LIST;

		public String json() {
			return name().toLowerCase(Locale.ROOT);
		}

		public static Optional<Type> of(String value) {
			if (value == null) {
				return Optional.empty();
			}
			for (Type type : values()) {
				if (type.json().equals(value)) {
					return Optional.of(type);
				}
			}
			return Optional.empty();
		}
	}

	/** Item types allowed in a "list" field. */
	static final List<Type> LIST_ITEM_TYPES = List.of(Type.TEXT, Type.NUMBER, Type.LINK, Type.DATE);

	public FieldDef {
		required = Boolean.TRUE.equals(required);
		multiple = Boolean.TRUE.equals(multiple);
		rules = rules == null || !rules.isObject() ? JsonNodeFactory.instance.objectNode() : rules;
		help = help == null || help.isBlank() ? null : help.strip();
		label = label == null ? null : label.strip();
		name = name == null ? null : name.strip();
	}

	public Type typeEnum() {
		return Type.of(type).orElseThrow(() -> new IllegalStateException("Unknown field type " + type));
	}

	public boolean isRequired() {
		return Boolean.TRUE.equals(required);
	}

	public boolean isMultiple() {
		return Boolean.TRUE.equals(multiple);
	}

	/** The type of one value: the item type for a list, the field type otherwise. */
	Type valueType() {
		Type t = typeEnum();
		return t == Type.LIST ? Type.of(rules.path("itemType").asString("")).orElse(Type.TEXT) : t;
	}

	Integer intRule(String key) {
		JsonNode node = rules.get(key);
		return node != null && node.canConvertToInt() && node.isIntegralNumber() ? node.asInt() : null;
	}

	Double numberRule(String key) {
		JsonNode node = rules.get(key);
		return node != null && node.isNumber() ? node.asDouble() : null;
	}

	List<String> stringsRule(String key) {
		List<String> values = new ArrayList<>();
		JsonNode node = rules.get(key);
		if (node != null && node.isArray()) {
			node.forEach(n -> {
				if (n.isString() && !n.asString().isBlank()) {
					values.add(n.asString().strip());
				}
			});
		}
		return values;
	}
}
