package com.nutshop.content.site;

import com.nutshop.audit.AuditLog;
import com.nutshop.common.ApiException;
import com.nutshop.common.ConflictException;
import com.nutshop.common.Slugs;
import com.nutshop.common.TextFold;
import com.nutshop.content.ContentAudit;
import com.nutshop.content.ContentReferenceService;
import com.nutshop.content.ContentReferenceService.Target;
import com.nutshop.content.ContentReferenceService.TargetType;
import com.nutshop.content.ContentType;
import com.nutshop.content.PreviewTokenService;
import com.nutshop.content.fragment.CfDtos.PendingReference;
import com.nutshop.content.fragment.CfDtos.PreviewLink;
import com.nutshop.content.fragment.CfDtos.VersionRow;
import com.nutshop.content.fragment.CfFragmentService;
import com.nutshop.content.fragment.FragmentValidator;
import com.nutshop.content.fragment.FragmentValidator.Mode;
import com.nutshop.content.fragment.RefSummaries;
import com.nutshop.content.site.SiteDtos.CreatePageRequest;
import com.nutshop.content.site.SiteDtos.PageDetail;
import com.nutshop.content.site.SiteDtos.SavePageRequest;
import com.nutshop.content.site.SiteDtos.TreeNode;
import com.nutshop.site.SiteController;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * CMS pages in the Author environment. A page's path is its parent's path plus its name; renaming or moving a page
 * rewrites the paths below it and keeps every old path as a 301 redirect. Saving writes the working copy and a new
 * version and refreshes content_references; publishing points the page at its latest version (fragments it uses
 * must be published too, or along with it). Top-level names may not collide with the app's fixed routes.
 */
@Service
public class SitePageService {

	static final int MAX_PATH_LENGTH = 500;

	record Row(UUID id, UUID parentId, String name, String path, String template, String title, JsonNode content,
			JsonNode properties, String status, UUID publishedVersionId, Instant publishedAt, Instant publishAt,
			Instant unpublishAt, Instant createdAt, String createdByName, Instant updatedAt, String updatedByName) {
	}

	private final JdbcTemplate jdbc;
	private final JsonMapper json;
	private final ComponentRegistry registry;
	private final ReservedPaths reserved;
	private final PageValidator.Lookup lookup;
	private final ContentReferenceService references;
	private final PreviewTokenService previews;
	private final CfFragmentService fragments;
	private final RefSummaries refSummaries;
	private final PageDelivery delivery;
	private final SiteController site;
	private final AuditLog audit;

	public SitePageService(JdbcTemplate jdbc, JsonMapper json, ComponentRegistry registry, ReservedPaths reserved,
			FragmentValidator.Lookup fragmentLookup, ContentReferenceService references, PreviewTokenService previews,
			CfFragmentService fragments, RefSummaries refSummaries, PageDelivery delivery, SiteController site,
			AuditLog audit) {
		this.jdbc = jdbc;
		this.json = json;
		this.registry = registry;
		this.reserved = reserved;
		this.lookup = new JdbcPageLookup(fragmentLookup, jdbc);
		this.references = references;
		this.previews = previews;
		this.fragments = fragments;
		this.refSummaries = refSummaries;
		this.delivery = delivery;
		this.site = site;
		this.audit = audit;
	}

	// ---- reading --------------------------------------------------------------------------------------------

