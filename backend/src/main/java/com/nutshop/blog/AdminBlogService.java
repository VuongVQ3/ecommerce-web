package com.nutshop.blog;

import com.nutshop.audit.AuditLog;
import com.nutshop.blog.BlogDtos.AdminPostDetail;
import com.nutshop.blog.BlogDtos.AdminPostRow;
import com.nutshop.blog.BlogDtos.ImageRow;
import com.nutshop.blog.BlogDtos.PostRequest;
import com.nutshop.blog.BlogDtos.PreviewResponse;
import com.nutshop.blog.BlogDtos.RelatedProduct;
import com.nutshop.common.ApiException;
import com.nutshop.common.PageResponse;
import com.nutshop.common.Slugs;
import com.nutshop.common.TextFold;
import com.nutshop.media.ImageStorage;
import com.nutshop.media.ImageStorage.StoredImage;
import com.nutshop.media.ImageTypes;
import com.nutshop.product.AdminProductService;
import com.nutshop.site.SiteController;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Writing and publishing blog posts (ADMIN only). Every change is audited. */
@Service
public class AdminBlogService {

	private static final Logger log = LoggerFactory.getLogger(AdminBlogService.class);

	static final int MAX_IMAGES = 50;
	private static final int MAX_PAGE_SIZE = 100;

	/** What the audit log keeps of a post (the Markdown itself only by length: it can be 100 000 characters). */
	record AuditView(String title, String slug, String excerpt, String postStatus, String coverImageUrl, String coverImageAlt,
			int contentLength, List<Long> productIds) {

		static AuditView of(BlogPost p, List<Long> productIds) {
			return new AuditView(p.getTitle(), p.getSlug(), p.getExcerpt(), p.getStatus().name(), p.getCoverImageUrl(),
					p.getCoverImageAlt(), p.getContent().length(), productIds);
		}
	}

	private final BlogPostRepository posts;
	private final BlogPostImageRepository images;
	private final BlogSlugHistory slugHistory;
	private final BlogMarkdown markdown;
	private final ImageStorage storage;
	private final AuditLog audit;
	private final JdbcTemplate jdbc;
	private final SiteController site;
	private final TransactionTemplate tx;
	private final String imageFolder;

	public AdminBlogService(BlogPostRepository posts, BlogPostImageRepository images, BlogSlugHistory slugHistory,
			BlogMarkdown markdown, ImageStorage storage, AuditLog audit, JdbcTemplate jdbc, SiteController site,
			PlatformTransactionManager txManager, @Value("${app.blog.image-folder:hat-lanh/blog}") String imageFolder) {
		this.posts = posts;
		this.images = images;
		this.slugHistory = slugHistory;
		this.markdown = markdown;
		this.storage = storage;
		this.audit = audit;
		this.jdbc = jdbc;
		this.site = site;
		this.tx = new TransactionTemplate(txManager);
		this.imageFolder = StringUtils.hasText(imageFolder) ? imageFolder.strip() : ImageStorage.BLOG_FOLDER;
	}

	/** Most recently edited first; {@code q} matches the title without case or accents. */
	@Transactional(readOnly = true)
	public PageResponse<AdminPostRow> list(String q, BlogPost.Status status, int page, int size) {
		List<Specification<BlogPost>> filters = new ArrayList<>();
		if (StringUtils.hasText(q)) {
			String pattern = "%" + TextFold.escapeLike(TextFold.fold(q.trim())) + "%";
			filters.add((root, query, cb) -> cb.like(cb.lower(cb.function("translate", String.class, root.get("title"),
					cb.literal(TextFold.ACCENTED), cb.literal(TextFold.PLAIN))), pattern, '\\'));
		}
		if (status != null) {
			filters.add((root, query, cb) -> cb.equal(root.get("status"), status));
		}
		var result = posts.findAll(Specification.allOf(filters), PageRequest.of(Math.max(page, 0),
				Math.clamp(size, 1, MAX_PAGE_SIZE), Sort.by(Sort.Order.desc("updatedAt"), Sort.Order.desc("id"))));
		return PageResponse.from(result.map(p -> new AdminPostRow(p.getId(), p.getTitle(), p.getSlug(), p.getStatus(),
				p.getPublishedAt(), p.getUpdatedAt())));
	}

	@Transactional(readOnly = true)
	public AdminPostDetail get(long id) {
		return detail(posts.findById(id).orElseThrow(AdminBlogService::postNotFound));
	}

