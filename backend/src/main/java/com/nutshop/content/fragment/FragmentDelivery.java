package com.nutshop.content.fragment;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.nutshop.blog.BlogMarkdown;
import com.nutshop.common.PageResponse;
import com.nutshop.common.TextFold;
import com.nutshop.content.fragment.FieldDef.Type;
import com.nutshop.dam.AssetRenditions;
import com.nutshop.dam.DamAssetService;
import com.nutshop.media.AssetTypes;
import com.nutshop.product.PricingService;
import com.nutshop.product.ProductImageRepository;
import com.nutshop.product.ProductRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
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
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * What the public sees of Content Fragments: only published versions, inside their publish window. References are
 * resolved: an asset becomes {id, url, alt, width, height, renditions…}, a product {id, slug, name, price, image}
 * (only while on sale), a fragment its own published content, nested at most {@value #MAX_DEPTH} levels (deeper
 * ones, and loops, become {id}). Markdown comes as {markdown, html}. Every model field is present (null when empty).
 * <p>
 * Answers are cached for a minute and the cache is cleared whenever something is published, unpublished, deleted
 * or a model changes. The preview reads working copies instead and is never cached.
 */
@Service
public class FragmentDelivery {

	static final int MAX_DEPTH = 2;
	static final int DEFAULT_LIMIT = 20;
	static final int MAX_LIMIT = 100;
	static final Duration TTL = Duration.ofSeconds(60);

	private static final JsonNodeFactory NODES = JsonNodeFactory.instance;

	/** One fragment as rendered: its published version (or working copy for previews). */
	record Source(UUID id, String model, List<FieldDef> fields, String folder, String name, String title, JsonNode data,
			Integer version, Instant publishedAt) {
	}

	private final List<Runnable> evictListeners = new java.util.concurrent.CopyOnWriteArrayList<>();

	private final Cache<String, JsonNode> cache = Caffeine.newBuilder().expireAfterWrite(TTL).maximumSize(2000).build();

	private final JdbcTemplate jdbc;
	private final JsonMapper json;
	private final BlogMarkdown markdown;
	private final ProductRepository products;
	private final ProductImageRepository productImages;
	private final PricingService pricing;
	private final Clock clock;

	public FragmentDelivery(JdbcTemplate jdbc, JsonMapper json, BlogMarkdown markdown, ProductRepository products,
			ProductImageRepository productImages, PricingService pricing, Clock clock) {
		this.jdbc = jdbc;
		this.json = json;
		this.markdown = markdown;
		this.products = products;
		this.productImages = productImages;
		this.pricing = pricing;
		this.clock = clock;
	}

	/** The published fragment, or empty (unknown, unpublished or outside its window). */
	@Transactional(readOnly = true)
	public Optional<JsonNode> published(UUID id) {
		JsonNode node = cache.get("one:" + id, key -> publishedSource(id).<JsonNode>map(s -> render(s, 0, false, new HashSet<>()))
			.orElse(NullNode.getInstance()));
		return node.isNull() ? Optional.empty() : Optional.of(node);
	}

	/**
	 * Published fragments, newest publication first, optionally of one model and inside one folder (or below it).
	 * Shaped like the rest of the API: {items, page, size, totalItems, totalPages}.
	 */
	@Transactional(readOnly = true)
	public JsonNode list(String model, String folder, int page, int limit) {
		int size = limit <= 0 ? DEFAULT_LIMIT : Math.min(limit, MAX_LIMIT);
		int index = Math.max(page, 0);
		String key = "list:" + model + "|" + folder + "|" + index + "|" + size;
		return cache.get(key, k -> {
			StringBuilder where = new StringBuilder(PUBLISHED_WHERE);
			List<Object> args = new ArrayList<>(List.of(now(), now()));
			if (model != null && !model.isBlank()) {
				where.append(" AND m.slug = ?");
				args.add(model.strip());
			}
			if (folder != null && !folder.isBlank() && !folder.strip().equals("/")) {
				String path = folder.strip().replaceAll("/+$", "");
				where.append(" AND (f.folder_path = ? OR f.folder_path LIKE ? ESCAPE '\\')");
				args.add(path);
				args.add(TextFold.escapeLike(path) + "/%");
			}
			long total = jdbc.queryForObject("SELECT COUNT(*) " + PUBLISHED_FROM + where, Long.class, args.toArray());
			List<Object> pageArgs = new ArrayList<>(args);
			pageArgs.add(size);
			pageArgs.add((long) index * size);
			List<JsonNode> items = jdbc.query(PUBLISHED_SELECT + PUBLISHED_FROM + where
					+ " ORDER BY f.published_at DESC, f.id LIMIT ? OFFSET ?", source(), pageArgs.toArray())
				.stream()
				.<JsonNode>map(s -> render(s, 0, false, new HashSet<>()))
				.toList();
			return json.valueToTree(new PageResponse<>(items, index, size, total, (int) ((total + size - 1) / size)));
		});
	}