	/** Every page as a tree: top-level pages first, children by their order. */
	@Transactional(readOnly = true)
	public List<TreeNode> tree() {
		record Flat(UUID id, UUID parentId, String name, String path, String title, String template, String status,
				int sortOrder, Instant updatedAt) {
		}
		List<Flat> rows = jdbc.query("""
				SELECT id, parent_id, name, path, title, template, status, sort_order, updated_at FROM site_pages
				ORDER BY sort_order, title""", (rs, n) -> new Flat(rs.getObject("id", UUID.class),
				rs.getObject("parent_id", UUID.class), rs.getString("name"), rs.getString("path"), rs.getString("title"),
				rs.getString("template"), rs.getString("status"), rs.getInt("sort_order"),
				rs.getTimestamp("updated_at").toInstant()));
		Map<UUID, List<TreeNode>> children = new LinkedHashMap<>();
		rows.forEach(r -> children.put(r.id(), new ArrayList<>()));
		List<TreeNode> roots = new ArrayList<>();
		Map<UUID, TreeNode> nodes = new LinkedHashMap<>();
		for (Flat r : rows) {
			nodes.put(r.id(), new TreeNode(r.id(), r.parentId(), r.name(), r.path(), r.title(), r.template(), r.status(),
					r.sortOrder(), r.updatedAt(), children.get(r.id())));
		}
		for (Flat r : rows) {
			TreeNode node = nodes.get(r.id());
			if (r.parentId() == null || !children.containsKey(r.parentId())) {
				roots.add(node);
			}
			else {
				children.get(r.parentId()).add(node);
			}
		}
		return roots;
	}

	@Transactional(readOnly = true)
	public PageDetail detail(UUID id) {
		Row p = find(id, false);
		List<String> oldPaths = jdbc.queryForList(
				"SELECT old_path FROM site_page_path_history WHERE page_id = ? ORDER BY created_at DESC", String.class, id);
		return new PageDetail(p.id(), p.parentId(), p.name(), p.path(), p.template(), p.title(), p.content(),
				p.properties(), p.status(), p.publishedVersionId(), p.publishedAt(), p.publishAt(), p.unpublishAt(),
				p.createdAt(), p.createdByName(), p.updatedAt(), p.updatedByName(), versions(id),
				refSummaries.of(PageValidator.references(registry, p.content(), p.properties())), oldPaths);
	}

	@Transactional(readOnly = true)
	public List<VersionRow> versions(UUID id) {
		find(id, false);
		return jdbc.query("""
				SELECT v.id, v.version_no, v.title, v.comment, v.created_at, u.full_name AS created_by_name,
				       v.id = p.published_version_id AS published
				FROM site_page_versions v JOIN site_pages p ON p.id = v.page_id LEFT JOIN users u ON u.id = v.created_by
				WHERE v.page_id = ? ORDER BY v.version_no DESC""",
				(rs, n) -> new VersionRow(rs.getObject("id", UUID.class), rs.getInt("version_no"), rs.getString("title"),
						rs.getString("comment"), rs.getTimestamp("created_at").toInstant(), rs.getString("created_by_name"),
						rs.getBoolean("published")),
				id);
	}

	// ---- writing --------------------------------------------------------------------------------------------

	/** A new empty page (version 1) under {@code parentId} (top level when null). */
	@Transactional
	public PageDetail create(CreatePageRequest req, UUID actorId) {
		if (!registry.isTemplate(req.template())) {
			throw invalid(Map.of("template", "Mẫu trang không hợp lệ"));
		}
		Row parent = req.parentId() == null ? null : find(req.parentId(), true);
		String name = slug(StringUtils.hasText(req.name()) ? req.name() : req.title());
		String path = checkedPath(parent, name, null);
		String title = req.title().strip();
		ObjectNode content = json.createObjectNode();
		content.putObject("regions").putArray("main");
		ObjectNode properties = json.createObjectNode();
		int order = jdbc.queryForObject(
				"SELECT COALESCE(MAX(sort_order), -1) + 1 FROM site_pages WHERE parent_id IS NOT DISTINCT FROM ?", Integer.class,
				parent == null ? null : parent.id());
		UUID id = jdbc.queryForObject("""
				INSERT INTO site_pages (parent_id, name, path, template, title, content, properties, sort_order, created_by,
				                        updated_by)
				VALUES (?, ?, ?, ?, ?, CAST(? AS jsonb), CAST(? AS jsonb), ?, ?, ?) RETURNING id""", UUID.class,
				parent == null ? null : parent.id(), name, path, req.template(), title, content.toString(),
				properties.toString(), order, actorId, actorId);
		insertVersion(id, 1, title, content, properties, "Tạo mới", actorId);
		// A live page wins over an old path that redirected here
		jdbc.update("DELETE FROM site_page_path_history WHERE old_path = ?", path);
		audit.entry(ContentAudit.CONTENT_CREATED, ContentAudit.entityType(ContentType.PAGE), id, title)
			.by(actorId)
			.changes(null, Map.of("path", path, "template", req.template()))
			.record();
		return detail(id);
	}

