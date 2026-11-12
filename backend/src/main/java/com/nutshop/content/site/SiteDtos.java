package com.nutshop.content.site;

import com.nutshop.content.fragment.CfDtos.RefSummary;
import com.nutshop.content.fragment.CfDtos.VersionRow;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Requests and responses of /api/author/pages. */
public final class SiteDtos {

	private SiteDtos() {
	}

	/** One page in the tree, children in their order. */
	public record TreeNode(UUID id, UUID parentId, String name, String path, String title, String template, String status,
			int sortOrder, Instant updatedAt, List<TreeNode> children) {
	}

	/**
	 * The working copy and what the editor needs: versions, names of referenced items (by id) and the old paths that
	 * now redirect here.
	 */
	public record PageDetail(UUID id, UUID parentId, String name, String path, String template, String title,
			JsonNode content, JsonNode properties, String status, UUID publishedVersionId, Instant publishedAt,
			Instant publishAt, Instant unpublishAt, Instant createdAt, String createdByName, Instant updatedAt,
			String updatedByName, List<VersionRow> versions, Map<String, RefSummary> refs, List<String> oldPaths) {
	}

	/** @param name one path segment; made from the title when empty */
	public record CreatePageRequest(UUID parentId, @Size(max = 120, message = "Tên tối đa 120 ký tự") String name,
			@NotBlank(message = "Nhập tiêu đề") @Size(max = 200, message = "Tiêu đề tối đa 200 ký tự") String title,
			@NotBlank(message = "Chọn mẫu trang") String template) {
	}

	public record SavePageRequest(
			@NotBlank(message = "Nhập tiêu đề") @Size(max = 200, message = "Tiêu đề tối đa 200 ký tự") String title,
			JsonNode content, JsonNode properties, @Size(max = 300, message = "Ghi chú tối đa 300 ký tự") String comment,
			Instant publishAt, Instant unpublishAt) {
	}

	/** @param parentId null = top level; @param position index among the new siblings (end when null) */
	public record MoveRequest(UUID parentId, Integer position) {
	}

	public record RenameRequest(@NotBlank(message = "Nhập tên") @Size(max = 120, message = "Tên tối đa 120 ký tự") String name) {
	}

	/** A published page in the menu. */
	public record MenuItem(String title, String path) {
	}
}
