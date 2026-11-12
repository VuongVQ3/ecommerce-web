package com.nutshop.dam;

import com.nutshop.audit.AuditLog;
import com.nutshop.common.ApiException;
import com.nutshop.common.ConflictException;
import com.nutshop.common.Slugs;
import com.nutshop.common.TextFold;
import com.nutshop.content.ContentAudit;
import com.nutshop.dam.DamDtos.FolderNode;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * DAM folders. They exist only in the database: a folder's name is a slug and its path is the parent's path plus
 * "/" plus the name, so renaming rewrites the paths below it (one statement, one transaction) and never touches the
 * file store. The root (/hat-lanh) cannot be renamed or deleted.
 */
@Service
public class DamFolderService {

	static final int MAX_NAME_LENGTH = 80;
	static final int MAX_PATH_LENGTH = 500;

	/** A folder row. {@code parentId} is null for the root only. */
	public record Folder(long id, Long parentId, String name, String path) {

		public boolean isRoot() {
			return parentId == null;
		}
	}

	private static final RowMapper<Folder> FOLDER = (rs, n) -> new Folder(rs.getLong("id"),
			(Long) rs.getObject("parent_id", Long.class), rs.getString("name"), rs.getString("path"));

	private final JdbcTemplate jdbc;
	private final AuditLog audit;

	public DamFolderService(JdbcTemplate jdbc, AuditLog audit) {
		this.jdbc = jdbc;
		this.audit = audit;
	}

	/** Every folder as a tree under the root, children by name, each with the number of assets directly in it. */
	@Transactional(readOnly = true)
	public List<FolderNode> tree() {
		record Row(Folder folder, long count) {
		}
		List<Row> rows = jdbc.query("""
				SELECT f.id, f.parent_id, f.name, f.path, COUNT(a.id) AS asset_count
				FROM dam_folders f LEFT JOIN dam_assets a ON a.folder_id = f.id
				GROUP BY f.id ORDER BY f.path""", (rs, n) -> new Row(FOLDER.mapRow(rs, n), rs.getLong("asset_count")));
		Map<Long, List<FolderNode>> children = new LinkedHashMap<>();
		rows.forEach(r -> children.put(r.folder().id(), new ArrayList<>()));
		Map<Long, FolderNode> nodes = new LinkedHashMap<>();
		for (Row r : rows) {
			Folder f = r.folder();
			nodes.put(f.id(), new FolderNode(f.id(), f.parentId(), f.name(), f.path(), r.count(), children.get(f.id())));
		}
		List<FolderNode> roots = new ArrayList<>();
		// Ordered by path, so a parent always comes before its children and siblings come by name
		for (FolderNode node : nodes.values()) {
			if (node.parentId() == null || !children.containsKey(node.parentId())) {
				roots.add(node);
			}
			else {
				children.get(node.parentId()).add(node);
			}
		}
		return roots;
	}

	@Transactional(readOnly = true)
	public Folder get(long id) {
		return jdbc.query("SELECT id, parent_id, name, path FROM dam_folders WHERE id = ?", FOLDER, id)
			.stream()
			.findFirst()
			.orElseThrow(DamFolderService::notFound);
	}

	@Transactional
	public FolderNode create(long parentId, String rawName, UUID actorId) {
		Folder parent = get(parentId);
		String name = slugName(rawName);
		String path = childPath(parent, name);
		requireFreeName(parentId, name);
		long id;
		try {
			id = jdbc.queryForObject("INSERT INTO dam_folders (parent_id, name, path, created_by) VALUES (?, ?, ?, ?) RETURNING id",
					Long.class, parentId, name, path, actorId);
		}
		catch (DuplicateKeyException ex) {
			throw nameTaken(name);
		}
		audit.entry(ContentAudit.CONTENT_CREATED, ContentAudit.DAM_FOLDER, id, path)
			.by(actorId)
			.changes(null, Map.of("name", name, "path", path))
			.record();
		return new FolderNode(id, parentId, name, path, 0, List.of());
	}