	@Transactional
	public AdminPostDetail create(PostRequest req, UUID actorId) {
		BlogPost post = new BlogPost(req.title().trim(), slugFor(req.slug(), req.title(), null), actorId);
		apply(post, req);
		posts.saveAndFlush(post);
		List<Long> productIds = setProducts(post.getId(), req.productIds());
		audit.entry("BLOG_POST_CREATED", "BLOG_POST", post.getId(), post.getTitle())
			.by(actorId)
			.changes(null, AuditView.of(post, productIds))
			.record();
		return detail(post);
	}

	@Transactional
	public AdminPostDetail update(long id, PostRequest req, UUID actorId) {
		BlogPost post = posts.lockById(id).orElseThrow(AdminBlogService::postNotFound);
		AuditView before = AuditView.of(post, productIds(id));
		String oldSlug = post.getSlug();
		String newSlug = slugFor(req.slug(), req.title(), id);
		post.setTitle(req.title().trim());
		post.setSlug(newSlug);
		apply(post, req);
		if (post.isPublished()) {
			requireReady(post);
		}
		// Only a slug that was public is worth redirecting
		if (post.getPublishedAt() != null) {
			slugHistory.changed(id, oldSlug, newSlug);
		}
		post.touch(actorId);
		posts.flush();
		List<Long> productIds = setProducts(id, req.productIds());
		audit.entry("BLOG_POST_UPDATED", "BLOG_POST", id, post.getTitle())
			.by(actorId)
			.changes(before, AuditView.of(post, productIds))
			.record();
		if (post.isPublished()) {
			clearSitemapAfterCommit();
		}
		return detail(post);
	}

	/** Publishing needs an excerpt and a cover with alt text; the first publication date is kept on republish. */
	@Transactional
	public AdminPostDetail setStatus(long id, BlogPost.Status status, UUID actorId) {
		BlogPost post = posts.lockById(id).orElseThrow(AdminBlogService::postNotFound);
		if (post.getStatus() == status) {
			return detail(post);
		}
		if (status == BlogPost.Status.PUBLISHED) {
			requireReady(post);
			if (post.getPublishedAt() == null) {
				post.setPublishedAt(Instant.now());
			}
		}
		post.setStatus(status);
		post.touch(actorId);
		audit.entry(status == BlogPost.Status.PUBLISHED ? "BLOG_POST_PUBLISHED" : "BLOG_POST_UNPUBLISHED", "BLOG_POST",
				id, post.getTitle())
			.by(actorId)
			.record();
		clearSitemapAfterCommit();
		return detail(post);
	}

