package com.nutshop.content.fragment;

import com.nutshop.audit.AuditLog;
import com.nutshop.common.ApiException;
import com.nutshop.common.ConflictException;
import com.nutshop.common.PageResponse;
import com.nutshop.common.Slugs;
import com.nutshop.common.TextFold;
import com.nutshop.content.ContentAudit;
import com.nutshop.content.ContentReferenceService;
import com.nutshop.content.ContentReferenceService.Target;
import com.nutshop.content.ContentReferenceService.TargetType;
import com.nutshop.content.ContentType;
import com.nutshop.content.PreviewTokenService;
import com.nutshop.content.fragment.CfDtos.CreateFragmentRequest;
import com.nutshop.content.fragment.CfDtos.FragmentDetail;
import com.nutshop.content.fragment.CfDtos.FragmentRow;
import com.nutshop.content.fragment.CfDtos.ModelRef;
import com.nutshop.content.fragment.CfDtos.PendingReference;
import com.nutshop.content.fragment.CfDtos.PreviewLink;
import com.nutshop.content.fragment.CfDtos.RefSummary;
import com.nutshop.content.fragment.CfDtos.SaveFragmentRequest;
import com.nutshop.content.fragment.CfDtos.UsageRow;
import com.nutshop.content.fragment.CfDtos.VersionRow;
import com.nutshop.content.fragment.CfModelService.Model;
import com.nutshop.content.fragment.FragmentValidator.Mode;
import com.nutshop.content.fragment.FragmentValidator.Result;
import com.nutshop.dam.AssetRenditions;
import com.nutshop.media.AssetTypes;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Content Fragments in the Author environment. Every save that changes something writes the working copy and a new
 * numbered version, and refreshes content_references (what the working copy and the published version point to).
 * Publishing points the fragment at its latest version; editing afterwards makes it MODIFIED while the public keeps
 * seeing the published version. Drafts may be incomplete; publishing checks required fields too.
 */
@Service
public class CfFragmentService {

	static final Pattern FOLDER = Pattern.compile("^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$");
	static final int DEFAULT_PAGE_SIZE = 30;
	static final int MAX_PAGE_SIZE = 100;
	private static final String FOLD = "lower(translate(%s, '" + TextFold.ACCENTED + "', '" + TextFold.PLAIN + "'))";

	/** A fragment row with its working copy. */
	record Row(UUID id, long modelId, String folderPath, String name, String title, JsonNode data, String status,
			UUID publishedVersionId, Instant publishedAt, Instant publishAt, Instant unpublishAt, Instant createdAt,
			String createdByName, Instant updatedAt, String updatedByName) {
	}

	private final JdbcTemplate jdbc;
	private final JsonMapper json;
	private final CfModelService models;
	private final FragmentValidator.Lookup lookup;
	private final ContentReferenceService references;
	private final PreviewTokenService previews;
	private final FragmentDelivery delivery;
	private final AuditLog audit;

	public CfFragmentService(JdbcTemplate jdbc, JsonMapper json, CfModelService models, FragmentValidator.Lookup lookup,
			ContentReferenceService references, PreviewTokenService previews, FragmentDelivery delivery, AuditLog audit) {
		this.jdbc = jdbc;
		this.json = json;
		this.models = models;
		this.lookup = lookup;
		this.references = references;
		this.previews = previews;
		this.delivery = delivery;
		this.audit = audit;
	}

	// ---- reading --------------------------------------------------------------------------------------------