	/** New working copy (and version, when it changed) and publish window. */
	@Transactional
	public PageDetail save(UUID id, SavePageRequest req, UUID actorId) {
		Row p = find(id, true);
		PageValidator.Result result = PageValidator.validate(registry, p.template(), req.content(), req.properties(),
				Mode.DRAFT, lookup);
		Map<String, String> errors = new LinkedHashMap<>(result.errors());
		if (req.publishAt() != null && req.unpublishAt() != null && !req.publishAt().isBefore(req.unpublishAt())) {
			errors.put("unpublishAt", "Thời điểm gỡ phải sau thời điểm đăng");
		}
		if (!errors.isEmpty()) {
			throw invalid(errors);
		}
		String title = req.title().strip();
		Integer versionNo = writeWorkingCopy(p, title, result.content(), result.properties(), clean(req.comment()), actorId);
		boolean windowChanged = !Objects.equals(p.publishAt(), req.publishAt()) || !Objects.equals(p.unpublishAt(), req.unpublishAt());
		if (windowChanged) {
			jdbc.update("UPDATE site_pages SET publish_at = ?, unpublish_at = ?, updated_at = now(), updated_by = ? WHERE id = ?",
					timestamp(req.publishAt()), timestamp(req.unpublishAt()), actorId, id);
			if (p.publishedVersionId() != null) {
				publicChanged();
			}
		}
		if (versionNo != null || windowChanged) {
			refreshReferences(id);
			Map<String, Object> before = new LinkedHashMap<>();
			before.put("title", p.title());
			before.put("publishAt", p.publishAt());
			before.put("unpublishAt", p.unpublishAt());
			Map<String, Object> after = new LinkedHashMap<>();
			after.put("title", title);
			after.put("publishAt", req.publishAt());
			after.put("unpublishAt", req.unpublishAt());
			if (versionNo != null) {
				after.put("version", versionNo);
			}
			audit.entry(ContentAudit.CONTENT_UPDATED, ContentAudit.entityType(ContentType.PAGE), id, title)
				.by(actorId)
				.changes(before, after)
				.reason(clean(req.comment()))
				.record();
		}
		return detail(id);
	}

	/**
	 * Under another parent (null = top level) and/or at another position among its siblings. A new parent changes the
	 * path of the page and everything below it; the old paths redirect.
	 */
	@Transactional
	public PageDetail move(UUID id, UUID parentId, Integer position, UUID actorId) {
		Row p = find(id, true);
		Row parent = parentId == null ? null : find(parentId, true);
		if (parent != null && (parent.id().equals(id) || parent.path().startsWith(p.path() + "/"))) {
			throw invalid(Map.of("parentId", "Không chuyển trang vào bên trong chính nó"));
		}
		String oldPath = p.path();
		boolean parentChanged = !Objects.equals(p.parentId(), parentId);
		String newPath = oldPath;
		if (parentChanged) {
			newPath = checkedPath(parent, p.name(), id);
			changePath(oldPath, newPath);
			jdbc.update("UPDATE site_pages SET parent_id = ? WHERE id = ?", parentId, id);
		}
		List<UUID> siblings = new ArrayList<>(jdbc.queryForList(
				"SELECT id FROM site_pages WHERE parent_id IS NOT DISTINCT FROM ? AND id <> ? ORDER BY sort_order, title",
				UUID.class, parentId, id));
		int at = position == null ? siblings.size() : Math.max(0, Math.min(position, siblings.size()));
		siblings.add(at, id);
		for (int i = 0; i < siblings.size(); i++) {
			jdbc.update("UPDATE site_pages SET sort_order = ? WHERE id = ?", i, siblings.get(i));
		}
		jdbc.update("UPDATE site_pages SET updated_at = now(), updated_by = ? WHERE id = ?", actorId, id);
		if (parentChanged) {
			audit.entry(ContentAudit.CONTENT_MOVED, ContentAudit.entityType(ContentType.PAGE), id, p.title())
				.by(actorId)
				.changes(Map.of("path", oldPath), Map.of("path", newPath))
				.record();
			publicChanged();
		}
		return detail(id);
	}

