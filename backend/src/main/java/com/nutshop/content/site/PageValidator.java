package com.nutshop.content.site;

import com.nutshop.content.ContentReferenceService.Target;
import com.nutshop.content.fragment.FieldDef;
import com.nutshop.content.fragment.FragmentValidator;
import com.nutshop.content.fragment.FragmentValidator.Mode;
import com.nutshop.content.site.ComponentRegistry.ComponentDef;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Checks a page's content against the component registry and normalizes it to
 * {regions: {main: [{id, type, props, children?}]}}: known region names only, block ids unique, types known and
 * allowed by the template, props checked like Content Fragment fields (plus the registry's "ref" and "requiredWhen"
 * rules), children only in a container and only one level deep. Errors are keyed for the editor:
 * "blocks.{id}.props.{prop}", "blocks.{id}.type", "properties.{name}", "content".
 */
public final class PageValidator {

	/** What the validator looks up beyond what fragments need. */
	public interface Lookup extends FragmentValidator.Lookup {

		boolean categoryExists(String slug);

		boolean modelExists(String slug);
	}

	public record Result(ObjectNode content, ObjectNode properties, Map<String, String> errors, Set<Target> references) {

		public boolean valid() {
			return errors.isEmpty();
		}
	}

	static final int MAX_BLOCKS = 200;
	static final Pattern BLOCK_ID = Pattern.compile("^[A-Za-z0-9_-]{1,40}$");
	static final Pattern FOLDER = Pattern.compile("^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$");
	private static final JsonNodeFactory NODES = JsonNodeFactory.instance;

	private PageValidator() {
	}

	public static Result validate(ComponentRegistry registry, String template, JsonNode content, JsonNode properties,
			Mode mode, Lookup lookup) {
		Map<String, String> errors = new LinkedHashMap<>();
		Set<Target> references = new LinkedHashSet<>();
		ObjectNode regions = NODES.objectNode();
		JsonNode input = NODES.objectNode();
		if (content != null && !content.isNull()) {
			JsonNode given = content.path("regions");
			if (content.isObject() && (given.isObject() || given.isMissingNode())) {
				input = given.isObject() ? given : input;
			}
			else {
				errors.put("content", "Nội dung trang không đúng định dạng");
			}
		}
		Set<String> ids = new HashSet<>();
		int[] count = { 0 };
		for (String region : registry.regions()) {
			JsonNode blocks = input.path(region);
			ArrayNode out = regions.putArray(region);
			if (blocks.isMissingNode() || blocks.isNull()) {
				continue;
			}
			if (!blocks.isArray()) {
				errors.put("content", "Vùng “" + region + "” phải là một danh sách");
				continue;
			}
			for (JsonNode block : blocks) {
				ObjectNode normalized = block(registry, template, block, mode, lookup, errors, references, ids, count, false);
				if (normalized != null) {
					out.add(normalized);
				}
			}
		}
		if (count[0] > MAX_BLOCKS) {
			errors.put("content", "Tối đa " + MAX_BLOCKS + " component trên một trang");
		}
		ObjectNode normalized = NODES.objectNode();
		normalized.set("regions", regions);

		FragmentValidator.Result props = FragmentValidator.validate(registry.pageProperties(), properties, mode, lookup, null);
		props.errors().forEach((key, message) -> errors.put("properties." + key.substring("data.".length()), message));
		references.addAll(props.references());
		return new Result(normalized, props.data(), errors, references);
	}