	/**
	 * Most recently edited first. {@code folder} includes the folders below it; {@code q} matches title and name
	 * without case or accents; {@code modelSlugs} limits to some models (the fragment picker).
	 */
	@Transactional(readOnly = true)
	public PageResponse<FragmentRow> list(Long modelId, List<String> modelSlugs, String folder, String status, String q,
			int page, int size) {
		StringBuilder where = new StringBuilder(" WHERE TRUE");
		List<Object> args = new ArrayList<>();
		if (modelId != null) {
			where.append(" AND f.model_id = ?");
			args.add(modelId);
		}
		if (modelSlugs != null && !modelSlugs.isEmpty()) {
			where.append(" AND m.slug = ANY (?)");
			args.add(modelSlugs.toArray(String[]::new));
		}
		if (StringUtils.hasText(folder) && !folder.strip().equals("/")) {
			String path = folder.strip().replaceAll("/+$", "");
			where.append(" AND (f.folder_path = ? OR f.folder_path LIKE ? ESCAPE '\\')");
			args.add(path);
			args.add(TextFold.escapeLike(path) + "/%");
		}
		if (StringUtils.hasText(status)) {
			where.append(" AND f.status = ?");
			args.add(status.strip());
		}
		if (StringUtils.hasText(q)) {
			String pattern = "%" + TextFold.escapeLike(TextFold.fold(q.strip())) + "%";
			where.append(" AND (").append(FOLD.formatted("f.title")).append(" LIKE ? ESCAPE '\\' OR f.name LIKE ? ESCAPE '\\')");
			args.add(pattern);
			args.add(pattern);
		}
		int pageSize = size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
		int index = Math.max(page, 0);
		String from = " FROM cf_fragments f JOIN cf_models m ON m.id = f.model_id LEFT JOIN users u ON u.id = f.updated_by";
		long total = jdbc.queryForObject("SELECT COUNT(*)" + from + where, Long.class, args.toArray());
		List<Object> pageArgs = new ArrayList<>(args);
		pageArgs.add(pageSize);
		pageArgs.add((long) index * pageSize);
		List<FragmentRow> items = jdbc.query("""
				SELECT f.id, f.model_id, m.slug, m.name AS model_name, f.folder_path, f.name, f.title, f.status,
				       f.published_at, f.updated_at, u.full_name AS updated_by_name""" + from + where
				+ " ORDER BY f.updated_at DESC, f.id LIMIT ? OFFSET ?",
				(rs, n) -> new FragmentRow(rs.getObject("id", UUID.class),
						new ModelRef(rs.getLong("model_id"), rs.getString("slug"), rs.getString("model_name")),
						rs.getString("folder_path"), rs.getString("name"), rs.getString("title"), rs.getString("status"),
						instant(rs.getTimestamp("published_at")), rs.getTimestamp("updated_at").toInstant(),
						rs.getString("updated_by_name")),
				pageArgs.toArray());
		return new PageResponse<>(items, index, pageSize, total, (int) ((total + pageSize - 1) / pageSize));
	}

	/** Every folder in use, for the filter. */
	@Transactional(readOnly = true)
	public List<String> folders() {
		return jdbc.queryForList("SELECT DISTINCT folder_path FROM cf_fragments ORDER BY folder_path", String.class);
	}

	@Transactional(readOnly = true)
	public FragmentDetail detail(UUID id) {
		Row f = find(id, false);
		var model = models.detail(f.modelId());
		return new FragmentDetail(f.id(), model, f.folderPath(), f.name(), f.title(), f.data(), f.status(),
				f.publishedVersionId(), f.publishedAt(), f.publishAt(), f.unpublishAt(), f.createdAt(), f.createdByName(),
				f.updatedAt(), f.updatedByName(), versions(id), usages(id), summaries(model.fields(), f.data()));
	}

	@Transactional(readOnly = true)
	public List<VersionRow> versions(UUID id) {
		find(id, false);
		return jdbc.query("""
				SELECT v.id, v.version_no, v.title, v.comment, v.created_at, u.full_name AS created_by_name,
				       v.id = f.published_version_id AS published
				FROM cf_fragment_versions v JOIN cf_fragments f ON f.id = v.fragment_id
				LEFT JOIN users u ON u.id = v.created_by
				WHERE v.fragment_id = ? ORDER BY v.version_no DESC""",
				(rs, n) -> new VersionRow(rs.getObject("id", UUID.class), rs.getInt("version_no"), rs.getString("title"),
						rs.getString("comment"), rs.getTimestamp("created_at").toInstant(), rs.getString("created_by_name"),
						rs.getBoolean("published")),
				id);
	}

	// ---- writing --------------------------------------------------------------------------------------------

