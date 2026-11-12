package com.nutshop.dam;

import com.nutshop.content.ContentReferenceService.Usage;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Requests and responses of /api/author/assets. */
public final class DamDtos {

	private DamDtos() {
	}

	/** A folder with its subfolders; {@code assetCount} counts the assets directly inside it. */
	public record FolderNode(long id, Long parentId, String name, String path, long assetCount, List<FolderNode> children) {
	}

	public record CreateFolderRequest(@NotNull(message = "Chọn thư mục cha") Long parentId,
			@NotBlank(message = "Nhập tên thư mục") @Size(max = 80, message = "Tên thư mục tối đa 80 ký tự") String name) {
	}

	public record RenameFolderRequest(
			@NotBlank(message = "Nhập tên thư mục") @Size(max = 80, message = "Tên thư mục tối đa 80 ký tự") String name) {
	}

	/**
	 * One asset in a list.
	 * @param renditions preset → URL (thumb, card, hero, og for an image; thumb, card for a PDF)
	 * @param stableUrl relative link that keeps working when the file is replaced: /files/{id}/{name}
	 */
	public record AssetRow(UUID id, long folderId, String fileName, String kind, String mime, long sizeBytes,
			Integer width, Integer height, Integer pageCount, String url, String title, String alt, List<String> tags,
			Instant updatedAt, String updatedByName, Map<String, String> renditions, String stableUrl) {
	}

	/** One asset with everything the detail page shows, including where it is used. */
	public record AssetDetail(UUID id, long folderId, String folderPath, String fileName, String kind, String mime,
			long sizeBytes, Integer width, Integer height, Integer pageCount, String url, Long storageVersion,
			String title, String alt, String description, List<String> tags, String checksum, Instant createdAt,
			String createdByName, Instant updatedAt, String updatedByName, Map<String, String> renditions,
			String stableUrl, List<Usage> usages) {
	}

	public record MetadataRequest(
			@NotBlank(message = "Nhập tiêu đề") @Size(max = 150, message = "Tiêu đề tối đa 150 ký tự") String title,
			@Size(max = 200, message = "Mô tả ảnh (alt) tối đa 200 ký tự") String alt,
			@Size(max = 1000, message = "Mô tả tối đa 1000 ký tự") String description, List<String> tags) {
	}

	public record MoveRequest(@NotNull(message = "Chọn thư mục") Long folderId) {
	}
}
