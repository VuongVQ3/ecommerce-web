package com.nutshop.dam;

import com.nutshop.audit.AuditLog;
import com.nutshop.common.ApiException;
import com.nutshop.common.ConflictException;
import com.nutshop.common.PageResponse;
import com.nutshop.common.Slugs;
import com.nutshop.common.TextFold;
import com.nutshop.content.ContentAudit;
import com.nutshop.content.ContentReferenceService;
import com.nutshop.content.ContentReferenceService.TargetType;
import com.nutshop.content.ContentReferenceService.Usage;
import com.nutshop.content.ContentType;
import com.nutshop.content.PreviewTokenService;
import com.nutshop.dam.DamDtos.AssetDetail;
import com.nutshop.dam.DamDtos.AssetRow;
import com.nutshop.dam.DamDtos.MetadataRequest;
import com.nutshop.dam.DamFolderService.Folder;
import com.nutshop.media.AssetStorage;
import com.nutshop.media.AssetStorage.StoredAsset;
import com.nutshop.media.AssetTypes;
import com.nutshop.media.AssetTypes.AssetType;
import com.nutshop.media.AssetTypes.Kind;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;
import org.springframework.web.util.UriUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Array;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Assets (DAM): images and PDFs with metadata, in folders. Files go to the store outside any transaction, then the
 * row is written in a short one; if that fails the uploaded file is deleted again (as AdminBlogService.addImage
 * does). A file can be replaced under the same id, so the stable link /files/{id}/{name} keeps working.
 */
@Service
public class DamAssetService {

	private static final Logger log = LoggerFactory.getLogger(DamAssetService.class);

	/** Images and PDFs alike; matches spring.servlet.multipart (one file per request). */
	public static final long MAX_FILE_BYTES = 10L * 1024 * 1024;
	static final int DEFAULT_PAGE_SIZE = 40;
	static final int MAX_PAGE_SIZE = 100;
	static final int MAX_TAGS = 20;
	static final int MAX_TAG_LENGTH = 40;

	private static final String COLUMNS = """
			a.id, a.folder_id, f.path AS folder_path, a.file_name, a.kind, a.mime, a.size_bytes, a.width, a.height,
			a.page_count, a.storage_public_id, a.url, a.storage_version, a.title, a.alt, a.description, a.tags,
			a.checksum_sha256, a.created_at, cu.full_name AS created_by_name, a.updated_at, uu.full_name AS updated_by_name""";

	private static final String FROM = """
			dam_assets a JOIN dam_folders f ON f.id = a.folder_id
			LEFT JOIN users cu ON cu.id = a.created_by LEFT JOIN users uu ON uu.id = a.updated_by""";

	/** "lower(translate(x, ACCENTED, PLAIN))": compared without case or accents (see TextFold). */
	private static final String FOLD = "lower(translate(%s, '" + TextFold.ACCENTED + "', '" + TextFold.PLAIN + "'))";

	/** A row as stored. */
	record Asset(UUID id, long folderId, String folderPath, String fileName, Kind kind, String mime, long sizeBytes,
			Integer width, Integer height, Integer pageCount, String publicId, String url, Long storageVersion,
			String title, String alt, String description, List<String> tags, String checksum, Instant createdAt,
			String createdByName, Instant updatedAt, String updatedByName) {
	}

	private static final RowMapper<Asset> ASSET = (rs, n) -> new Asset(rs.getObject("id", UUID.class),
			rs.getLong("folder_id"), rs.getString("folder_path"), rs.getString("file_name"), Kind.valueOf(rs.getString("kind")),
			rs.getString("mime"), rs.getLong("size_bytes"), rs.getObject("width", Integer.class),
			rs.getObject("height", Integer.class), rs.getObject("page_count", Integer.class),
			rs.getString("storage_public_id"), rs.getString("url"), rs.getObject("storage_version", Long.class),
			rs.getString("title"), rs.getString("alt"), rs.getString("description"), tags(rs.getArray("tags")),
			rs.getString("checksum_sha256"), rs.getTimestamp("created_at").toInstant(), rs.getString("created_by_name"),
			rs.getTimestamp("updated_at").toInstant(), rs.getString("updated_by_name"));

	private final JdbcTemplate jdbc;
	private final AssetStorage storage;
	private final DamFolderService folders;
	private final ContentReferenceService references;
	private final PreviewTokenService previews;
	private final AuditLog audit;
	private final TransactionTemplate tx;

