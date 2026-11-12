package com.nutshop.content.site;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.nutshop.content.fragment.FieldDef;
import com.nutshop.content.fragment.FieldDef.Type;
import com.nutshop.content.fragment.FragmentDelivery;
import com.nutshop.content.site.ComponentRegistry.ComponentDef;
import com.nutshop.content.site.SiteDtos.MenuItem;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.NullNode;
import tools.jackson.databind.node.ObjectNode;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * What the public sees of CMS pages: only the published version, inside its publish window, with references
 * resolved like fragments (assets → {url, alt, renditions…}, markdown → {markdown, html}) and data added per
 * component: "products" for product grids and carousels (current price), "fragment" for a fragment block, "items"
 * for fragment lists and FAQs. Components the registry no longer knows are skipped (and logged).
 * <p>
 * Cached for a minute; cleared when pages change and whenever fragments are published (pages embed them).
 */
@Service
public class PageDelivery {

	private static final Logger log = LoggerFactory.getLogger(PageDelivery.class);
	static final Duration TTL = Duration.ofSeconds(60);
	private static final JsonNodeFactory NODES = JsonNodeFactory.instance;

	record Source(UUID id, String path, String template, String title, JsonNode content, JsonNode properties, Integer version,
			Instant publishedAt) {
	}

	private final Cache<String, JsonNode> cache = Caffeine.newBuilder().expireAfterWrite(TTL).maximumSize(1000).build();

	private final JdbcTemplate jdbc;
	private final JsonMapper json;
	private final ComponentRegistry registry;
	private final FragmentDelivery fragments;
	private final Clock clock;

	public PageDelivery(JdbcTemplate jdbc, JsonMapper json, ComponentRegistry registry, FragmentDelivery fragments, Clock clock) {
		this.jdbc = jdbc;
		this.json = json;
		this.registry = registry;
		this.fragments = fragments;
		this.clock = clock;
		fragments.onEvict(this::evictAll);
	}

	/** The published page at this path, or empty. */
	@Transactional(readOnly = true)
	public Optional<JsonNode> published(String path) {
		JsonNode node = cache.get("page:" + path, key -> jdbc.query(PUBLISHED + " AND p.path = ?", source(), now(), now(), path)
			.stream()
			.findFirst()
			.<JsonNode>map(s -> render(s, false))
			.orElse(NullNode.getInstance()));
		return node.isNull() ? Optional.empty() : Optional.of(node);
	}

	/** The current path of a page that used to live at {@code oldPath}, if that page is published now. */
	@Transactional(readOnly = true)
	public Optional<String> redirectFor(String oldPath) {
		return jdbc.queryForList("""
				SELECT p.path FROM site_page_path_history h JOIN site_pages p ON p.id = h.page_id
				WHERE h.old_path = ? AND p.published_version_id IS NOT NULL""", String.class, oldPath).stream().findFirst();
	}

	/** The working copy (preview link). Never cached. */
	@Transactional(readOnly = true)
	public Optional<JsonNode> preview(UUID id) {
		return jdbc.query("""
				SELECT p.id, p.path, p.template, p.title, p.content, p.properties,
				       (SELECT MAX(version_no) FROM site_page_versions v WHERE v.page_id = p.id) AS version_no, p.published_at
				FROM site_pages p WHERE p.id = ?""", source(), id).stream().findFirst().map(s -> {
			ObjectNode node = render(s, true);
			node.put("preview", true);
			return (JsonNode) node;
		});
	}

	/** Published pages marked "show in menu", in tree order. */
	@Transactional(readOnly = true)
	public List<MenuItem> menu() {
		return jdbc.query(PUBLISHED + " AND (v.properties ->> 'showInMenu')::boolean IS TRUE ORDER BY p.sort_order, p.path",
				(rs, n) -> new MenuItem(rs.getString("title"), rs.getString("path")), now(), now());
	}

	public void evictAll() {
		cache.invalidateAll();
	}

	// ---- reading --------------------------------------------------------------------------------------------

	private static final String PUBLISHED = """
			SELECT p.id, p.path, p.template, v.title, v.content, v.properties, v.version_no, p.published_at
			FROM site_pages p JOIN site_page_versions v ON v.id = p.published_version_id
			WHERE (p.publish_at IS NULL OR p.publish_at <= ?) AND (p.unpublish_at IS NULL OR p.unpublish_at > ?)""";

	private Timestamp now() {
		return Timestamp.from(clock.instant());
	}

	private RowMapper<Source> source() {
		return (rs, n) -> new Source(rs.getObject("id", UUID.class), rs.getString("path"), rs.getString("template"),
				rs.getString("title"), json.readTree(rs.getString("content")), json.readTree(rs.getString("properties")),
				(Integer) rs.getObject("version_no"),
				rs.getTimestamp("published_at") == null ? null : rs.getTimestamp("published_at").toInstant());
	}

	// ---- rendering ------------------------------------------------------------------------------------------