	private static ObjectNode block(ComponentRegistry registry, String template, JsonNode block, Mode mode, Lookup lookup,
			Map<String, String> errors, Set<Target> references, Set<String> ids, int[] count, boolean nested) {
		count[0]++;
		if (block == null || !block.isObject()) {
			errors.put("content", "Có component không đúng định dạng");
			return null;
		}
		String id = block.path("id").asString("");
		if (!BLOCK_ID.matcher(id).matches() || !ids.add(id)) {
			errors.put("content", "Mã component thiếu, sai hoặc bị trùng: “" + id + "”");
			return null;
		}
		String at = "blocks." + id + ".";
		String type = block.path("type").asString("");
		var def = registry.component(type);
		if (def.isEmpty()) {
			errors.put(at + "type", "Không có component “" + type + "”");
			return null;
		}
		if (!registry.allows(template, type)) {
			errors.put(at + "type", "Mẫu trang này không dùng được component “" + def.get().label() + "”");
			return null;
		}
		if (nested && def.get().children()) {
			errors.put(at + "type", "Không đặt khung nhiều cột lồng trong khung nhiều cột");
			return null;
		}
		ObjectNode out = NODES.objectNode();
		out.put("id", id);
		out.put("type", type);
		out.set("props", props(def.get(), block.path("props"), mode, lookup, errors, references, at));
		if (def.get().children()) {
			ArrayNode children = out.putArray("children");
			JsonNode list = block.path("children");
			if (!list.isMissingNode() && !list.isNull() && !list.isArray()) {
				errors.put(at + "children", "Danh sách component con không đúng định dạng");
			}
			else if (list.isArray()) {
				for (JsonNode child : list) {
					ObjectNode normalized = block(registry, template, child, mode, lookup, errors, references, ids, count, true);
					if (normalized != null) {
						children.add(normalized);
					}
				}
			}
		}
		return out;
	}

	private static ObjectNode props(ComponentDef def, JsonNode input, Mode mode, Lookup lookup, Map<String, String> errors,
			Set<Target> references, String at) {
		FragmentValidator.Result result = FragmentValidator.validate(def.props(), input, mode, lookup, null);
		result.errors().forEach((key, message) -> errors.put(at + "props." + key.substring("data.".length()), message));
		references.addAll(result.references());
		ObjectNode props = result.data();
		for (FieldDef field : def.props()) {
			String key = at + "props." + field.name();
			JsonNode value = props.get(field.name());
			String ref = field.rules().path("ref").asString("");
			if (value != null && value.isString() && !errors.containsKey(key)) {
				String text = value.asString();
				switch (ref) {
					case "category" -> {
						if (!lookup.categoryExists(text)) {
							errors.put(key, "Không có danh mục “" + text + "”");
						}
					}
					case "cfModel" -> {
						if (!lookup.modelExists(text)) {
							errors.put(key, "Không có model “" + text + "”");
						}
					}
					case "fragmentFolder" -> {
						if (!FOLDER.matcher(text).matches()) {
							errors.put(key, "Thư mục dạng /faq hoặc /khuyen-mai/tet");
						}
					}
					default -> {
					}
				}
			}
			// requiredWhen {other: value}: required (on publish) while the other prop has that value
			JsonNode when = field.rules().path("requiredWhen");
			if (mode == Mode.PUBLISH && when.isObject() && value == null && !errors.containsKey(key)) {
				for (Map.Entry<String, JsonNode> condition : when.properties()) {
					JsonNode other = props.get(condition.getKey());
					if (other != null && other.equals(condition.getValue())) {
						errors.put(key, FragmentValidator.REQUIRED);
					}
				}
			}
		}
		return props;
	}

	/** Every reference in stored content and properties (for content_references). */
	public static Set<Target> references(ComponentRegistry registry, JsonNode content, JsonNode properties) {
		Set<Target> targets = new LinkedHashSet<>(FragmentValidator.references(registry.pageProperties(), properties));
		for (String region : registry.regions()) {
			collect(registry, content.path("regions").path(region), targets);
		}
		return targets;
	}

	private static void collect(ComponentRegistry registry, JsonNode blocks, Set<Target> targets) {
		if (!blocks.isArray()) {
			return;
		}
		for (JsonNode block : blocks) {
			registry.component(block.path("type").asString("")).ifPresent(def -> {
				targets.addAll(FragmentValidator.references(def.props(), block.path("props")));
				collect(registry, block.path("children"), targets);
			});
		}
	}

	/** Every block of the content, children included, in order. */
	static List<JsonNode> blocks(ComponentRegistry registry, JsonNode content) {
		List<JsonNode> all = new ArrayList<>();
		for (String region : registry.regions()) {
			for (JsonNode block : content.path("regions").path(region)) {
				all.add(block);
				block.path("children").forEach(all::add);
			}
		}
		return all;
	}
}