	/** The working copy, for a preview link. References use working copies too. Never cached. */
	@Transactional(readOnly = true)
	public Optional<JsonNode> preview(UUID id) {
		return workingSource(id).map(s -> {
			ObjectNode node = render(s, 0, true, new HashSet<>());
			node.put("preview", true);
			return node;
		});
	}

	/**
	 * Clears every cached answer (after something was published, unpublished, deleted or a model changed), and the
	 * caches of whatever embeds fragments (pages, see {@link #onEvict}).
	 */
	public void evictAll() {
		cache.invalidateAll();
		evictListeners.forEach(Runnable::run);
	}

	/** Called on every {@link #evictAll()}: for caches that embed fragment content. */
	public void onEvict(Runnable listener) {
		evictListeners.add(listener);
	}

	// ---- building blocks for other delivery APIs (Sites) ----------------------------------------------------

	/** A published fragment rendered as in the API (or its working copy for a preview); empty when not visible. */
	@Transactional(readOnly = true)
	public Optional<JsonNode> fragment(UUID id, boolean working) {
		return (working ? workingSource(id) : publishedSource(id)).map(s -> render(s, 0, working, new HashSet<>()));
	}

	/** {markdown, html}, rendered as for fragments. */
	public JsonNode markdown(String text) {
		ObjectNode md = NODES.objectNode();
		md.put("markdown", text);
		md.put("html", markdown.render(text, Map.of()).html());
		return md;
	}