	private ObjectNode render(Source s, boolean working) {
		ObjectNode node = NODES.objectNode();
		node.put("id", s.id().toString());
		node.put("path", s.path());
		node.put("template", s.template());
		node.put("title", s.title());
		if (s.version() == null) {
			node.putNull("version");
		}
		else {
			node.put("version", s.version());
		}
		node.put("publishedAt", s.publishedAt() == null ? null : s.publishedAt().toString());
		node.set("properties", props(registry.pageProperties(), s.properties()));
		ObjectNode regions = node.putObject("regions");
		for (String region : registry.regions()) {
			regions.set(region, blocks(s.content().path("regions").path(region), working));
		}
		return node;
	}

	private ArrayNode blocks(JsonNode list, boolean working) {
		ArrayNode out = NODES.arrayNode();
		if (!list.isArray()) {
			return out;
		}
		for (JsonNode block : list) {
			String type = block.path("type").asString("");
			Optional<ComponentDef> def = registry.component(type);
			if (def.isEmpty()) {
				log.warn("Page block {} has unknown type '{}': skipped", block.path("id").asString(""), type);
				continue;
			}
			ObjectNode b = NODES.objectNode();
			b.put("id", block.path("id").asString(""));
			b.put("type", type);
			ObjectNode props = props(def.get().props(), block.path("props"));
			addDerived(type, block.path("props"), props, working);
			b.set("props", props);
			if (def.get().children()) {
				b.set("children", blocks(block.path("children"), working));
			}
			out.add(b);
		}
		return out;
	}

	/** Every prop of the component (null when empty), assets and markdown resolved, other values as stored. */
	private ObjectNode props(List<FieldDef> fields, JsonNode stored) {
		ObjectNode props = NODES.objectNode();
		for (FieldDef field : fields) {
			JsonNode raw = stored.get(field.name());
			if (raw == null || raw.isNull()) {
				props.putNull(field.name());
				continue;
			}
			Type type = field.typeEnum();
			if (type == Type.ASSET || type == Type.MARKDOWN) {
				if (raw.isArray()) {
					ArrayNode items = props.putArray(field.name());
					raw.forEach(item -> {
						JsonNode resolved = resolve(type, item);
						if (!resolved.isNull()) {
							items.add(resolved);
						}
					});
				}
				else {
					props.set(field.name(), resolve(type, raw));
				}
			}
			else {
				props.set(field.name(), raw);
			}
		}
		return props;
	}

	private JsonNode resolve(Type type, JsonNode raw) {
		return type == Type.ASSET ? fragments.asset(raw.asString("")) : fragments.markdown(raw.asString(""));
	}

	private void addDerived(String type, JsonNode stored, ObjectNode props, boolean working) {
		switch (type) {
			case "product-grid", "product-carousel" -> props.set("products", products(stored));
			case "fragment" -> props.set("fragment", fragment(stored.path("fragmentId").asString(""), working));
			case "fragment-list" -> props.set("items", fragments.list(stored.path("model").asString(""),
					stored.path("folder").asString(""), 0, stored.path("limit").asInt(6)).path("items"));
			case "faq" -> {
				ArrayNode items = NODES.arrayNode();
				JsonNode ids = stored.path("fragmentIds");
				if (ids.isArray() && !ids.isEmpty()) {
					ids.forEach(id -> {
						JsonNode f = fragment(id.asString(""), working);
						if (!f.isNull()) {
							items.add(f);
						}
					});
				}
				else {
					fragments.list("faq", stored.path("folder").asString(""), 0, 50).path("items").forEach(items::add);
				}
				props.set("items", items);
			}
			default -> {
			}
		}
	}

	private JsonNode fragment(String rawId, boolean working) {
		try {
			return fragments.fragment(UUID.fromString(rawId), working).orElse(NullNode.getInstance());
		}
		catch (IllegalArgumentException ex) {
			return NullNode.getInstance();
		}
	}

	/** Product cards at today's prices: picked by hand, or the first ones on sale in a category. */
	private ArrayNode products(JsonNode stored) {
		int limit = Math.max(1, Math.min(stored.path("limit").asInt(8), 24));
		ArrayNode out = NODES.arrayNode();
		List<Long> ids;
		if ("manual".equals(stored.path("mode").asString(""))) {
			ids = new java.util.ArrayList<>();
			stored.path("productIds").forEach(id -> ids.add(id.asLong()));
		}
		else {
			ids = jdbc.queryForList("""
					SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id
					WHERE c.slug = ? AND p.active AND p.price > 0 ORDER BY p.sort_order, p.id LIMIT ?""", Long.class,
					stored.path("categorySlug").asString(""), limit);
		}
		for (Long id : ids) {
			if (out.size() >= limit) {
				break;
			}
			JsonNode card = fragments.productCard(id);
			if (!card.isNull()) {
				out.add(card);
			}
		}
		return out;
	}
}
