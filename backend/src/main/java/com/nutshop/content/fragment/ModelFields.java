package com.nutshop.content.fragment;

import com.nutshop.content.fragment.FieldDef.Type;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Predicate;
import java.util.regex.Pattern;

/**
 * Rules for the field list of a model, and what a change to it means for fragments already written with it.
 * Errors are keyed like the request ("fields[2].name") so the model editor can show them next to the right input.
 */
public final class ModelFields {

	static final int MAX_FIELDS = 50;
	static final Pattern NAME = Pattern.compile("^[a-z][a-zA-Z0-9]{0,39}$");
	static final Set<String> KINDS = Set.of("IMAGE", "PDF");

	/** Longest value per text type, also the ceiling for rules.maxLength. */
	static final Map<Type, Integer> MAX_LENGTH = Map.of(Type.TEXT, 500, Type.TEXTAREA, 5000, Type.MARKDOWN, 50_000,
			Type.LINK, 500);

	private ModelFields() {
	}

	/**
	 * @param modelExists whether a model slug exists (for rules.allowedModels)
	 * @return errors by "fields[i].property"; empty when the list is valid
	 */
	public static Map<String, String> check(List<FieldDef> fields, Predicate<String> modelExists) {
		Map<String, String> errors = new LinkedHashMap<>();
		if (fields == null) {
			errors.put("fields", "Thiếu danh sách field");
			return errors;
		}
		if (fields.size() > MAX_FIELDS) {
			errors.put("fields", "Tối đa " + MAX_FIELDS + " field trong một model");
		}
		Set<String> names = new HashSet<>();
		for (int i = 0; i < fields.size(); i++) {
			FieldDef f = fields.get(i);
			String at = "fields[" + i + "].";
			if (f == null) {
				errors.put("fields[" + i + "]", "Field trống");
				continue;
			}
			if (f.name() == null || !NAME.matcher(f.name()).matches()) {
				errors.put(at + "name", "Tên field viết liền kiểu camelCase, bắt đầu bằng chữ thường (vd. ctaLabel), tối đa 40 ký tự");
			}
			else if (!names.add(f.name())) {
				errors.put(at + "name", "Trùng tên field “" + f.name() + "”");
			}
			if (f.label() == null || f.label().isBlank()) {
				errors.put(at + "label", "Nhập nhãn");
			}
			else if (f.label().length() > 100) {
				errors.put(at + "label", "Nhãn tối đa 100 ký tự");
			}
			if (f.help() != null && f.help().length() > 300) {
				errors.put(at + "help", "Hướng dẫn tối đa 300 ký tự");
			}
			var type = Type.of(f.type());
			if (type.isEmpty()) {
				errors.put(at + "type", "Kiểu field không hợp lệ");
				continue;
			}
			Type t = type.get();
			if (f.isMultiple() && (t == Type.BOOLEAN || t == Type.LIST)) {
				errors.put(at + "multiple", "Kiểu này không chọn nhiều giá trị được");
			}
			checkRules(f, t, at + "rules.", errors, modelExists);
		}
		return errors;
	}

	private static void checkRules(FieldDef f, Type t, String at, Map<String, String> errors, Predicate<String> modelExists) {
		Type valueType = t;
		if (t == Type.LIST) {
			var item = Type.of(f.rules().path("itemType").asString(""));
			if (item.isEmpty() || !FieldDef.LIST_ITEM_TYPES.contains(item.get())) {
				errors.put(at + "itemType", "Danh sách cần kiểu phần tử: text, number, link hoặc date");
				return;
			}
			valueType = item.get();
		}
		if (MAX_LENGTH.containsKey(valueType) && f.rules().has("maxLength")) {
			Integer max = f.intRule("maxLength");
			if (max == null || max < 1 || max > MAX_LENGTH.get(valueType)) {
				errors.put(at + "maxLength", "Độ dài tối đa từ 1 đến " + MAX_LENGTH.get(valueType));
			}
		}
		if (valueType == Type.NUMBER) {
			Double min = f.numberRule("min");
			Double max = f.numberRule("max");
			if (f.rules().has("min") && min == null || f.rules().has("max") && max == null) {
				errors.put(at + "min", "Giá trị nhỏ nhất / lớn nhất phải là số");
			}
			else if (min != null && max != null && min > max) {
				errors.put(at + "max", "Giá trị lớn nhất phải ≥ nhỏ nhất");
			}
		}
		if (f.rules().has("maxItems")) {
			Integer maxItems = f.intRule("maxItems");
			if (maxItems == null || maxItems < 1 || maxItems > 100) {
				errors.put(at + "maxItems", "Số phần tử tối đa từ 1 đến 100");
			}
		}
		switch (t) {
			case ENUM -> {
				List<String> options = f.stringsRule("options");
				if (options.isEmpty()) {
					errors.put(at + "options", "Cần ít nhất một lựa chọn");
				}
				else if (new LinkedHashSet<>(options).size() != options.size()) {
					errors.put(at + "options", "Các lựa chọn không được trùng nhau");
				}
				else if (options.size() > 100 || options.stream().anyMatch(o -> o.length() > 100)) {
					errors.put(at + "options", "Tối đa 100 lựa chọn, mỗi lựa chọn tối đa 100 ký tự");
				}
			}
			case ASSET -> {
				if (!KINDS.containsAll(f.stringsRule("allowedKinds"))) {
					errors.put(at + "allowedKinds", "Loại asset chỉ gồm IMAGE và PDF");
				}
			}
			case FRAGMENT -> {
				List<String> unknown = f.stringsRule("allowedModels").stream().filter(Predicate.not(modelExists)).toList();
				if (!unknown.isEmpty()) {
					errors.put(at + "allowedModels", "Không có model: " + String.join(", ", unknown));
				}
			}
			default -> {
			}
		}
	}

	/**
	 * Fields whose existing values would no longer fit: removed, or of another type (type, multiple or list item
	 * type changed). Adding fields or changing labels, help, rules or the order is never breaking.
	 */
	public static List<String> breakingChanges(List<FieldDef> before, List<FieldDef> after) {
		Map<String, FieldDef> now = new LinkedHashMap<>();
		after.forEach(f -> now.put(f.name(), f));
		return before.stream().filter(old -> {
			FieldDef next = now.get(old.name());
			return next == null || !Objects.equals(old.type(), next.type()) || old.isMultiple() != next.isMultiple()
					|| old.typeEnum() == Type.LIST && old.valueType() != next.valueType();
		}).map(FieldDef::name).toList();
	}
}