	/** Deletes the post, its related products and old slugs; its image files are removed after the commit. */
	@Transactional
	public void delete(long id, UUID actorId) {
		BlogPost post = posts.lockById(id).orElseThrow(AdminBlogService::postNotFound);
		AuditView before = AuditView.of(post, productIds(id));
		List<String> publicIds = images.findByPostIdOrderByCreatedAtAsc(id).stream().map(BlogPostImage::getPublicId).toList();
		posts.delete(post);
		posts.flush();
		audit.entry("BLOG_POST_DELETED", "BLOG_POST", id, before.title()).by(actorId).changes(before, null).record();
		TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
			@Override
			public void afterCommit() {
				publicIds.forEach(AdminBlogService.this::deleteQuietly);
				site.clearSitemapCache();
			}
		});
	}

	/**
	 * Same checks as product images (type by magic bytes, 5MB). The file is uploaded outside the transaction; a
	 * failed save removes it again.
	 */
	public ImageRow addImage(long id, byte[] bytes, String alt, UUID actorId) {
		if (bytes == null || bytes.length == 0) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_IMAGE", "Vui lòng chọn một ảnh");
		}
		if (bytes.length > AdminProductService.MAX_IMAGE_BYTES) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "IMAGE_TOO_LARGE", "Ảnh tối đa 5MB");
		}
		ImageTypes.ImageType type = ImageTypes.detect(bytes)
			.orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "INVALID_IMAGE",
					"Chỉ nhận ảnh JPEG, PNG hoặc WebP (nội dung file không phải ảnh hợp lệ)"));
		if (!posts.existsById(id)) {
			throw postNotFound();
		}
		if (imageCount(id) >= MAX_IMAGES) {
			throw tooManyImages();
		}
		StoredImage stored = storage.upload(bytes, type, imageFolder);
		String cleanAlt = clean(alt, 200);
		try {
			return tx.execute(status -> {
				BlogPost post = posts.lockById(id).orElseThrow(AdminBlogService::postNotFound);
				if (imageCount(id) >= MAX_IMAGES) {
					throw tooManyImages();
				}
				BlogPostImage image = images.save(new BlogPostImage(id, stored.publicId(), stored.url(), stored.width(),
						stored.height(), cleanAlt));
				audit.entry("BLOG_IMAGE_ADDED", "BLOG_POST", id, post.getTitle())
					.by(actorId)
					.changes(null, Map.of("publicId", stored.publicId()))
					.record();
				return ImageRow.from(image);
			});
		}
		catch (RuntimeException ex) {
			deleteQuietly(stored.publicId());
			throw ex;
		}
	}

	/**
	 * Refused for the cover, and for an image shown in a published post (it would break on the live page); an image
	 * used in a draft may go (the editor warns first).
	 */
	@Transactional
	public AdminPostDetail deleteImage(long id, UUID imageId, UUID actorId) {
		BlogPost post = posts.lockById(id).orElseThrow(AdminBlogService::postNotFound);
		BlogPostImage image = images.findById(imageId)
			.filter(i -> i.getPostId().equals(id))
			.orElseThrow(AdminBlogService::imageNotFound);
		if (image.getPublicId().equals(post.getCoverImagePublicId())) {
			throw new ApiException(HttpStatus.CONFLICT, "IMAGE_IS_COVER", "Ảnh đang là ảnh bìa. Hãy đổi ảnh bìa trước khi xoá.");
		}
		if (post.isPublished() && post.getContent().contains(image.getUrl())) {
			throw new ApiException(HttpStatus.CONFLICT, "IMAGE_IN_USE",
					"Ảnh đang được dùng trong bài đã đăng. Hãy bỏ ảnh khỏi nội dung và lưu bài trước khi xoá.");
		}
		images.delete(image);
		post.touch(actorId);
		audit.entry("BLOG_IMAGE_DELETED", "BLOG_POST", id, post.getTitle())
			.by(actorId)
			.changes(Map.of("publicId", image.getPublicId()), null)
			.record();
		String publicId = image.getPublicId();
		TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
			@Override
			public void afterCommit() {
				deleteQuietly(publicId);
			}
		});
		return detail(post);
	}

	/** One of the post's images becomes the cover (with its alt text); null removes the cover of a draft. */
	@Transactional
	public AdminPostDetail setCover(long id, UUID imageId, String alt, UUID actorId) {
		BlogPost post = posts.lockById(id).orElseThrow(AdminBlogService::postNotFound);
		AuditView before = AuditView.of(post, productIds(id));
		if (imageId == null) {
			if (post.isPublished()) {
				throw new ApiException(HttpStatus.CONFLICT, "COVER_REQUIRED", "Bài đã đăng phải có ảnh bìa");
			}
			post.setCover(null, null, null);
		}
		else {
			BlogPostImage image = images.findById(imageId)
				.filter(i -> i.getPostId().equals(id))
				.orElseThrow(AdminBlogService::imageNotFound);
			String cleanAlt = clean(alt, 200);
			if (cleanAlt == null) {
				cleanAlt = image.getAlt();
			}
			if (cleanAlt == null) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "COVER_ALT_REQUIRED", "Vui lòng nhập mô tả ảnh bìa (alt)");
			}
			post.setCover(image.getUrl(), image.getPublicId(), cleanAlt);
		}
		post.touch(actorId);
		audit.entry("BLOG_POST_UPDATED", "BLOG_POST", id, post.getTitle())
			.by(actorId)
			.changes(before, AuditView.of(post, before.productIds()))
			.record();
		return detail(post);
	}

	/** The editor's preview: the same renderer as the live page. */
	public PreviewResponse preview(String content) {
		BlogMarkdown.Rendered rendered = markdown.render(content, Map.of());
		return new PreviewResponse(rendered.html(), rendered.readingMinutes());
	}

	// ---- helpers ----------------------------------------------------------------------------------------------

	private void apply(BlogPost post, PostRequest req) {
		post.setExcerpt(clean(req.excerpt(), 300));
		post.setContent(req.content() == null ? "" : req.content());
		if (post.getCoverImageUrl() != null) {
			String alt = clean(req.coverImageAlt(), 200);
			if (alt == null) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "COVER_ALT_REQUIRED", "Vui lòng nhập mô tả ảnh bìa (alt)");
			}
			post.setCover(post.getCoverImageUrl(), post.getCoverImagePublicId(), alt);
		}
	}

	/** 400 BLOG_NOT_READY with the list of what is missing (EXCERPT, COVER, COVER_ALT). */
	private static void requireReady(BlogPost post) {
		List<String> missing = new ArrayList<>();
		if (!StringUtils.hasText(post.getExcerpt())) {
			missing.add("EXCERPT");
		}
		if (post.getCoverImageUrl() == null) {
			missing.add("COVER");
		}
		else if (!StringUtils.hasText(post.getCoverImageAlt())) {
			missing.add("COVER_ALT");
		}
		if (!missing.isEmpty()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "BLOG_NOT_READY",
					"Bài đăng cần có tóm tắt, ảnh bìa và mô tả ảnh bìa").withProperty("missing", missing);
		}
	}

	/** Valid explicit slug, or one from the title; "-2", "-3"… when taken by another post or its old address. */
	private String slugFor(String requested, String title, Long selfId) {
		String base;
		if (StringUtils.hasText(requested)) {
			base = requested.trim();
			if (!Slugs.isValid(base)) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_SLUG",
						"Slug chỉ gồm chữ thường không dấu, số và dấu gạch ngang (ví dụ: an-hat-moi-ngay)");
			}
		}
		else {
			base = Slugs.from(title).isEmpty() ? "bai-viet" : Slugs.from(title);
		}
		String slug = base;
		for (int n = 2; slugTaken(slug, selfId); n++) {
			slug = base + "-" + n;
		}
		return slug;
	}

	private boolean slugTaken(String slug, Long selfId) {
		return posts.findBySlug(slug).filter(p -> !p.getId().equals(selfId)).isPresent()
				|| slugHistory.usedByOther(slug, selfId);
	}

	/** Replaces the related products (unknown ids → 400), keeping the order given. */
	private List<Long> setProducts(long postId, List<Long> requested) {
		List<Long> ids = requested == null ? List.of() : List.copyOf(new LinkedHashSet<>(requested));
		if (!ids.isEmpty()) {
			Integer found = jdbc.queryForObject("SELECT COUNT(*) FROM products WHERE id = ANY(?)", Integer.class,
					(Object) ids.toArray(Long[]::new));
			if (found == null || found != ids.size()) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "PRODUCT_NOT_FOUND", "Sản phẩm liên quan không tồn tại");
			}
		}
		jdbc.update("DELETE FROM blog_post_products WHERE post_id = ?", postId);
		for (int i = 0; i < ids.size(); i++) {
			jdbc.update("INSERT INTO blog_post_products (post_id, product_id, position) VALUES (?, ?, ?)", postId,
					ids.get(i), i);
		}
		return ids;
	}

	private List<Long> productIds(long postId) {
		return jdbc.queryForList("SELECT product_id FROM blog_post_products WHERE post_id = ? ORDER BY position",
				Long.class, postId);
	}

	private AdminPostDetail detail(BlogPost p) {
		List<RelatedProduct> products = jdbc.query("""
				SELECT pr.id, pr.name, pr.slug, pr.image_url, pr.active AND pr.price > 0 AS on_sale
				FROM blog_post_products bp JOIN products pr ON pr.id = bp.product_id
				WHERE bp.post_id = ? ORDER BY bp.position""",
				(rs, n) -> new RelatedProduct(rs.getLong("id"), rs.getString("name"), rs.getString("slug"),
						rs.getString("image_url"), rs.getBoolean("on_sale")),
				p.getId());
		return new AdminPostDetail(p.getId(), p.getTitle(), p.getSlug(), p.getExcerpt(), p.getContent(),
				p.getCoverImageUrl(), p.getCoverImageAlt(), p.getStatus(), p.getPublishedAt(), p.getCreatedAt(),
				p.getUpdatedAt(), images.findByPostIdOrderByCreatedAtAsc(p.getId()).stream().map(ImageRow::from).toList(),
				products);
	}

	private long imageCount(long postId) {
		Long count = jdbc.queryForObject("SELECT COUNT(*) FROM blog_post_images WHERE post_id = ?", Long.class, postId);
		return count == null ? 0 : count;
	}

	private void clearSitemapAfterCommit() {
		TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
			@Override
			public void afterCommit() {
				site.clearSitemapCache();
			}
		});
	}

	private void deleteQuietly(String publicId) {
		try {
			storage.delete(publicId);
		}
		catch (RuntimeException ex) {
			log.warn("Could not delete image {} from storage", publicId, ex);
		}
	}

	private static String clean(String value, int max) {
		if (value == null || value.isBlank()) {
			return null;
		}
		String v = value.strip().replaceAll("\\s+", " ");
		return v.length() > max ? v.substring(0, max) : v;
	}

	private static ApiException postNotFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "BLOG_POST_NOT_FOUND", "Không tìm thấy bài viết");
	}

	private static ApiException imageNotFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "IMAGE_NOT_FOUND", "Không tìm thấy ảnh");
	}

	private static ApiException tooManyImages() {
		return new ApiException(HttpStatus.CONFLICT, "TOO_MANY_IMAGES", "Mỗi bài viết tối đa " + MAX_IMAGES + " ảnh");
	}
}
