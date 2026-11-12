package com.nutshop.content.fragment;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Requests and responses of /api/author/cf. */
public final class CfDtos {

	private CfDtos() {
	}

	// ---- models -------------------------------------------------------------------------------------------------

	public record ModelRow(long id, String name, String slug, String description, String status, int version,
			int fieldCount, long fragmentCount, Instant updatedAt, String updatedByName) {
	}

	public record ModelDetail(long id, String name, String slug, String description, String status, int version,
			List<FieldDef> fields, long fragmentCount, Instant createdAt, Instant updatedAt, String updatedByName) {
	}

	/**
	 * @param slug only on create (fixed afterwards: fragments and the delivery API refer to it); made from the name
	 * when empty
	 * @param dropFieldData delete the stored values of removed or retyped fields (ADMIN, recorded in the audit log)
	 */
	public record ModelRequest(
			@NotBlank(message = "Nhập tên model") @Size(max = 100, message = "Tên model tối đa 100 ký tự") String name,
			@Size(max = 80, message = "Slug tối đa 80 ký tự") String slug,
			@Size(max = 500, message = "Mô tả tối đa 500 ký tự") String description, String status,
			@NotNull(message = "Thiếu danh sách field") List<FieldDef> fields, Boolean dropFieldData) {

		/** Whether the request asks to drop field data (absent = no). */
		public boolean dropRequested() {
			return Boolean.TRUE.equals(dropFieldData);
		}
	}

	// ---- fragments ----------------------------------------------------------------------------------------------

	public record ModelRef(long id, String slug, String name) {
	}

	public record FragmentRow(UUID id, ModelRef model, String folderPath, String name, String title, String status,
			Instant publishedAt, Instant updatedAt, String updatedByName) {
	}

	public record VersionRow(UUID id, int versionNo, String title, String comment, Instant createdAt,
			String createdByName, boolean published) {
	}

	/** A place that uses this fragment; {@code title} when it is a fragment. */
	public record UsageRow(String sourceType, String sourceId, String title) {
	}

	/** What the editor shows for referenced items (picked asset thumbnails, fragment and product names). */
	public record RefSummary(String id, String type, String title, String thumb, String status) {
	}

	/**
	 * The working copy and everything the editor needs: the model's fields, versions, usages and summaries of the
	 * items the data points to (by id).
	 */
	public record FragmentDetail(UUID id, ModelDetail model, String folderPath, String name, String title, JsonNode data,
			String status, UUID publishedVersionId, Instant publishedAt, Instant publishAt, Instant unpublishAt,
			Instant createdAt, String createdByName, Instant updatedAt, String updatedByName, List<VersionRow> versions,
			List<UsageRow> usages, Map<String, RefSummary> refs) {
	}

	public record CreateFragmentRequest(@NotNull(message = "Chọn model") Long modelId,
			@Size(max = 300, message = "Thư mục tối đa 300 ký tự") String folderPath,
			@Size(max = 120, message = "Tên tối đa 120 ký tự") String name,
			@NotBlank(message = "Nhập tiêu đề") @Size(max = 200, message = "Tiêu đề tối đa 200 ký tự") String title,
			JsonNode data) {
	}

	public record SaveFragmentRequest(
			@NotBlank(message = "Nhập tiêu đề") @Size(max = 200, message = "Tiêu đề tối đa 200 ký tự") String title,
			JsonNode data, @Size(max = 300, message = "Ghi chú tối đa 300 ký tự") String comment, Instant publishAt,
			Instant unpublishAt) {
	}

	/** One fragment that must be published first (or along, with publishReferences). */
	public record PendingReference(UUID id, String title, String model) {
	}

	/** Relative link: /api/content/preview/fragments/{id}?token=… */
	public record PreviewLink(String url, Instant expiresAt) {
	}

	public record MarkdownPreviewRequest(@Size(max = 50_000, message = "Nội dung tối đa 50.000 ký tự") String content) {
	}
}
