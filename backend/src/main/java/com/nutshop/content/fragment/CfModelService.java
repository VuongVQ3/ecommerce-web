package com.nutshop.content.fragment;

import com.nutshop.audit.AuditLog;
import com.nutshop.common.ApiException;
import com.nutshop.common.ConflictException;
import com.nutshop.common.Slugs;
import com.nutshop.content.ContentAudit;
import com.nutshop.content.fragment.CfDtos.ModelDetail;
import com.nutshop.content.fragment.CfDtos.ModelRequest;
import com.nutshop.content.fragment.CfDtos.ModelRow;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Content Fragment Models. Adding fields is always allowed; removing a field or changing its type while fragments
 * hold values for it is refused (409 with the number of fragments) unless the request asks to drop those values.
 * Every save increments the model's version. Writing models needs ContentPermissions.canManageModels (controller).
 */
@Service
public class CfModelService {

	static final Set<String> STATUSES = Set.of("DRAFT", "ENABLED", "DISABLED");

	/** A model as stored. */
	public record Model(long id, String name, String slug, String description, List<FieldDef> fields, String status,
			int version) {
	}

	private final JdbcTemplate jdbc;
	private final JsonMapper json;
	private final AuditLog audit;
	private final FragmentDelivery delivery;

	public CfModelService(JdbcTemplate jdbc, JsonMapper json, AuditLog audit, FragmentDelivery delivery) {
		this.jdbc = jdbc;
		this.json = json;
		this.audit = audit;
		this.delivery = delivery;
	}

	@Transactional(readOnly = true)
	public List<ModelRow> list() {
		return jdbc.query("""
				SELECT m.id, m.name, m.slug, m.description, m.status, m.version, jsonb_array_length(m.fields) AS field_count,
				       (SELECT COUNT(*) FROM cf_fragments f WHERE f.model_id = m.id) AS fragment_count, m.updated_at,
				       u.full_name AS updated_by_name
				FROM cf_models m LEFT JOIN users u ON u.id = m.updated_by ORDER BY m.name""",
				(rs, n) -> new ModelRow(rs.getLong("id"), rs.getString("name"), rs.getString("slug"),
						rs.getString("description"), rs.getString("status"), rs.getInt("version"), rs.getInt("field_count"),
						rs.getLong("fragment_count"), rs.getTimestamp("updated_at").toInstant(),
						rs.getString("updated_by_name")));
	}

	@Transactional(readOnly = true)
	public ModelDetail detail(long id) {
		return jdbc.query("""
				SELECT m.*, (SELECT COUNT(*) FROM cf_fragments f WHERE f.model_id = m.id) AS fragment_count,
				       u.full_name AS updated_by_name
				FROM cf_models m LEFT JOIN users u ON u.id = m.updated_by WHERE m.id = ?""",
				(rs, n) -> new ModelDetail(rs.getLong("id"), rs.getString("name"), rs.getString("slug"),
						rs.getString("description"), rs.getString("status"), rs.getInt("version"),
						fields(rs.getString("fields")), rs.getLong("fragment_count"), rs.getTimestamp("created_at").toInstant(),
						rs.getTimestamp("updated_at").toInstant(), rs.getString("updated_by_name")),
				id).stream().findFirst().orElseThrow(CfModelService::notFound);
	}

	@Transactional(readOnly = true)
	public Model get(long id) {
		return find("SELECT * FROM cf_models WHERE id = ?", id);
	}

	@Transactional
	public ModelDetail create(ModelRequest req, UUID actorId) {
		String slug = Slugs.from(req.slug() == null || req.slug().isBlank() ? req.name() : req.slug());
		if (slug.isEmpty() || slug.length() > 80) {
			throw invalid(Map.of("slug", "Slug cần có chữ hoặc số, tối đa 80 ký tự"));
		}
		String status = status(req.status(), "DRAFT");
		List<FieldDef> fields = checkedFields(req.fields());
		long id;
		try {
			id = jdbc.queryForObject("""
					INSERT INTO cf_models (name, slug, description, fields, status, created_by, updated_by)
					VALUES (?, ?, ?, CAST(? AS jsonb), ?, ?, ?) RETURNING id""", Long.class, req.name().strip(), slug,
					clean(req.description()), json.writeValueAsString(fields), status, actorId, actorId);
		}
		catch (DuplicateKeyException ex) {
			throw new ConflictException("MODEL_EXISTS", "Đã có model với slug “" + slug + "”");
		}
		audit.entry(ContentAudit.CONTENT_CREATED, ContentAudit.CF_MODEL, id, req.name().strip())
			.by(actorId)
			.changes(null, snapshot(req.name().strip(), status, fields, 1))
			.record();
		return detail(id);
	}

