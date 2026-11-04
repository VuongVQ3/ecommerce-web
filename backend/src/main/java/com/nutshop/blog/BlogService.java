package com.nutshop.blog;

import com.nutshop.blog.BlogDtos.BlogCard;
import com.nutshop.blog.BlogDtos.BlogPostDetail;
import com.nutshop.common.ApiException;
import com.nutshop.common.PageResponse;
import com.nutshop.product.ProductService;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** The public side of the blog: published posts only (drafts are not found). */
@Service
@Transactional(readOnly = true)
public class BlogService {

	static final int MAX_PAGE_SIZE = 24;
	static final int LATEST = 3;

	private final BlogPostRepository posts;
	private final BlogPostImageRepository images;
	private final BlogSlugHistory slugHistory;
	private final BlogMarkdown markdown;
	private final ProductService productService;
	private final JdbcTemplate jdbc;

	public BlogService(BlogPostRepository posts, BlogPostImageRepository images, BlogSlugHistory slugHistory,
			BlogMarkdown markdown, ProductService productService, JdbcTemplate jdbc) {
		this.posts = posts;
		this.images = images;
		this.slugHistory = slugHistory;
		this.markdown = markdown;
		this.productService = productService;
		this.jdbc = jdbc;
	}

	/** Newest first. */
	public PageResponse<BlogCard> list(int page, int size) {
		var result = posts.findByStatusOrderByPublishedAtDescIdDesc(BlogPost.Status.PUBLISHED,
				PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, MAX_PAGE_SIZE)));
		return PageResponse.from(result.map(this::card));
	}

	/** An old slug answers with the post and {@code redirectTo}, as products do. */
	public BlogPostDetail get(String slug) {
		Optional<BlogPost> current = posts.findBySlug(slug);
		if (current.isPresent()) {
			return current.filter(BlogPost::isPublished).map(this::detail).orElseThrow(BlogService::notFound);
		}
		return publishedByOldSlug(slug).map(p -> detail(p).redirectedFrom()).orElseThrow(BlogService::notFound);
	}

	public Optional<BlogPost> publishedBySlug(String slug) {
		return posts.findBySlug(slug).filter(BlogPost::isPublished);
	}

	/** The published post that used to have {@code slug} (and no longer does). */
	public Optional<BlogPost> publishedByOldSlug(String slug) {
		return slugHistory.postFor(slug)
			.flatMap(posts::findById)
			.filter(BlogPost::isPublished)
			.filter(p -> !p.getSlug().equals(slug));
	}

	public BlogPostDetail detail(BlogPost post) {
		List<BlogPostImage> postImages = images.findByPostIdOrderByCreatedAtAsc(post.getId());
		Map<String, BlogMarkdown.ImageSize> sizes = new HashMap<>();
		Integer coverWidth = null;
		Integer coverHeight = null;
		for (BlogPostImage image : postImages) {
			if (image.getWidth() != null && image.getHeight() != null) {
				sizes.put(image.getUrl(), new BlogMarkdown.ImageSize(image.getWidth(), image.getHeight()));
				if (image.getPublicId().equals(post.getCoverImagePublicId())) {
					coverWidth = image.getWidth();
					coverHeight = image.getHeight();
				}
			}
		}
		BlogMarkdown.Rendered rendered = markdown.render(post.getContent(), sizes);
		List<Long> productIds = jdbc.queryForList(
				"SELECT product_id FROM blog_post_products WHERE post_id = ? ORDER BY position", Long.class, post.getId());
		List<BlogCard> latest = posts.findLatestExcept(post.getId(), PageRequest.of(0, LATEST))
			.stream()
			.map(this::card)
			.toList();
		return new BlogPostDetail(post.getId(), post.getTitle(), post.getSlug(), post.getExcerpt(), rendered.html(),
				post.getCoverImageUrl(), post.getCoverImageAlt(), coverWidth, coverHeight, post.getPublishedAt(),
				post.getUpdatedAt(), rendered.readingMinutes(), productService.onSaleSummaries(productIds), latest, null);
	}

	/** The newest posts, for the links written into the /blog page for crawlers. */
	public List<BlogCard> latest(int count) {
		return list(0, count).items();
	}

	BlogCard card(BlogPost p) {
		return new BlogCard(p.getId(), p.getTitle(), p.getSlug(), p.getExcerpt(), p.getCoverImageUrl(),
				p.getCoverImageAlt(), p.getPublishedAt(), markdown.readingMinutesOf(p.getContent()));
	}

	private static ApiException notFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "BLOG_POST_NOT_FOUND", "Không tìm thấy bài viết");
	}
}
