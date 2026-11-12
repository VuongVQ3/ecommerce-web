package com.nutshop.content.fragment;

import com.nutshop.blog.BlogDtos.PreviewResponse;
import com.nutshop.blog.BlogMarkdown;
import com.nutshop.common.PageResponse;
import com.nutshop.content.AuthorActor;
import com.nutshop.content.fragment.CfDtos.CreateFragmentRequest;
import com.nutshop.content.fragment.CfDtos.FragmentDetail;
import com.nutshop.content.fragment.CfDtos.FragmentRow;
import com.nutshop.content.fragment.CfDtos.MarkdownPreviewRequest;
import com.nutshop.content.fragment.CfDtos.ModelDetail;
import com.nutshop.content.fragment.CfDtos.ModelRequest;
import com.nutshop.content.fragment.CfDtos.ModelRow;
import com.nutshop.content.fragment.CfDtos.PreviewLink;
import com.nutshop.content.fragment.CfDtos.SaveFragmentRequest;
import com.nutshop.content.fragment.CfDtos.VersionRow;
import com.nutshop.security.Roles;
import com.nutshop.user.Role;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Content Fragments in the Author environment. Reading and editing: everyone who may author (STAFF, ADMIN).
 * Writing models: canManageModels; dropping field data also needs canDelete. Publish and unpublish: canPublish.
 * Delete: canDelete. All checked through AuthorActor (ContentPermissions).
 */
@RestController
@RequestMapping("/api/author")
@Roles({ Role.STAFF, Role.ADMIN })
public class AuthorCfController {

	private final CfModelService models;
	private final CfFragmentService fragments;
	private final BlogMarkdown markdown;

	public AuthorCfController(CfModelService models, CfFragmentService fragments, BlogMarkdown markdown) {
		this.models = models;
		this.fragments = fragments;
		this.markdown = markdown;
	}

	// ---- models ---------------------------------------------------------------------------------------------

	@GetMapping("/cf/models")
	public List<ModelRow> models() {
		return models.list();
	}

	@GetMapping("/cf/models/{id}")
	public ModelDetail model(@PathVariable long id) {
		return models.detail(id);
	}

	@PostMapping("/cf/models")
	@ResponseStatus(HttpStatus.CREATED)
	public ModelDetail createModel(@Valid @RequestBody ModelRequest req, @AuthenticationPrincipal Jwt jwt) {
		return models.create(req, AuthorActor.of(jwt).requireManageModels().id());
	}

	@PutMapping("/cf/models/{id}")
	public ModelDetail updateModel(@PathVariable long id, @Valid @RequestBody ModelRequest req,
			@AuthenticationPrincipal Jwt jwt) {
		AuthorActor actor = AuthorActor.of(jwt).requireManageModels();
		if (req.dropRequested()) {
			// Deleting stored values is deleting content
			actor.requireDelete();
		}
		return models.update(id, req, actor.id());
	}

	@DeleteMapping("/cf/models/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void deleteModel(@PathVariable long id, @AuthenticationPrincipal Jwt jwt) {
		models.delete(id, AuthorActor.of(jwt).requireManageModels().id());
	}

	// ---- fragments ------------------------------------------------------------------------------------------

	@GetMapping("/cf/fragments")
	public PageResponse<FragmentRow> fragments(@RequestParam(required = false) Long modelId,
			@RequestParam(required = false) List<String> modelSlugs, @RequestParam(required = false) String folder,
			@RequestParam(required = false) String status, @RequestParam(required = false) String q,
			@RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "" + CfFragmentService.DEFAULT_PAGE_SIZE) int size) {
		return fragments.list(modelId, modelSlugs, folder, status, q, page, size);
	}

	@GetMapping("/cf/folders")
	public List<String> folders() {
		return fragments.folders();
	}

	@PostMapping("/cf/fragments")
	@ResponseStatus(HttpStatus.CREATED)
	public FragmentDetail create(@Valid @RequestBody CreateFragmentRequest req, @AuthenticationPrincipal Jwt jwt) {
		return fragments.create(req, AuthorActor.of(jwt).id());
	}

	@GetMapping("/cf/fragments/{id}")
	public FragmentDetail get(@PathVariable UUID id) {
		return fragments.detail(id);
	}

	@PutMapping("/cf/fragments/{id}")
	public FragmentDetail save(@PathVariable UUID id, @Valid @RequestBody SaveFragmentRequest req,
			@AuthenticationPrincipal Jwt jwt) {
		return fragments.save(id, req, AuthorActor.of(jwt).id());
	}

	@GetMapping("/cf/fragments/{id}/versions")
	public List<VersionRow> versions(@PathVariable UUID id) {
		return fragments.versions(id);
	}

	@PostMapping("/cf/fragments/{id}/rollback/{versionId}")
	public FragmentDetail rollback(@PathVariable UUID id, @PathVariable UUID versionId, @AuthenticationPrincipal Jwt jwt) {
		return fragments.rollback(id, versionId, AuthorActor.of(jwt).id());
	}

	/** 409 UNPUBLISHED_REFERENCES with "references" unless the body says {"publishReferences": true}. */
	@PostMapping("/cf/fragments/{id}/publish")
	public FragmentDetail publish(@PathVariable UUID id, @RequestBody(required = false) Map<String, Object> body,
			@AuthenticationPrincipal Jwt jwt) {
		boolean along = body != null && Boolean.TRUE.equals(body.get("publishReferences"));
		return fragments.publish(id, along, AuthorActor.of(jwt).requirePublish().id());
	}

	@PostMapping("/cf/fragments/{id}/unpublish")
	public FragmentDetail unpublish(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
		return fragments.unpublish(id, AuthorActor.of(jwt).requirePublish().id());
	}

	@DeleteMapping("/cf/fragments/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void delete(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
		fragments.delete(id, AuthorActor.of(jwt).requireDelete().id());
	}

	@PostMapping("/cf/fragments/{id}/preview-link")
	public PreviewLink previewLink(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
		return fragments.previewLink(id, AuthorActor.of(jwt).id());
	}

	/** Markdown rendered as the delivery API renders it (the editor's preview, for STAFF too). */
	@PostMapping("/markdown/preview")
	public PreviewResponse markdownPreview(@Valid @RequestBody MarkdownPreviewRequest req) {
		var rendered = markdown.render(req.content() == null ? "" : req.content(), Map.of());
		return new PreviewResponse(rendered.html(), rendered.readingMinutes());
	}
}