	public DamAssetService(JdbcTemplate jdbc, AssetStorage storage, DamFolderService folders,
			ContentReferenceService references, PreviewTokenService previews, AuditLog audit,
			PlatformTransactionManager txManager) {
		this.jdbc = jdbc;
		this.storage = storage;
		this.folders = folders;
		this.references = references;
		this.previews = previews;
		this.audit = audit;
		this.tx = new TransactionTemplate(txManager);
	}

	/**
	 * Newest change first. {@code q} matches title, file name and tags without case or accents ("bang gia" finds
	 * "Bảng giá"); {@code tag} is one exact tag; {@code includeSubfolders} widens {@code folderId} to everything below.
	 */
	@Transactional(readOnly = true)
	public PageResponse<AssetRow> list(Long folderId, boolean includeSubfolders, String q, Kind kind, String tag,
			int page, int size) {
		StringBuilder where = new StringBuilder(" WHERE TRUE");
		List<Object> args = new ArrayList<>();
		if (folderId != null) {
			Folder folder = folders.get(folderId);
			if (includeSubfolders) {
				where.append(" AND (f.id = ? OR f.path LIKE ? ESCAPE '\\')");
				args.add(folder.id());
				args.add(TextFold.escapeLike(folder.path()) + "/%");
			}
			else {
				where.append(" AND a.folder_id = ?");
				args.add(folder.id());
			}
		}
		if (StringUtils.hasText(q)) {
			String pattern = "%" + TextFold.escapeLike(TextFold.fold(q.trim())) + "%";
			where.append(" AND (").append(FOLD.formatted("a.title")).append(" LIKE ? ESCAPE '\\' OR ")
				.append(FOLD.formatted("a.file_name")).append(" LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM unnest(a.tags) t WHERE ")
				.append(FOLD.formatted("t")).append(" LIKE ? ESCAPE '\\'))");
			args.addAll(List.of(pattern, pattern, pattern));
		}
		if (kind != null) {
			where.append(" AND a.kind = ?");
			args.add(kind.name());
		}
		if (StringUtils.hasText(tag)) {
			where.append(" AND ? = ANY (a.tags)");
			args.add(tag.strip().toLowerCase(Locale.ROOT));
		}
		int pageSize = size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
		int pageIndex = Math.max(page, 0);
		long total = jdbc.queryForObject("SELECT COUNT(*) FROM " + FROM + where, Long.class, args.toArray());
		List<Object> pageArgs = new ArrayList<>(args);
		pageArgs.add(pageSize);
		pageArgs.add((long) pageIndex * pageSize);
		List<AssetRow> items = jdbc.query("SELECT " + COLUMNS + " FROM " + FROM + where
				+ " ORDER BY a.updated_at DESC, a.id LIMIT ? OFFSET ?", ASSET, pageArgs.toArray())
			.stream()
			.map(DamAssetService::row)
			.toList();
		return new PageResponse<>(items, pageIndex, pageSize, total, (int) ((total + pageSize - 1) / pageSize));
	}

	@Transactional(readOnly = true)
	public AssetDetail get(UUID id) {
		Asset asset = find(id, false);
		return detail(asset, references.usagesOf(TargetType.ASSET, id.toString()));
	}

	@Transactional(readOnly = true)
	public List<Usage> usages(UUID id) {
		find(id, false);
		return references.usagesOf(TargetType.ASSET, id.toString());
	}

	/** One new asset. The title defaults to the file name without its extension. */
	public AssetDetail upload(byte[] bytes, String fileName, long folderId, String title, String alt, UUID actorId) {
		AssetType type = checkFile(bytes, fileName);
		Folder folder = folders.get(folderId);
		String checksum = sha256(bytes);
		refuseDuplicate(checksum, null);
		String cleanName = fileName(fileName, type);
		String cleanTitle = StringUtils.hasText(title) ? truncate(title.strip(), 150) : defaultTitle(cleanName);
		String cleanAlt = clean(alt, 200);
		StoredAsset stored = storage.upload(bytes, type.kind());
		UUID id;
		try {
			id = tx.execute(status -> {
				boolean image = type.kind() == Kind.IMAGE;
				UUID created = jdbc.queryForObject("""
						INSERT INTO dam_assets (folder_id, file_name, kind, mime, size_bytes, width, height, page_count,
						                        storage_public_id, url, storage_version, title, alt, checksum_sha256,
						                        created_by, updated_by)
						VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id""", UUID.class, folder.id(),
						cleanName, type.kind().name(), type.mime(), (long) bytes.length, image ? stored.width() : null,
						image ? stored.height() : null, image ? null : stored.pages(), stored.publicId(), stored.url(),
						stored.version(), cleanTitle, cleanAlt, checksum, actorId, actorId);
				Map<String, Object> after = new LinkedHashMap<>();
				after.put("fileName", cleanName);
				after.put("folder", folder.path());
				after.put("kind", type.kind().name());
				after.put("sizeBytes", (long) bytes.length);
				after.put("alt", cleanAlt);
				audit.entry(ContentAudit.CONTENT_CREATED, ContentAudit.entityType(ContentType.ASSET), created, cleanTitle)
					.by(actorId)
					.changes(null, after)
					.record();
				return created;
			});
		}
		catch (RuntimeException ex) {
			storage.delete(stored.publicId());
			if (ex instanceof DuplicateKeyException) {
				// The same file uploaded twice at once: the other upload won
				refuseDuplicate(checksum, null);
			}
			throw ex;
		}
		return get(id);
	}