	/**
	 * New name, description, status and fields (the slug stays). 409 MODEL_CHANGE_CONFLICT with affectedFragments
	 * and fields when removed or retyped fields still hold data, unless {@code dropFieldData}: then those values are
	 * deleted from every working copy (published versions keep theirs; delivery only shows fields of the model).
	 */
	@Transactional
	public ModelDetail update(long id, ModelRequest req, UUID actorId) {
		Model before = find("SELECT * FROM cf_models WHERE id = ? FOR UPDATE", id);
		List<FieldDef> fields = checkedFields(req.fields());
		String status = status(req.status(), before.status());
		List<String> breaking = ModelFields.breakingChanges(before.fields(), fields);
		long affected = breaking.isEmpty() ? 0 : jdbc.queryForObject(
				"SELECT COUNT(*) FROM cf_fragments WHERE model_id = ? AND jsonb_exists_any(data, CAST(? AS text[]))", Long.class, id,
				breaking.toArray(String[]::new));
		String reason = null;
		if (affected > 0) {
			if (!req.dropRequested()) {
				throw new ConflictException("MODEL_CHANGE_CONFLICT", affected
						+ " fragment đang có dữ liệu ở field bị xoá hoặc đổi kiểu: " + String.join(", ", breaking)
						+ ". Chọn xoá dữ liệu các field này để tiếp tục.")
					.withProperty("affectedFragments", affected)
					.withProperty("fields", breaking);
			}
			jdbc.update("UPDATE cf_fragments SET data = data - CAST(? AS text[]) WHERE model_id = ?",
					breaking.toArray(String[]::new), id);
			reason = "Xoá dữ liệu field " + String.join(", ", breaking) + " ở " + affected + " fragment";
		}
		int version = before.version() + 1;
		jdbc.update("""
				UPDATE cf_models SET name = ?, description = ?, fields = CAST(? AS jsonb), status = ?, version = ?,
				       updated_at = now(), updated_by = ?
				WHERE id = ?""", req.name().strip(), clean(req.description()), json.writeValueAsString(fields), status,
				version, actorId, id);
		audit.entry(ContentAudit.CONTENT_UPDATED, ContentAudit.CF_MODEL, id, req.name().strip())
			.by(actorId)
			.changes(snapshot(before.name(), before.status(), before.fields(), before.version()),
					snapshot(req.name().strip(), status, fields, version))
			.reason(reason)
			.record();
		// Delivery output follows the model's fields
		delivery.evictAllAfterCommit();
		return detail(id);
	}

	/** Only a model without fragments. */
	@Transactional
	public void delete(long id, UUID actorId) {
		Model model = find("SELECT * FROM cf_models WHERE id = ? FOR UPDATE", id);
		long count = jdbc.queryForObject("SELECT COUNT(*) FROM cf_fragments WHERE model_id = ?", Long.class, id);
		if (count > 0) {
			throw new ConflictException("MODEL_IN_USE", "Còn " + count + " fragment dùng model này. Hãy xoá chúng trước.")
				.withProperty("fragmentCount", count);
		}
		jdbc.update("DELETE FROM cf_models WHERE id = ?", id);
		audit.entry(ContentAudit.CONTENT_DELETED, ContentAudit.CF_MODEL, id, model.name())
			.by(actorId)
			.changes(snapshot(model.name(), model.status(), model.fields(), model.version()), null)
			.record();
	}

	boolean slugExists(String slug) {
		return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM cf_models WHERE slug = ?)", Boolean.class, slug));
	}

	private List<FieldDef> checkedFields(List<FieldDef> fields) {
		Map<String, String> errors = ModelFields.check(fields, this::slugExists);
		if (!errors.isEmpty()) {
			throw invalid(errors);
		}
		return fields.stream()
			.map(f -> new FieldDef(f.name(), f.label(), f.type(), f.required(), f.multiple(), f.help(), f.rules()))
			.toList();
	}

	private Model find(String sql, long id) {
		return jdbc.query(sql, (rs, n) -> new Model(rs.getLong("id"), rs.getString("name"), rs.getString("slug"),
				rs.getString("description"), fields(rs.getString("fields")), rs.getString("status"), rs.getInt("version")), id)
			.stream()
			.findFirst()
			.orElseThrow(CfModelService::notFound);
	}

	List<FieldDef> fields(String raw) {
		List<FieldDef> fields = new ArrayList<>();
		for (JsonNode node : json.readTree(raw)) {
			fields.add(json.treeToValue(node, FieldDef.class));
		}
		return fields;
	}

	private Map<String, Object> snapshot(String name, String status, List<FieldDef> fields, int version) {
		Map<String, Object> m = new LinkedHashMap<>();
		m.put("name", name);
		m.put("status", status);
		m.put("fields", fields.stream().map(f -> f.name() + ":" + f.type() + (f.isMultiple() ? "[]" : "")).toList());
		m.put("version", version);
		return m;
	}

	private static String status(String requested, String fallback) {
		if (requested == null || requested.isBlank()) {
			return fallback;
		}
		if (!STATUSES.contains(requested)) {
			throw invalid(Map.of("status", "Trạng thái chỉ gồm DRAFT, ENABLED, DISABLED"));
		}
		return requested;
	}

	private static String clean(String value) {
		return value == null || value.isBlank() ? null : value.strip();
	}

	static ApiException invalid(Map<String, String> errors) {
		return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_MODEL", "Model chưa hợp lệ").withProperty("errors", errors);
	}

	static ApiException notFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "MODEL_NOT_FOUND", "Không tìm thấy model");
	}
}