	/** New name (slugified); the paths of every folder below follow in the same transaction. */
	@Transactional
	public Folder rename(long id, String rawName, UUID actorId) {
		Folder folder = lock(id);
		if (folder.isRoot()) {
			throw rootLocked("Không đổi tên được thư mục gốc");
		}
		String name = slugName(rawName);
		if (name.equals(folder.name())) {
			return folder;
		}
		Folder parent = get(folder.parentId());
		String path = childPath(parent, name);
		requireFreeName(parent.id(), name);
		try {
			jdbc.update("UPDATE dam_folders SET name = ? WHERE id = ?", name, id);
			// The folder itself and everything below it: /a/old/x → /a/new/x
			jdbc.update("""
					UPDATE dam_folders SET path = ? || substr(path, ?)
					WHERE path = ? OR path LIKE ? ESCAPE '\\'""", path, folder.path().length() + 1, folder.path(),
					TextFold.escapeLike(folder.path()) + "/%");
		}
		catch (DuplicateKeyException ex) {
			throw nameTaken(name);
		}
		if (jdbc.queryForObject("SELECT MAX(length(path)) FROM dam_folders WHERE path = ? OR path LIKE ? ESCAPE '\\'",
				Integer.class, path, TextFold.escapeLike(path) + "/%") > MAX_PATH_LENGTH) {
			throw tooDeep();
		}
		audit.entry(ContentAudit.CONTENT_UPDATED, ContentAudit.DAM_FOLDER, id, path)
			.by(actorId)
			.changes(Map.of("name", folder.name(), "path", folder.path()), Map.of("name", name, "path", path))
			.record();
		return new Folder(id, folder.parentId(), name, path);
	}

	/** Only an empty folder (no assets, no subfolders), and never the root. */
	@Transactional
	public void delete(long id, UUID actorId) {
		Folder folder = lock(id);
		if (folder.isRoot()) {
			throw rootLocked("Không xoá được thư mục gốc");
		}
		boolean empty = Boolean.TRUE.equals(jdbc.queryForObject("""
				SELECT NOT EXISTS (SELECT 1 FROM dam_folders WHERE parent_id = ?)
				   AND NOT EXISTS (SELECT 1 FROM dam_assets WHERE folder_id = ?)""", Boolean.class, id, id));
		if (!empty) {
			throw new ConflictException("FOLDER_NOT_EMPTY",
					"Thư mục còn asset hoặc thư mục con. Hãy chuyển hoặc xoá chúng trước.");
		}
		jdbc.update("DELETE FROM dam_folders WHERE id = ?", id);
		audit.entry(ContentAudit.CONTENT_DELETED, ContentAudit.DAM_FOLDER, id, folder.path())
			.by(actorId)
			.changes(Map.of("name", folder.name(), "path", folder.path()), null)
			.record();
	}

	private Folder lock(long id) {
		return jdbc.query("SELECT id, parent_id, name, path FROM dam_folders WHERE id = ? FOR UPDATE", FOLDER, id)
			.stream()
			.findFirst()
			.orElseThrow(DamFolderService::notFound);
	}

	private void requireFreeName(long parentId, String name) {
		if (Boolean.TRUE.equals(jdbc.queryForObject(
				"SELECT EXISTS (SELECT 1 FROM dam_folders WHERE parent_id = ? AND name = ?)", Boolean.class, parentId,
				name))) {
			throw nameTaken(name);
		}
	}

	private static String childPath(Folder parent, String name) {
		String path = parent.path() + "/" + name;
		if (path.length() > MAX_PATH_LENGTH) {
			throw tooDeep();
		}
		return path;
	}

	/** "Bảng giá 2026" → "bang-gia-2026". */
	static String slugName(String raw) {
		String name = Slugs.from(raw == null ? "" : raw);
		if (name.isEmpty()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_FOLDER_NAME", "Tên thư mục cần có chữ hoặc số");
		}
		if (name.length() > MAX_NAME_LENGTH) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_FOLDER_NAME", "Tên thư mục tối đa 80 ký tự");
		}
		return name;
	}

	static ApiException notFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "FOLDER_NOT_FOUND", "Không tìm thấy thư mục");
	}

	private static ConflictException nameTaken(String name) {
		return new ConflictException("FOLDER_EXISTS", "Đã có thư mục “" + name + "” trong thư mục này");
	}

	private static ApiException rootLocked(String message) {
		return new ApiException(HttpStatus.BAD_REQUEST, "ROOT_FOLDER_LOCKED", message);
	}

	private static ApiException tooDeep() {
		return new ApiException(HttpStatus.BAD_REQUEST, "FOLDER_PATH_TOO_LONG", "Đường dẫn thư mục quá dài (tối đa 500 ký tự)");
	}
}