	@Transactional
	public AssetDetail updateMetadata(UUID id, MetadataRequest req, UUID actorId) {
		Asset before = find(id, true);
		String title = truncate(req.title().strip(), 150);
		String alt = clean(req.alt(), 200);
		String description = clean(req.description(), 1000);
		List<String> tags = normalizeTags(req.tags());
		jdbc.update("""
				UPDATE dam_assets SET title = ?, alt = ?, description = ?, tags = ?, updated_at = now(), updated_by = ?
				WHERE id = ?""", title, alt, description, tags.toArray(String[]::new), actorId, id);
		audit.entry(ContentAudit.CONTENT_UPDATED, ContentAudit.entityType(ContentType.ASSET), id, title)
			.by(actorId)
			.changes(metadata(before.title(), before.alt(), before.description(), before.tags()),
					metadata(title, alt, description, tags))
			.record();
		return get(id);
	}

	@Transactional
	public AssetDetail move(UUID id, long folderId, UUID actorId) {
		Asset asset = find(id, true);
		Folder target = folders.get(folderId);
		if (target.id() != asset.folderId()) {
			jdbc.update("UPDATE dam_assets SET folder_id = ?, updated_at = now(), updated_by = ? WHERE id = ?", target.id(),
					actorId, id);
			audit.entry(ContentAudit.CONTENT_MOVED, ContentAudit.entityType(ContentType.ASSET), id, asset.title())
				.by(actorId)
				.changes(Map.of("folder", asset.folderPath()), Map.of("folder", target.path()))
				.record();
		}
		return get(id);
	}

