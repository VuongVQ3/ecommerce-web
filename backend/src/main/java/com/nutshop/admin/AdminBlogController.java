package com.nutshop.admin;

import com.nutshop.blog.AdminBlogService;
import com.nutshop.blog.BlogDtos.AdminPostDetail;
import com.nutshop.blog.BlogDtos.AdminPostRow;
import com.nutshop.blog.BlogDtos.CoverRequest;
import com.nutshop.blog.BlogDtos.ImageRow;
import com.nutshop.blog.BlogDtos.PostRequest;
import com.nutshop.blog.BlogDtos.PreviewRequest;
import com.nutshop.blog.BlogDtos.PreviewResponse;
import com.nutshop.blog.BlogDtos.StatusRequest;
import com.nutshop.blog.BlogPost;
import com.nutshop.common.PageResponse;
import com.nutshop.security.Roles;
import com.nutshop.user.Role;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.UUID;

/** Blog posts and their images: ADMIN only. */
@RestController
@RequestMapping("/api/admin/blog")
@Roles(Role.ADMIN)
public class AdminBlogController {

	private final AdminBlogService blog;

	public AdminBlogController(AdminBlogService blog) {
		this.blog = blog;
	}

	@GetMapping
	public PageResponse<AdminPostRow> list(@RequestParam(required = false) String q,
			@RequestParam(required = false) BlogPost.Status status, @RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "20") int size) {
		return blog.list(q, status, page, size);
	}

	@GetMapping("/{id}")
	public AdminPostDetail get(@PathVariable long id) {
		return blog.get(id);
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public AdminPostDetail create(@Valid @RequestBody PostRequest req, @AuthenticationPrincipal Jwt jwt) {
		return blog.create(req, userId(jwt));
	}

	@PutMapping("/{id}")
	public AdminPostDetail update(@PathVariable long id, @Valid @RequestBody PostRequest req,
			@AuthenticationPrincipal Jwt jwt) {
		return blog.update(id, req, userId(jwt));
	}

	/** Publish or unpublish (400 BLOG_NOT_READY with "missing" when the excerpt or cover is missing). */
	@PatchMapping("/{id}/status")
	public AdminPostDetail setStatus(@PathVariable long id, @Valid @RequestBody StatusRequest req,
			@AuthenticationPrincipal Jwt jwt) {
		return blog.setStatus(id, req.status(), userId(jwt));
	}

	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void delete(@PathVariable long id, @AuthenticationPrincipal Jwt jwt) {
		blog.delete(id, userId(jwt));
	}

	@PostMapping(path = "/{id}/images", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	@ResponseStatus(HttpStatus.CREATED)
	public ImageRow addImage(@PathVariable long id, @RequestPart("file") MultipartFile file,
			@RequestParam(required = false) String alt, @AuthenticationPrincipal Jwt jwt) throws IOException {
		return blog.addImage(id, file.getBytes(), alt, userId(jwt));
	}

	@DeleteMapping("/{id}/images/{imageId}")
	public AdminPostDetail deleteImage(@PathVariable long id, @PathVariable UUID imageId,
			@AuthenticationPrincipal Jwt jwt) {
		return blog.deleteImage(id, imageId, userId(jwt));
	}

	@PutMapping("/{id}/cover")
	public AdminPostDetail setCover(@PathVariable long id, @Valid @RequestBody CoverRequest req,
			@AuthenticationPrincipal Jwt jwt) {
		return blog.setCover(id, req.imageId(), req.alt(), userId(jwt));
	}

	/** Renders Markdown exactly as the live page does (the editor's preview). */
	@PostMapping("/preview")
	public PreviewResponse preview(@Valid @RequestBody PreviewRequest req) {
		return blog.preview(req.content());
	}

	private static UUID userId(Jwt jwt) {
		return AdminController.userId(jwt);
	}
}