	/** A new fragment (version 1) of an enabled model. */
	@Transactional
	public FragmentDetail create(CreateFragmentRequest req, UUID actorId) {
		Model model = models.get(req.modelId());
		if (!"ENABLED".equals(model.status())) {
			throw new ConflictException("MODEL_NOT_ENABLED", "Model “" + model.name() + "” chưa bật, chưa tạo fragment được");
		}
		Map<String, String> errors = new LinkedHashMap<>();
		String folder = StringUtils.hasText(req.folderPath()) ? req.folderPath().strip() : "/";
		if (folder.length() > 1) {
			folder = folder.replaceAll("/+$", "");
		}
		if (!FOLDER.matcher(folder).matches()) {
			errors.put("folderPath", "Thư mục dạng /faq hoặc /khuyen-mai/tet: chữ thường, số, gạch ngang");
		}
		String name = Slugs.from(StringUtils.hasText(req.name()) ? req.name() : req.title());
		if (name.isEmpty() || name.length() > 120) {
			errors.put("name", "Tên cần có chữ hoặc số, tối đa 120 ký tự");
		}
		Result result = FragmentValidator.validate(model.fields(), req.data(), Mode.DRAFT, lookup, null);
		errors.putAll(result.errors());
		if (!errors.isEmpty()) {
			throw invalid(errors);
		}
		String title = req.title().strip();
		UUID id;
		try {
			id = jdbc.queryForObject("""
					INSERT INTO cf_fragments (model_id, folder_path, name, title, data, model_version, created_by, updated_by)
					VALUES (?, ?, ?, ?, CAST(? AS jsonb), ?, ?, ?) RETURNING id""", UUID.class, model.id(), folder, name,
					title, result.data().toString(), model.version(), actorId, actorId);
		}
		catch (DuplicateKeyException ex) {
			throw new ConflictException("FRAGMENT_EXISTS", "Đã có fragment “" + name + "” trong thư mục " + folder)
				.withProperty("errors", Map.of("name", "Tên đã dùng trong thư mục này"));
		}
		insertVersion(id, 1, title, result.data(), model.version(), "Tạo mới", actorId);
		references.replace(ContentType.FRAGMENT, id.toString(), result.references());
		audit.entry(ContentAudit.CONTENT_CREATED, ContentAudit.entityType(ContentType.FRAGMENT), id, title)
			.by(actorId)
			.changes(null, Map.of("model", model.slug(), "folderPath", folder, "name", name, "version", 1))
			.record();
		return detail(id);
	}

	/** New working copy (and version, when it changed) and publish window. */
	@Transactional
	public FragmentDetail save(UUID id, SaveFragmentRequest req, UUID actorId) {
		Row f = find(id, true);
		Model model = models.get(f.modelId());
		Result result = FragmentValidator.validate(model.fields(), req.data(), Mode.DRAFT, lookup, id);
		Map<String, String> errors = new LinkedHashMap<>(result.errors());
		if (req.publishAt() != null && req.unpublishAt() != null && !req.publishAt().isBefore(req.unpublishAt())) {
			errors.put("unpublishAt", "Thời điểm gỡ phải sau thời điểm đăng");
		}
		if (!errors.isEmpty()) {
			throw invalid(errors);
		}
		String title = req.title().strip();
		Integer versionNo = writeWorkingCopy(f, model, title, result.data(), clean(req.comment()), actorId);
		boolean windowChanged = !Objects.equals(f.publishAt(), req.publishAt()) || !Objects.equals(f.unpublishAt(), req.unpublishAt());
		if (windowChanged) {
			jdbc.update("UPDATE cf_fragments SET publish_at = ?, unpublish_at = ?, updated_at = now(), updated_by = ? WHERE id = ?",
					timestamp(req.publishAt()), timestamp(req.unpublishAt()), actorId, id);
			if (f.publishedVersionId() != null) {
				delivery.evictAllAfterCommit();
			}
		}
		if (versionNo != null || windowChanged) {
			refreshReferences(id, model);
			Map<String, Object> before = new LinkedHashMap<>();
			before.put("title", f.title());
			before.put("publishAt", f.publishAt());
			before.put("unpublishAt", f.unpublishAt());
			Map<String, Object> after = new LinkedHashMap<>();
			after.put("title", title);
			after.put("publishAt", req.publishAt());
			after.put("unpublishAt", req.unpublishAt());
			if (versionNo != null) {
				after.put("version", versionNo);
			}
			audit.entry(ContentAudit.CONTENT_UPDATED, ContentAudit.entityType(ContentType.FRAGMENT), id, title)
				.by(actorId)
				.changes(before, after)
				.reason(clean(req.comment()))
				.record();
		}
		return detail(id);
	}