	/** {@link #evictAll()} once the current transaction commits (at once outside a transaction). */
	public void evictAllAfterCommit() {
		if (!TransactionSynchronizationManager.isSynchronizationActive()) {
			evictAll();
			return;
		}
		TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
			@Override
			public void afterCommit() {
				evictAll();
			}
		});
	}

	// ---- reading --------------------------------------------------------------------------------------------

	private static final String PUBLISHED_SELECT = """
			SELECT f.id, m.slug, m.fields, f.folder_path, f.name, v.title, v.data, v.version_no, f.published_at
			""";

	private static final String PUBLISHED_FROM = """
			FROM cf_fragments f JOIN cf_models m ON m.id = f.model_id
			JOIN cf_fragment_versions v ON v.id = f.published_version_id
			""";

	private static final String PUBLISHED_WHERE = """
			WHERE (f.publish_at IS NULL OR f.publish_at <= ?) AND (f.unpublish_at IS NULL OR f.unpublish_at > ?)""";

	private Timestamp now() {
		return Timestamp.from(clock.instant());
	}

	private RowMapper<Source> source() {
		return (rs, n) -> new Source(rs.getObject("id", UUID.class), rs.getString("slug"), fields(rs.getString("fields")),
				rs.getString("folder_path"), rs.getString("name"), rs.getString("title"), json.readTree(rs.getString("data")),
				(Integer) rs.getObject("version_no"),
				rs.getTimestamp("published_at") == null ? null : rs.getTimestamp("published_at").toInstant());
	}

	private Optional<Source> publishedSource(UUID id) {
		return jdbc.query(PUBLISHED_SELECT + PUBLISHED_FROM + PUBLISHED_WHERE + " AND f.id = ?", source(), now(), now(), id)
			.stream()
			.findFirst();
	}

	private Optional<Source> workingSource(UUID id) {
		return jdbc.query("""
				SELECT f.id, m.slug, m.fields, f.folder_path, f.name, f.title, f.data,
				       (SELECT MAX(version_no) FROM cf_fragment_versions v WHERE v.fragment_id = f.id) AS version_no,
				       f.published_at
				FROM cf_fragments f JOIN cf_models m ON m.id = f.model_id WHERE f.id = ?""", source(), id).stream().findFirst();
	}

	private List<FieldDef> fields(String raw) {
		List<FieldDef> fields = new ArrayList<>();
		for (JsonNode node : json.readTree(raw)) {
			fields.add(json.treeToValue(node, FieldDef.class));
		}
		return fields;
	}

	// ---- rendering ------------------------------------------------------------------------------------------

	private ObjectNode render(Source s, int depth, boolean working, Set<UUID> path) {
		path.add(s.id());
		ObjectNode node = NODES.objectNode();
		node.put("id", s.id().toString());
		node.put("model", s.model());
		node.put("folder", s.folder());
		node.put("name", s.name());
		node.put("title", s.title());
		if (s.version() == null) {
			node.putNull("version");
		}
		else {
			node.put("version", s.version());
		}
		node.put("publishedAt", s.publishedAt() == null ? null : s.publishedAt().toString());
		ObjectNode data = node.putObject("data");
		for (FieldDef field : s.fields()) {
			JsonNode raw = s.data().get(field.name());
			data.set(field.name(), raw == null || raw.isNull() ? NullNode.getInstance() : value(field, raw, depth, working, path));
		}
		path.remove(s.id());
		return node;
	}

	private JsonNode value(FieldDef field, JsonNode raw, int depth, boolean working, Set<UUID> path) {
		if (raw.isArray()) {
			ArrayNode items = NODES.arrayNode();
			raw.forEach(item -> {
				JsonNode resolved = single(field, item, depth, working, path);
				// A list keeps only what still resolves (no holes for an unpublished fragment or a hidden product)
				if (!resolved.isNull()) {
					items.add(resolved);
				}
			});
			return items;
		}
		return single(field, raw, depth, working, path);
	}

	private JsonNode single(FieldDef field, JsonNode raw, int depth, boolean working, Set<UUID> path) {
		Type type = field.typeEnum();
		return switch (type) {
			case MARKDOWN -> markdown(raw.asString(""));
			case ASSET -> asset(raw.asString(""));
			case PRODUCT -> raw.canConvertToExactIntegral() ? productCard(raw.asLong()) : NullNode.getInstance();
			case FRAGMENT -> fragment(raw.asString(""), depth, working, path);
			default -> raw;
		};
	}

	/** An asset as the API shows it: {id, kind, title, url, alt, width, height, pageCount, renditions, stableUrl}; null node when gone. */
	public JsonNode asset(String rawId) {
		UUID id = uuid(rawId);
		if (id == null) {
			return NullNode.getInstance();
		}
		return jdbc.query("SELECT id, kind, title, url, alt, width, height, page_count, file_name FROM dam_assets WHERE id = ?",
				(rs, n) -> {
					AssetTypes.Kind kind = AssetTypes.Kind.valueOf(rs.getString("kind"));
					ObjectNode a = NODES.objectNode();
					a.put("id", id.toString());
					a.put("kind", kind.name());
					a.put("title", rs.getString("title"));
					a.put("url", rs.getString("url"));
					a.put("alt", rs.getString("alt"));
					putInt(a, "width", (Integer) rs.getObject("width"));
					putInt(a, "height", (Integer) rs.getObject("height"));
					putInt(a, "pageCount", (Integer) rs.getObject("page_count"));
					a.set("renditions", json.valueToTree(AssetRenditions.of(rs.getString("url"), kind)));
					a.put("stableUrl", DamAssetService.stableUrl(id, rs.getString("file_name")));
					return (JsonNode) a;
				}, id).stream().findFirst().orElse(NullNode.getInstance());
	}

	/** Only a product on sale (shown and priced); its current price includes a running promotion. */
	public JsonNode productCard(long id) {
		return products.findById(id).filter(p -> p.isActive() && p.getPrice() != null && p.getPrice() > 0).<JsonNode>map(p -> {
			ObjectNode o = NODES.objectNode();
			o.put("id", p.getId());
			o.put("slug", p.getSlug());
			o.put("name", p.getName());
			o.put("price", pricing.priceOf(p).price());
			var images = productImages.findByProductIdOrderByPrimaryDescPositionAsc(p.getId());
			o.put("image", images.isEmpty() ? null : images.get(0).getUrl());
			return o;
		}).orElse(NullNode.getInstance());
	}

	private JsonNode fragment(String rawId, int depth, boolean working, Set<UUID> path) {
		UUID id = uuid(rawId);
		if (id == null) {
			return NullNode.getInstance();
		}
		Optional<Source> nested = working ? workingSource(id) : publishedSource(id);
		if (nested.isEmpty()) {
			return NullNode.getInstance();
		}
		if (depth + 1 > MAX_DEPTH || path.contains(id)) {
			ObjectNode stub = NODES.objectNode();
			stub.put("id", id.toString());
			stub.put("model", nested.get().model());
			return stub;
		}
		return render(nested.get(), depth + 1, working, path);
	}

	private static void putInt(ObjectNode node, String key, Integer value) {
		if (value == null) {
			node.putNull(key);
		}
		else {
			node.put(key, value);
		}
	}

	private static UUID uuid(String raw) {
		try {
			return UUID.fromString(raw);
		}
		catch (IllegalArgumentException ex) {
			return null;
		}
	}
}
