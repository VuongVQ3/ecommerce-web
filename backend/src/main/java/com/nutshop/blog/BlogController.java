package com.nutshop.blog;

import com.nutshop.blog.BlogDtos.BlogCard;
import com.nutshop.blog.BlogDtos.BlogPostDetail;
import com.nutshop.common.PageResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Published blog posts (public). */
@RestController
@RequestMapping("/api/blog")
public class BlogController {

	private final BlogService blog;

	public BlogController(BlogService blog) {
		this.blog = blog;
	}

	@GetMapping
	public PageResponse<BlogCard> list(@RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "12") int size) {
		return blog.list(page, size);
	}

	/** Drafts and unknown slugs: 404 BLOG_POST_NOT_FOUND. */
	@GetMapping("/{slug}")
	public BlogPostDetail post(@PathVariable String slug) {
		return blog.get(slug);
	}
}