	/**
	 * A new file for the same asset: id, title, alt, tags, file name and stable link stay; checksum, size,
	 * dimensions or page count and the Cloudinary version change. An image is replaced by an image, a PDF by a PDF.
	 * <p>
	 * The store overwrites the file before the row is updated; should the update then fail, the row keeps describing
	 * the previous file until the next replace (the file itself cannot be put back).
	 */
	public AssetDetail replace(UUID id, byte[] bytes, String fileName, UUID actorId) {
		AssetType type = checkFile(bytes, fileName);
		Asset current = find(id, false);
		if (type.kind() != current.kind()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "KIND_MISMATCH",
					current.kind() == Kind.IMAGE ? "Ảnh chỉ thay được bằng ảnh (JPEG, PNG hoặc WebP)"
							: "PDF chỉ thay được bằng file PDF");
		}
		String checksum = sha256(bytes);
		if (checksum.equals(current.checksum())) {
			return get(id);
		}
		refuseDuplicate(checksum, id);
		StoredAsset stored = storage.replace(current.publicId(), bytes, type.kind());
		boolean image = type.kind() == Kind.IMAGE;
		Integer width = image ? stored.width() : null;
		Integer height = image ? stored.height() : null;
		Integer pages = image ? null : stored.pages();
		try {
			tx.executeWithoutResult(status -> {
				int updated = jdbc.update("""
						UPDATE dam_assets SET mime = ?, size_bytes = ?, width = ?, height = ?, page_count = ?, url = ?,
						       storage_version = ?, checksum_sha256 = ?, updated_at = now(), updated_by = ?
						WHERE id = ?""", type.mime(), (long) bytes.length, width, height, pages, stored.url(),
						stored.version(), checksum, actorId, id);
				if (updated == 0) {
					throw notFound();
				}
				audit.entry(ContentAudit.CONTENT_FILE_REPLACED, ContentAudit.entityType(ContentType.ASSET), id,
						current.title())
					.by(actorId)
					.changes(file(current.checksum(), current.mime(), current.sizeBytes(), current.width(),
							current.height(), current.pageCount(), current.storageVersion()),
							file(checksum, type.mime(), bytes.length, width, height, pages, stored.version()))
					.record();
			});
		}
		catch (DuplicateKeyException ex) {
			refuseDuplicate(checksum, id);
			throw ex;
		}
		catch (RuntimeException ex) {
			log.error("Asset {}: file replaced in the store but the row was not updated: {}", id, ex.getMessage());
			throw ex;
		}
		return get(id);
	}

	/**
	 * Refused while anything uses the asset (409 ASSET_IN_USE with the usages). Preview links die with it; the file
	 * is deleted from the store once the deletion is committed.
	 */
	@Transactional
	public void delete(UUID id, UUID actorId) {
		Asset asset = find(id, true);
		if (references.isReferenced(TargetType.ASSET, id.toString())) {
			List<Usage> usages = references.usagesOf(TargetType.ASSET, id.toString());
			throw new ConflictException("ASSET_IN_USE",
					"Asset đang được dùng ở " + usages.size() + " nơi. Hãy gỡ khỏi các nơi đó trước khi xoá.")
				.withProperty("usages", usages);
		}
		jdbc.update("DELETE FROM dam_assets WHERE id = ?", id);
		previews.revokeAll(ContentType.ASSET, id.toString());
		Map<String, Object> before = new LinkedHashMap<>(metadata(asset.title(), asset.alt(), asset.description(), asset.tags()));
		before.put("fileName", asset.fileName());
		before.put("folder", asset.folderPath());
		before.put("checksum", asset.checksum());
		audit.entry(ContentAudit.CONTENT_DELETED, ContentAudit.entityType(ContentType.ASSET), id, asset.title())
			.by(actorId)
			.changes(before, null)
			.record();
		String publicId = asset.publicId();
		TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
			@Override
			public void afterCommit() {
				storage.delete(publicId);
			}
		});
	}

	/** For the stable link: the current URL and kind of an asset, if it exists. */
	@Transactional(readOnly = true)
	public Optional<Asset> findForDelivery(UUID id) {
		return jdbc.query("SELECT " + COLUMNS + " FROM " + FROM + " WHERE a.id = ?", ASSET, id).stream().findFirst();
	}

	// ---- helpers --------------------------------------------------------------------------------------------

	private Asset find(UUID id, boolean lock) {
		String sql = "SELECT " + COLUMNS + " FROM " + FROM + " WHERE a.id = ?" + (lock ? " FOR UPDATE OF a" : "");
		return jdbc.query(sql, ASSET, id).stream().findFirst().orElseThrow(DamAssetService::notFound);
	}

	/** Non-empty, at most 10MB, a real JPEG/PNG/WebP/PDF whose extension (if any) agrees with its content. */
	static AssetType checkFile(byte[] bytes, String fileName) {
		if (bytes == null || bytes.length == 0) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_FILE", "Vui lòng chọn một file");
		}
		if (bytes.length > MAX_FILE_BYTES) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "FILE_TOO_LARGE", "File tối đa 10MB");
		}
		return AssetTypes.check(bytes, fileName)
			.orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "INVALID_FILE",
					"Chỉ nhận ảnh JPEG, PNG, WebP hoặc file PDF (nội dung file không khớp với loại file)"));
	}

	private void refuseDuplicate(String checksum, UUID self) {
		jdbc.query("SELECT id, title FROM dam_assets WHERE checksum_sha256 = ?",
				(rs, n) -> Map.entry(rs.getObject("id", UUID.class), rs.getString("title")), checksum)
			.stream()
			.filter(existing -> !existing.getKey().equals(self))
			.findFirst()
			.ifPresent(existing -> {
				throw new ConflictException("DUPLICATE_ASSET", "File này đã có trong kho: “" + existing.getValue() + "”")
					.withProperty("assetId", existing.getKey())
					.withProperty("title", existing.getValue());
			});
	}

	/** Trimmed, lowercased, no duplicates, at most 20 tags of at most 40 characters. */
	static List<String> normalizeTags(List<String> raw) {
		if (raw == null) {
			return List.of();
		}
		Set<String> tags = new LinkedHashSet<>();
		for (String tag : raw) {
			if (tag == null || tag.isBlank()) {
				continue;
			}
			String clean = tag.strip().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
			if (clean.length() > MAX_TAG_LENGTH) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "TAG_TOO_LONG",
						"Mỗi tag tối đa " + MAX_TAG_LENGTH + " ký tự: “" + truncate(clean, 50) + "”");
			}
			tags.add(clean);
		}
		if (tags.size() > MAX_TAGS) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "TOO_MANY_TAGS", "Tối đa " + MAX_TAGS + " tag cho một asset");
		}
		return List.copyOf(tags);
	}

	/** "/files/{id}/bang-gia-2026.pdf": the readable part is a slug of the file name and is never looked up. */
	static String stableUrl(UUID id, String fileName) {
		String extension = AssetTypes.extension(fileName);
		String base = extension.isEmpty() ? fileName : fileName.substring(0, fileName.length() - extension.length() - 1);
		String slug = Slugs.from(base == null ? "" : base);
		String name = (slug.isEmpty() ? "file" : slug) + (extension.isEmpty() ? "" : "." + extension);
		return "/files/" + id + "/" + UriUtils.encodePathSegment(name, StandardCharsets.UTF_8);
	}

	private static AssetRow row(Asset a) {
		return new AssetRow(a.id(), a.folderId(), a.fileName(), a.kind().name(), a.mime(), a.sizeBytes(), a.width(),
				a.height(), a.pageCount(), a.url(), a.title(), a.alt(), a.tags(), a.updatedAt(), a.updatedByName(),
				AssetRenditions.of(a.url(), a.kind()), stableUrl(a.id(), a.fileName()));
	}

	private static AssetDetail detail(Asset a, List<Usage> usages) {
		return new AssetDetail(a.id(), a.folderId(), a.folderPath(), a.fileName(), a.kind().name(), a.mime(),
				a.sizeBytes(), a.width(), a.height(), a.pageCount(), a.url(), a.storageVersion(), a.title(), a.alt(),
				a.description(), a.tags(), a.checksum(), a.createdAt(), a.createdByName(), a.updatedAt(),
				a.updatedByName(), AssetRenditions.of(a.url(), a.kind()), stableUrl(a.id(), a.fileName()), usages);
	}

	private static Map<String, Object> metadata(String title, String alt, String description, List<String> tags) {
		Map<String, Object> m = new LinkedHashMap<>();
		m.put("title", title);
		m.put("alt", alt);
		m.put("description", description);
		m.put("tags", tags);
		return m;
	}

	private static Map<String, Object> file(String checksum, String mime, long sizeBytes, Integer width, Integer height,
			Integer pages, Long version) {
		Map<String, Object> m = new LinkedHashMap<>();
		m.put("checksum", checksum);
		m.put("mime", mime);
		m.put("sizeBytes", sizeBytes);
		m.put("width", width);
		m.put("height", height);
		m.put("pageCount", pages);
		m.put("storageVersion", version);
		return m;
	}

	/** The name as uploaded without any folder part, at most 200 characters; "file.pdf" when there is none. */
	private static String fileName(String raw, AssetType type) {
		String name = raw == null ? "" : raw.strip();
		name = name.substring(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1);
		if (name.isEmpty()) {
			name = "file." + (type == AssetType.PDF ? "pdf" : type.mime().substring("image/".length()));
		}
		if (name.length() > 200) {
			String extension = AssetTypes.extension(name);
			name = name.substring(0, 200 - extension.length() - 1) + "." + extension;
		}
		return name;
	}

	private static String defaultTitle(String fileName) {
		String extension = AssetTypes.extension(fileName);
		String base = extension.isEmpty() ? fileName : fileName.substring(0, fileName.length() - extension.length() - 1);
		String title = base.replace('_', ' ').strip();
		return truncate(title.isEmpty() ? fileName : title, 150);
	}

	static String sha256(byte[] bytes) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
		}
		catch (NoSuchAlgorithmException ex) {
			throw new IllegalStateException("SHA-256 not available", ex);
		}
	}

	private static List<String> tags(Array array) throws SQLException {
		return array == null ? List.of() : Arrays.asList((String[]) array.getArray());
	}

	private static String clean(String value, int max) {
		return StringUtils.hasText(value) ? truncate(value.strip(), max) : null;
	}

	private static String truncate(String value, int max) {
		return value.length() <= max ? value : value.substring(0, max);
	}

	static ApiException notFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "ASSET_NOT_FOUND", "Không tìm thấy asset");
	}
}