	/** A new name (last path segment); the old paths of the page and its children redirect. */
	@Transactional
	public PageDetail rename(UUID id, String rawName, UUID actorId) {
		Row p = find(id, true);
		String name = slug(rawName);
		if (name.equals(p.name())) {
			return detail(id);
		}
		Row parent = p.parentId() == null ? null : find(p.parentId(), false);
		String newPath = checkedPath(parent, name, id);
		changePath(p.path(), newPath);
		jdbc.update("UPDATE site_pages SET name = ?, updated_at = now(), updated_by = ? WHERE id = ?", name, actorId, id);
		audit.entry(ContentAudit.CONTENT_MOVED, ContentAudit.entityType(ContentType.PAGE), id, p.title())
			.by(actorId)
			.changes(Map.of("path", p.path()), Map.of("path", newPath))
			.record();
		publicChanged();
		return detail(id);
	}

	/** The working copy becomes that version again (as a new version). */
	@Transactional
	public PageDetail rollback(UUID id, UUID versionId, UUID actorId) {
		Row p = find(id, true);
		record Version(int no, String title, JsonNode content, JsonNode properties) {
		}
		Version version = jdbc.query("SELECT version_no, title, content, properties FROM site_page_versions WHERE id = ? AND page_id = ?",
				(rs, n) -> new Version(rs.getInt("version_no"), rs.getString("title"), json.readTree(rs.getString("content")),
						json.readTree(rs.getString("properties"))),
				versionId, id).stream().findFirst().orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,
						"VERSION_NOT_FOUND", "Không tìm thấy phiên bản"));
		PageValidator.Result result = PageValidator.validate(registry, p.template(), version.content(), version.properties(),
				Mode.DRAFT, lookup);
		if (!result.valid()) {
			throw new ConflictException("ROLLBACK_INVALID",
					"Phiên bản " + version.no() + " không còn hợp lệ (component đã đổi hoặc nội dung tham chiếu đã bị xoá)")
				.withProperty("errors", result.errors());
		}
		String reason = "Khôi phục phiên bản " + version.no();
		Integer versionNo = writeWorkingCopy(p, version.title(), result.content(), result.properties(), reason, actorId);
		if (versionNo != null) {
			refreshReferences(id);
			audit.entry(ContentAudit.CONTENT_ROLLED_BACK, ContentAudit.entityType(ContentType.PAGE), id, version.title())
				.by(actorId)
				.changes(Map.of("title", p.title()), Map.of("title", version.title(), "version", versionNo))
				.reason(reason)
				.record();
		}
		return detail(id);
	}

	/**
	 * Publishes the latest version once complete. Fragments it uses that were never published: 409
	 * UNPUBLISHED_REFERENCES with the list, or published along when {@code publishReferences}.
	 */
	@Transactional
	public PageDetail publish(UUID id, boolean publishReferences, UUID actorId) {
		Row p = find(id, true);
		PageValidator.Result result = PageValidator.validate(registry, p.template(), p.content(), p.properties(),
				Mode.PUBLISH, lookup);
		if (!result.valid()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PAGE", "Trang chưa đủ dữ liệu để publish")
				.withProperty("errors", result.errors());
		}
		List<PendingReference> pending = unpublishedFragments(result.references());
		if (!pending.isEmpty()) {
			if (!publishReferences) {
				throw new ConflictException("UNPUBLISHED_REFERENCES",
						"Trang dùng " + pending.size() + " fragment chưa publish. Hãy publish chúng cùng lúc.")
					.withProperty("references", pending);
			}
			for (PendingReference fragment : pending) {
				fragments.publish(fragment.id(), true, actorId);
			}
		}
		UUID latest = jdbc.queryForObject(
				"SELECT id FROM site_page_versions WHERE page_id = ? ORDER BY version_no DESC LIMIT 1", UUID.class, id);
		if (!latest.equals(p.publishedVersionId())) {
			jdbc.update("""
					UPDATE site_pages SET published_version_id = ?, published_at = now(), status = 'PUBLISHED',
					       updated_at = now(), updated_by = ?
					WHERE id = ?""", latest, actorId, id);
			refreshReferences(id);
			audit.entry(ContentAudit.CONTENT_PUBLISHED, ContentAudit.entityType(ContentType.PAGE), id, p.title())
				.by(actorId)
				.changes(Map.of("status", p.status()), Map.of("status", "PUBLISHED"))
				.reason(pending.isEmpty() ? null : "Publish cùng " + pending.size() + " fragment")
				.record();
			publicChanged();
		}
		return detail(id);
	}

	@Transactional
	public PageDetail unpublish(UUID id, UUID actorId) {
		Row p = find(id, true);
		if (p.publishedVersionId() != null) {
			jdbc.update("""
					UPDATE site_pages SET published_version_id = NULL, published_at = NULL, status = 'DRAFT', updated_at = now(),
					       updated_by = ?
					WHERE id = ?""", actorId, id);
			refreshReferences(id);
			audit.entry(ContentAudit.CONTENT_UNPUBLISHED, ContentAudit.entityType(ContentType.PAGE), id, p.title())
				.by(actorId)
				.changes(Map.of("status", p.status()), Map.of("status", "DRAFT"))
				.record();
			publicChanged();
		}
		return detail(id);
	}

	/**
	 * Deletes the page with its versions and old paths. A page with children: 409 PAGE_HAS_CHILDREN (childCount)
	 * unless {@code includeChildren}, then they go too.
	 */
	@Transactional
	public void delete(UUID id, boolean includeChildren, UUID actorId) {
		Row p = find(id, true);
		String below = TextFold.escapeLike(p.path()) + "/%";
		List<UUID> children = jdbc.queryForList("SELECT id FROM site_pages WHERE path LIKE ? ESCAPE '\\' ORDER BY length(path) DESC",
				UUID.class, below);
		if (!children.isEmpty() && !includeChildren) {
			throw new ConflictException("PAGE_HAS_CHILDREN",
					"Trang có " + children.size() + " trang con. Xác nhận xoá cả trang con để tiếp tục.")
				.withProperty("childCount", children.size());
		}
		List<UUID> all = new ArrayList<>(children);
		all.add(id);
		for (UUID page : all) {
			if (references.isReferenced(TargetType.PAGE, page.toString())) {
				throw new ConflictException("PAGE_IN_USE", "Trang đang được nội dung khác tham chiếu, chưa xoá được.");
			}
		}
		for (UUID page : all) {
			references.replace(ContentType.PAGE, page.toString(), Set.of());
			previews.revokeAll(ContentType.PAGE, page.toString());
		}
		jdbc.update("DELETE FROM site_pages WHERE path = ? OR path LIKE ? ESCAPE '\\'", p.path(), below);
		audit.entry(ContentAudit.CONTENT_DELETED, ContentAudit.entityType(ContentType.PAGE), id, p.title())
			.by(actorId)
			.changes(Map.of("path", p.path(), "status", p.status()), null)
			.reason(children.isEmpty() ? null : "Xoá kèm " + children.size() + " trang con")
			.record();
		publicChanged();
	}

	/** A link that shows the working copy to anyone holding it, for 24 hours (also the editor's preview pane). */
	@Transactional
	public PreviewLink previewLink(UUID id, UUID actorId) {
		find(id, false);
		var issued = previews.issue(ContentType.PAGE, id.toString(), actorId);
		return new PreviewLink("/author/preview?token=" + issued.rawToken(), issued.expiresAt());
	}

	// ---- helpers --------------------------------------------------------------------------------------------

	private static final String ROW_SELECT = """
			SELECT p.*, cu.full_name AS created_by_name, uu.full_name AS updated_by_name
			FROM site_pages p LEFT JOIN users cu ON cu.id = p.created_by LEFT JOIN users uu ON uu.id = p.updated_by
			WHERE p.id = ?""";

	private RowMapper<Row> row() {
		return (rs, n) -> new Row(rs.getObject("id", UUID.class), rs.getObject("parent_id", UUID.class), rs.getString("name"),
				rs.getString("path"), rs.getString("template"), rs.getString("title"), json.readTree(rs.getString("content")),
				json.readTree(rs.getString("properties")), rs.getString("status"),
				rs.getObject("published_version_id", UUID.class), instant(rs.getTimestamp("published_at")),
				instant(rs.getTimestamp("publish_at")), instant(rs.getTimestamp("unpublish_at")),
				rs.getTimestamp("created_at").toInstant(), rs.getString("created_by_name"),
				rs.getTimestamp("updated_at").toInstant(), rs.getString("updated_by_name"));
	}

	private Row find(UUID id, boolean lock) {
		return jdbc.query(ROW_SELECT + (lock ? " FOR UPDATE OF p" : ""), row(), id)
			.stream()
			.findFirst()
			.orElseThrow(SitePageService::notFound);
	}

	private static String slug(String raw) {
		String name = Slugs.from(raw == null ? "" : raw);
		if (name.isEmpty() || name.length() > 120) {
			throw invalid(Map.of("name", "Tên cần có chữ hoặc số, tối đa 120 ký tự"));
		}
		return name;
	}

	/** The path for {@code name} under {@code parent}: not a fixed route, not too long, not taken by another page. */
	private String checkedPath(Row parent, String name, UUID self) {
		String path = (parent == null ? "" : parent.path()) + "/" + name;
		if (parent == null && reserved.isReserved(path)) {
			String message = "Đường dẫn " + path + " trùng một trang có sẵn của web, hãy chọn tên khác";
			throw new ApiException(HttpStatus.BAD_REQUEST, "RESERVED_PATH", message).withProperty("errors", Map.of("name", message));
		}
		if (path.length() > MAX_PATH_LENGTH) {
			throw invalid(Map.of("name", "Đường dẫn quá dài (tối đa " + MAX_PATH_LENGTH + " ký tự)"));
		}
		Boolean taken = jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM site_pages WHERE path = ? AND id IS DISTINCT FROM ?)",
				Boolean.class, path, self);
		if (Boolean.TRUE.equals(taken)) {
			throw new ConflictException("PAGE_EXISTS", "Đã có trang ở " + path)
				.withProperty("errors", Map.of("name", "Đường dẫn đã có trang khác"));
		}
		return path;
	}

	/** The page and everything below it move from oldPath to newPath; the old paths keep redirecting. */
	private void changePath(String oldPath, String newPath) {
		String below = TextFold.escapeLike(oldPath) + "/%";
		jdbc.update("""
				INSERT INTO site_page_path_history (old_path, page_id)
				SELECT path, id FROM site_pages WHERE path = ? OR path LIKE ? ESCAPE '\\'
				ON CONFLICT (old_path) DO UPDATE SET page_id = EXCLUDED.page_id, created_at = now()""", oldPath, below);
		jdbc.update("UPDATE site_pages SET path = ? || substr(path, ?) WHERE path = ? OR path LIKE ? ESCAPE '\\'", newPath,
				oldPath.length() + 1, oldPath, below);
		// A live page always wins: no history entry may shadow a current path
		jdbc.update("DELETE FROM site_page_path_history h WHERE EXISTS (SELECT 1 FROM site_pages p WHERE p.path = h.old_path)");
	}

	private Integer writeWorkingCopy(Row p, String title, ObjectNode content, ObjectNode properties, String comment,
			UUID actorId) {
		if (title.equals(p.title()) && content.equals(p.content()) && properties.equals(p.properties())) {
			return null;
		}
		int versionNo = jdbc.queryForObject("SELECT COALESCE(MAX(version_no), 0) + 1 FROM site_page_versions WHERE page_id = ?",
				Integer.class, p.id());
		insertVersion(p.id(), versionNo, title, content, properties, comment, actorId);
		String status = "DRAFT";
		if (p.publishedVersionId() != null) {
			boolean same = Boolean.TRUE.equals(jdbc.queryForObject("""
					SELECT title = ? AND content = CAST(? AS jsonb) AND properties = CAST(? AS jsonb)
					FROM site_page_versions WHERE id = ?""", Boolean.class, title, content.toString(), properties.toString(),
					p.publishedVersionId()));
			status = same ? "PUBLISHED" : "MODIFIED";
		}
		jdbc.update("""
				UPDATE site_pages SET title = ?, content = CAST(? AS jsonb), properties = CAST(? AS jsonb), status = ?,
				       updated_at = now(), updated_by = ?
				WHERE id = ?""", title, content.toString(), properties.toString(), status, actorId, p.id());
		return versionNo;
	}

	private void insertVersion(UUID pageId, int versionNo, String title, JsonNode content, JsonNode properties, String comment,
			UUID actorId) {
		jdbc.update("""
				INSERT INTO site_page_versions (page_id, version_no, title, content, properties, comment, created_by)
				VALUES (?, ?, ?, CAST(? AS jsonb), CAST(? AS jsonb), ?, ?)""", pageId, versionNo, title, content.toString(),
				properties.toString(), comment, actorId);
	}

	/** Fragments referenced by id that were never published. */
	private List<PendingReference> unpublishedFragments(Set<Target> targets) {
		List<String> ids = targets.stream().filter(t -> t.type() == TargetType.FRAGMENT).map(Target::id).toList();
		if (ids.isEmpty()) {
			return List.of();
		}
		return jdbc.query("""
				SELECT f.id, f.title, m.slug FROM cf_fragments f JOIN cf_models m ON m.id = f.model_id
				WHERE f.id = ANY (CAST(? AS uuid[])) AND f.published_version_id IS NULL ORDER BY f.title""",
				(rs, n) -> new PendingReference(rs.getObject("id", UUID.class), rs.getString("title"), rs.getString("slug")),
				(Object) ids.toArray(String[]::new));
	}

	/** content_references = what the working copy uses plus what the published version uses. */
	private void refreshReferences(UUID id) {
		Row p = find(id, false);
		Set<Target> targets = new LinkedHashSet<>(PageValidator.references(registry, p.content(), p.properties()));
		if (p.publishedVersionId() != null) {
			jdbc.query("SELECT content::text AS content, properties::text AS properties FROM site_page_versions WHERE id = ?",
					rs -> {
						targets.addAll(PageValidator.references(registry, json.readTree(rs.getString("content")),
								json.readTree(rs.getString("properties"))));
					}, p.publishedVersionId());
		}
		references.replace(ContentType.PAGE, id.toString(), targets);
	}

	/** What the public sees changed: page cache and sitemap are refreshed once committed. */
	private void publicChanged() {
		Runnable refresh = () -> {
			delivery.evictAll();
			site.clearSitemapCache();
		};
		if (!TransactionSynchronizationManager.isSynchronizationActive()) {
			refresh.run();
			return;
		}
		TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
			@Override
			public void afterCommit() {
				refresh.run();
			}
		});
	}

	private static Instant instant(Timestamp ts) {
		return ts == null ? null : ts.toInstant();
	}

	private static Timestamp timestamp(Instant instant) {
		return instant == null ? null : Timestamp.from(instant);
	}

	private static String clean(String value) {
		return value == null || value.isBlank() ? null : value.strip();
	}

	static ApiException invalid(Map<String, String> errors) {
		return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PAGE", "Dữ liệu trang chưa hợp lệ").withProperty("errors", errors);
	}

	static ApiException notFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "PAGE_NOT_FOUND", "Không tìm thấy trang");
	}
}
