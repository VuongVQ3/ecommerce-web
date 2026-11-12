package com.nutshop.content.site;

import com.nutshop.content.AuthorActor;
import com.nutshop.content.fragment.CfDtos.PreviewLink;
import com.nutshop.content.fragment.CfDtos.VersionRow;
import com.nutshop.content.site.SiteDtos.CreatePageRequest;
import com.nutshop.content.site.SiteDtos.MoveRequest;
import com.nutshop.content.site.SiteDtos.PageDetail;
import com.nutshop.content.site.SiteDtos.RenameRequest;
import com.nutshop.content.site.SiteDtos.SavePageRequest;
import com.nutshop.content.site.SiteDtos.TreeNode;
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
 * CMS pages in the Author environment: authoring for STAFF and ADMIN, publish/unpublish with canPublish, delete with
 * canDelete (checked through AuthorActor).
 */
@RestController
@RequestMapping("/api/author/pages")
@Roles({ Role.STAFF, Role.ADMIN })
public class AuthorPageController {

	private final SitePageService pages;

	public AuthorPageController(SitePageService pages) {
		this.pages = pages;
	}

	@GetMapping("/tree")
	public List<TreeNode> tree() {
		return pages.tree();
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public PageDetail create(@Valid @RequestBody CreatePageRequest req, @AuthenticationPrincipal Jwt jwt) {
		return pages.create(req, AuthorActor.of(jwt).id());
	}

	@GetMapping("/{id}")
	public PageDetail get(@PathVariable UUID id) {
		return pages.detail(id);
	}

	@PutMapping("/{id}")
	public PageDetail save(@PathVariable UUID id, @Valid @RequestBody SavePageRequest req, @AuthenticationPrincipal Jwt jwt) {
		return pages.save(id, req, AuthorActor.of(jwt).id());
	}

	@PostMapping("/{id}/move")
	public PageDetail move(@PathVariable UUID id, @RequestBody MoveRequest req, @AuthenticationPrincipal Jwt jwt) {
		return pages.move(id, req.parentId(), req.position(), AuthorActor.of(jwt).id());
	}

	@PostMapping("/{id}/rename")
	public PageDetail rename(@PathVariable UUID id, @Valid @RequestBody RenameRequest req, @AuthenticationPrincipal Jwt jwt) {
		return pages.rename(id, req.name(), AuthorActor.of(jwt).id());
	}

	@GetMapping("/{id}/versions")
	public List<VersionRow> versions(@PathVariable UUID id) {
		return pages.versions(id);
	}

	@PostMapping("/{id}/rollback/{versionId}")
	public PageDetail rollback(@PathVariable UUID id, @PathVariable UUID versionId, @AuthenticationPrincipal Jwt jwt) {
		return pages.rollback(id, versionId, AuthorActor.of(jwt).id());
	}

	/** 409 UNPUBLISHED_REFERENCES with "references" unless the body says {"publishReferences": true}. */
	@PostMapping("/{id}/publish")
	public PageDetail publish(@PathVariable UUID id, @RequestBody(required = false) Map<String, Object> body,
			@AuthenticationPrincipal Jwt jwt) {
		boolean along = body != null && Boolean.TRUE.equals(body.get("publishReferences"));
		return pages.publish(id, along, AuthorActor.of(jwt).requirePublish().id());
	}

	@PostMapping("/{id}/unpublish")
	public PageDetail unpublish(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
		return pages.unpublish(id, AuthorActor.of(jwt).requirePublish().id());
	}

	/** 409 PAGE_HAS_CHILDREN (childCount) unless includeChildren=true. */
	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void delete(@PathVariable UUID id, @RequestParam(defaultValue = "false") boolean includeChildren,
			@AuthenticationPrincipal Jwt jwt) {
		pages.delete(id, includeChildren, AuthorActor.of(jwt).requireDelete().id());
	}

	@PostMapping("/{id}/preview-link")
	public PreviewLink previewLink(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
		return pages.previewLink(id, AuthorActor.of(jwt).id());
	}
}
