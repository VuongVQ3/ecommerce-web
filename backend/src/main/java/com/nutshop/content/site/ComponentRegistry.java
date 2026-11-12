package com.nutshop.content.site;

import com.nutshop.content.fragment.FieldDef;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * The CMS component registry (shared/cms-components.json, on the classpath as cms/cms-components.json): which
 * components exist, their props (Content Fragment field format) and which templates allow them. The frontend reads
 * the same file for its editor forms and renderers.
 */
@Component
public class ComponentRegistry {

	static final String RESOURCE = "cms/cms-components.json";

	/** One component: its props, defaults for a new block, and whether it holds child blocks. */
	public record ComponentDef(String type, String label, List<FieldDef> props, boolean children, JsonNode defaults) {
	}

	private final Map<String, ComponentDef> components;
	private final Map<String, Set<String>> templates;
	private final List<String> regions;
	private final List<FieldDef> pageProperties;

	@Autowired
	public ComponentRegistry(JsonMapper json) {
		this(load(json), json);
	}

	ComponentRegistry(JsonNode root, JsonMapper json) {
		Map<String, ComponentDef> defs = new LinkedHashMap<>();
		for (Map.Entry<String, JsonNode> entry : root.path("components").properties()) {
			JsonNode node = entry.getValue();
			defs.put(entry.getKey(), new ComponentDef(entry.getKey(), node.path("label").asString(entry.getKey()),
					fields(node.path("props"), json), node.path("children").asBoolean(false), node.path("defaults")));
		}
		this.components = Collections.unmodifiableMap(defs);
		Map<String, Set<String>> allowed = new LinkedHashMap<>();
		for (Map.Entry<String, JsonNode> entry : root.path("templates").properties()) {
			JsonNode list = entry.getValue().path("allowed");
			Set<String> types = new LinkedHashSet<>();
			if (list.isString() && "*".equals(list.asString())) {
				types.addAll(defs.keySet());
			}
			else {
				list.forEach(t -> types.add(t.asString()));
			}
			allowed.put(entry.getKey(), Collections.unmodifiableSet(types));
		}
		this.templates = Collections.unmodifiableMap(allowed);
		List<String> names = new ArrayList<>();
		root.path("regions").forEach(r -> names.add(r.asString()));
		this.regions = List.copyOf(names);
		this.pageProperties = fields(root.path("pageProperties"), json);
		if (components.isEmpty() || templates.isEmpty() || regions.isEmpty()) {
			throw new IllegalStateException(RESOURCE + " must define components, templates and regions");
		}
	}

	private static JsonNode load(JsonMapper json) {
		try (InputStream in = new ClassPathResource(RESOURCE).getInputStream()) {
			return json.readTree(in);
		}
		catch (IOException ex) {
			throw new IllegalStateException("Cannot read " + RESOURCE, ex);
		}
	}

	private static List<FieldDef> fields(JsonNode list, JsonMapper json) {
		List<FieldDef> fields = new ArrayList<>();
		list.forEach(node -> fields.add(json.treeToValue(node, FieldDef.class)));
		return List.copyOf(fields);
	}

	public Optional<ComponentDef> component(String type) {
		return Optional.ofNullable(type == null ? null : components.get(type));
	}

	public Map<String, ComponentDef> components() {
		return components;
	}

	public boolean isTemplate(String template) {
		return template != null && templates.containsKey(template);
	}

	/** Whether the template may hold the component. */
	public boolean allows(String template, String type) {
		return templates.getOrDefault(template, Set.of()).contains(type);
	}

	public List<String> regions() {
		return regions;
	}

	public List<FieldDef> pageProperties() {
		return pageProperties;
	}
}