	/** The working copy becomes that version again (as a new version, so nothing is lost). */
	@Transactional
	public FragmentDetail rollback(UUID id, UUID versionId, UUID actorId) {
		Row f = find(id, true);
		record Version(int no, String title, JsonNode data) {
		}
		Version version = jdbc.query("SELECT version_no, title, data FROM cf_fragment_versions WHERE id = ? AND fragment_id = ?",
				(rs, n) -> new Version(rs.getInt("version_no"), rs.getString("title"), json.readTree(rs.getString("data"))),
				versionId, id).stream().findFirst().orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,
						"VERSION_NOT_FOUND", "Không tìm thấy phiên bản"));
		Model model = models.get(f.modelId());
		// Fields no longer in the model are dropped; values that no longer fit the model stop the rollback
		Result result = FragmentValidator.validate(model.fields(), version.data(), Mode.DRAFT, lookup, id);
		if (!result.valid()) {
			throw new ConflictException("ROLLBACK_INVALID",
					"Phiên bản " + version.no() + " không còn khớp model hiện tại (field đã đổi kiểu hoặc nội dung tham chiếu đã bị xoá)")
				.withProperty("errors", result.errors());
		}
		String reason = "Khôi phục phiên bản " + version.no();
		Integer versionNo = writeWorkingCopy(f, model, version.title(), result.data(), reason, actorId);
		if (versionNo != null) {
			refreshReferences(id, model);
			audit.entry(ContentAudit.CONTENT_ROLLED_BACK, ContentAudit.entityType(ContentType.FRAGMENT), id, version.title())
				.by(actorId)
				.changes(Map.of("title", f.title()), Map.of("title", version.title(), "version", versionNo))
				.reason(reason)
				.record();
		}
		return detail(id);
	}

	/**
	 * Publishes the latest version. Referenced fragments that were never published: 409 UNPUBLISHED_REFERENCES with
	 * the list, or published along (and theirs, all the way down) when {@code publishReferences}.
	 */
	@Transactional
	public FragmentDetail publish(UUID id, boolean publishReferences, UUID actorId) {
		Row root = find(id, true);
		List<PendingReference> pending = unpublishedReferences(root);
		if (!pending.isEmpty() && !publishReferences) {
			throw new ConflictException("UNPUBLISHED_REFERENCES",
					"Fragment này dùng " + pending.size() + " fragment chưa publish. Hãy publish chúng cùng lúc.")
				.withProperty("references", pending);
		}
		publishOne(root, actorId, null);
		Set<UUID> done = new LinkedHashSet<>(List.of(id));
		Deque<PendingReference> queue = new ArrayDeque<>(pending);
		while (!queue.isEmpty()) {
			PendingReference next = queue.poll();
			if (!done.add(next.id())) {
				continue;
			}
			Row ref = find(next.id(), true);
			if (ref.publishedVersionId() != null) {
				continue;
			}
			queue.addAll(unpublishedReferences(ref));
			publishOne(ref, actorId, root);
		}
		delivery.evictAllAfterCommit();
		return detail(id);
	}

	@Transactional
	public FragmentDetail unpublish(UUID id, UUID actorId) {
		Row f = find(id, true);
		if (f.publishedVersionId() != null) {
			jdbc.update("""
					UPDATE cf_fragments SET published_version_id = NULL, published_at = NULL, status = 'DRAFT',
					       updated_at = now(), updated_by = ?
					WHERE id = ?""", actorId, id);
			refreshReferences(id, models.get(f.modelId()));
			audit.entry(ContentAudit.CONTENT_UNPUBLISHED, ContentAudit.entityType(ContentType.FRAGMENT), id, f.title())
				.by(actorId)
				.changes(Map.of("status", f.status()), Map.of("status", "DRAFT"))
				.record();
			delivery.evictAllAfterCommit();
		}
		return detail(id);
	}

	/** Refused while a fragment or page uses it (409 FRAGMENT_IN_USE with the usages). Versions go with it. */
	@Transactional
	public void delete(UUID id, UUID actorId) {
		Row f = find(id, true);
		if (references.isReferenced(TargetType.FRAGMENT, id.toString())) {
			List<UsageRow> usages = usages(id);
			throw new ConflictException("FRAGMENT_IN_USE",
					"Fragment đang được dùng ở " + usages.size() + " nơi. Hãy gỡ khỏi các nơi đó trước khi xoá.")
				.withProperty("usages", usages);
		}
		references.replace(ContentType.FRAGMENT, id.toString(), Set.of());
		jdbc.update("DELETE FROM cf_fragments WHERE id = ?", id);
		previews.revokeAll(ContentType.FRAGMENT, id.toString());
		audit.entry(ContentAudit.CONTENT_DELETED, ContentAudit.entityType(ContentType.FRAGMENT), id, f.title())
			.by(actorId)
			.changes(Map.of("folderPath", f.folderPath(), "name", f.name(), "status", f.status()), null)
			.record();
		delivery.evictAllAfterCommit();
	}

	/** A link that shows the working copy to anyone holding it, for 24 hours. */
	@Transactional
	public PreviewLink previewLink(UUID id, UUID actorId) {
		find(id, false);
		var issued = previews.issue(ContentType.FRAGMENT, id.toString(), actorId);
		return new PreviewLink("/api/content/preview/fragments/" + id + "?token=" + issued.rawToken(), issued.expiresAt());
	}

	// ---- helpers --------------------------------------------------------------------------------------------

	private static final String ROW_SELECT = """
			SELECT f.*, cu.full_name AS created_by_name, uu.full_name AS updated_by_name
			FROM cf_fragments f LEFT JOIN users cu ON cu.id = f.created_by LEFT JOIN users uu ON uu.id = f.updated_by
			WHERE f.id = ?""";

	private RowMapper<Row> row() {
		return (rs, n) -> new Row(rs.getObject("id", UUID.class), rs.getLong("model_id"), rs.getString("folder_path"),
				rs.getString("name"), rs.getString("title"), json.readTree(rs.getString("data")), rs.getString("status"),
				rs.getObject("published_version_id", UUID.class), instant(rs.getTimestamp("published_at")),
				instant(rs.getTimestamp("publish_at")), instant(rs.getTimestamp("unpublish_at")),
				rs.getTimestamp("created_at").toInstant(), rs.getString("created_by_name"),
				rs.getTimestamp("updated_at").toInstant(), rs.getString("updated_by_name"));
	}

	private Row find(UUID id, boolean lock) {
		return jdbc.query(ROW_SELECT + (lock ? " FOR UPDATE OF f" : ""), row(), id)
			.stream()
			.findFirst()
			.orElseThrow(CfFragmentService::notFound);
	}

	/**
	 * Writes a new version and the working copy when title or data changed; returns the new version number, or null
	 * when nothing changed. The status follows: DRAFT while never published, PUBLISHED when the working copy equals
	 * the published version again, MODIFIED otherwise.
	 */
	private Integer writeWorkingCopy(Row f, Model model, String title, ObjectNode data, String comment, UUID actorId) {
		if (title.equals(f.title()) && data.equals(f.data())) {
			return null;
		}
		int versionNo = jdbc.queryForObject("SELECT COALESCE(MAX(version_no), 0) + 1 FROM cf_fragment_versions WHERE fragment_id = ?",
				Integer.class, f.id());
		insertVersion(f.id(), versionNo, title, data, model.version(), comment, actorId);
		String status = "DRAFT";
		if (f.publishedVersionId() != null) {
			boolean same = Boolean.TRUE.equals(jdbc.queryForObject(
					"SELECT title = ? AND data = CAST(? AS jsonb) FROM cf_fragment_versions WHERE id = ?", Boolean.class, title,
					data.toString(), f.publishedVersionId()));
			status = same ? "PUBLISHED" : "MODIFIED";
		}
		jdbc.update("""
				UPDATE cf_fragments SET title = ?, data = CAST(? AS jsonb), model_version = ?, status = ?, updated_at = now(),
				       updated_by = ?
				WHERE id = ?""", title, data.toString(), model.version(), status, actorId, f.id());
		return versionNo;
	}

	private void insertVersion(UUID fragmentId, int versionNo, String title, JsonNode data, int modelVersion, String comment,
			UUID actorId) {
		jdbc.update("""
				INSERT INTO cf_fragment_versions (fragment_id, version_no, title, data, model_version, comment, created_by)
				VALUES (?, ?, ?, CAST(? AS jsonb), ?, ?, ?)""", fragmentId, versionNo, title, data.toString(), modelVersion,
				comment, actorId);
	}

	/** One fragment: the working copy must be complete; it then points at its latest version. */
	private void publishOne(Row f, UUID actorId, Row along) {
		Model model = models.get(f.modelId());
		Result result = FragmentValidator.validate(model.fields(), f.data(), Mode.PUBLISH, lookup, f.id());
		if (!result.valid()) {
			if (along == null) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_FRAGMENT_DATA", "Chưa đủ dữ liệu để publish")
					.withProperty("errors", result.errors());
			}
			throw new ConflictException("REFERENCE_NOT_READY", "Fragment “" + f.title() + "” chưa đủ dữ liệu để publish")
				.withProperty("fragmentId", f.id())
				.withProperty("errors", result.errors());
		}
		UUID latest = jdbc.queryForObject(
				"SELECT id FROM cf_fragment_versions WHERE fragment_id = ? ORDER BY version_no DESC LIMIT 1", UUID.class, f.id());
		if (latest.equals(f.publishedVersionId())) {
			return;
		}
		jdbc.update("""
				UPDATE cf_fragments SET published_version_id = ?, published_at = now(), status = 'PUBLISHED', updated_at = now(),
				       updated_by = ?
				WHERE id = ?""", latest, actorId, f.id());
		refreshReferences(f.id(), model);
		audit.entry(ContentAudit.CONTENT_PUBLISHED, ContentAudit.entityType(ContentType.FRAGMENT), f.id(), f.title())
			.by(actorId)
			.changes(Map.of("status", f.status()), Map.of("status", "PUBLISHED"))
			.reason(along == null ? null : "Publish cùng “" + along.title() + "”")
			.record();
	}

	/** Fragments the working copy points to that were never published. */
	private List<PendingReference> unpublishedReferences(Row f) {
		List<String> ids = FragmentValidator.references(models.get(f.modelId()).fields(), f.data())
			.stream()
			.filter(t -> t.type() == TargetType.FRAGMENT)
			.map(Target::id)
			.toList();
		if (ids.isEmpty()) {
			return List.of();
		}
		return jdbc.query("""
				SELECT f.id, f.title, m.slug FROM cf_fragments f JOIN cf_models m ON m.id = f.model_id
				WHERE f.id = ANY (CAST(? AS uuid[])) AND f.published_version_id IS NULL ORDER BY f.title""",
				(rs, n) -> new PendingReference(rs.getObject("id", UUID.class), rs.getString("title"), rs.getString("slug")),
				(Object) ids.toArray(String[]::new));
	}

	/** content_references = what the working copy points to plus what the published version points to. */
	private void refreshReferences(UUID id, Model model) {
		Row f = find(id, false);
		Set<Target> targets = new LinkedHashSet<>(FragmentValidator.references(model.fields(), f.data()));
		if (f.publishedVersionId() != null) {
			String published = jdbc.queryForObject("SELECT data::text FROM cf_fragment_versions WHERE id = ?", String.class,
					f.publishedVersionId());
			targets.addAll(FragmentValidator.references(model.fields(), json.readTree(published)));
		}
		references.replace(ContentType.FRAGMENT, id.toString(), targets);
	}

	private List<UsageRow> usages(UUID id) {
		return references.usagesOf(TargetType.FRAGMENT, id.toString()).stream().map(u -> {
			String title = u.sourceType() == ContentType.FRAGMENT ? jdbc.queryForList(
					"SELECT title FROM cf_fragments WHERE id = CAST(? AS uuid)", String.class, u.sourceId())
				.stream()
				.findFirst()
				.orElse(null) : null;
			return new UsageRow(u.sourceType().name(), u.sourceId(), title);
		}).toList();
	}

	/** Titles (and thumbnails) of what the data points to, by id. */
	private Map<String, RefSummary> summaries(List<FieldDef> fields, JsonNode data) {
		Map<String, RefSummary> refs = new LinkedHashMap<>();
		for (Target t : FragmentValidator.references(fields, data)) {
			switch (t.type()) {
				case ASSET -> jdbc.query("SELECT title, kind, url FROM dam_assets WHERE id = CAST(? AS uuid)", rs -> {
					String thumb = AssetRenditions.url(rs.getString("url"), AssetTypes.Kind.valueOf(rs.getString("kind")),
							AssetRenditions.THUMB);
					refs.put(t.id(), new RefSummary(t.id(), "ASSET", rs.getString("title"), thumb, rs.getString("kind")));
				}, t.id());
				case FRAGMENT -> jdbc.query("SELECT title, status FROM cf_fragments WHERE id = CAST(? AS uuid)",
						rs -> {
							refs.put(t.id(), new RefSummary(t.id(), "FRAGMENT", rs.getString("title"), null, rs.getString("status")));
						}, t.id());
				case PRODUCT -> jdbc.query("SELECT name, active FROM products WHERE id = ?", rs -> {
					refs.put(t.id(), new RefSummary(t.id(), "PRODUCT", rs.getString("name"), null,
							rs.getBoolean("active") ? "ACTIVE" : "HIDDEN"));
				}, Long.parseLong(t.id()));
				default -> {
				}
			}
		}
		return refs;
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
		return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_FRAGMENT_DATA", "Dữ liệu chưa hợp lệ").withProperty("errors", errors);
	}

	static ApiException notFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "FRAGMENT_NOT_FOUND", "Không tìm thấy fragment");
	}
}
