package com.nutshop.blog;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.nutshop.product.ProductDtos.ProductSummary;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** What the blog API returns and accepts. */
public final class BlogDtos {

	public static final int MAX_CONTENT = 100_000;
	public static final int MAX_PRODUCTS = 4;

	private BlogDtos() {
	}

	/** A post in a list (blog page, "more posts"). */
	public record BlogCard(Long id, String title, String slug, String excerpt, String coverImageUrl, String coverImageAlt,
			Instant publishedAt, int readingMinutes) {
	}

	/**
	 * @param contentHtml rendered on the server (BlogMarkdown), safe to insert as HTML
	 * @param coverWidth / coverHeight null when not known
	 * @param products related products still on sale, with current prices
	 * @param latest up to 3 newest other posts
	 */
	public record BlogPostDetail(Long id, String title, String slug, String excerpt, String contentHtml,
			String coverImageUrl, String coverImageAlt, Integer coverWidth, Integer coverHeight, Instant publishedAt,
			Instant updatedAt, int readingMinutes, List<ProductSummary> products, List<BlogCard> latest,
			/** Set when the request used an old slug: the current one (the page should replace its URL). */
			@JsonInclude(JsonInclude.Include.NON_NULL) String redirectTo) {

		BlogPostDetail redirectedFrom() {
			return new BlogPostDetail(id, title, slug, excerpt, contentHtml, coverImageUrl, coverImageAlt, coverWidth,
					coverHeight, publishedAt, updatedAt, readingMinutes, products, latest, slug);
		}
	}

	// ---- back office ------------------------------------------------------------------------------------------

	public record AdminPostRow(Long id, String title, String slug, BlogPost.Status status, Instant publishedAt,
			Instant updatedAt) {
	}

	public record ImageRow(UUID id, String url, Integer width, Integer height, String alt) {

		static ImageRow from(BlogPostImage i) {
			return new ImageRow(i.getId(), i.getUrl(), i.getWidth(), i.getHeight(), i.getAlt());
		}
	}

	/** @param active false when hidden or without a price: not shown on the post */
	public record RelatedProduct(Long id, String name, String slug, String imageUrl, boolean active) {
	}

	/** @param content the Markdown as typed */
	public record AdminPostDetail(Long id, String title, String slug, String excerpt, String content,
			String coverImageUrl, String coverImageAlt, BlogPost.Status status, Instant publishedAt, Instant createdAt,
			Instant updatedAt, List<ImageRow> images, List<RelatedProduct> products) {
	}

	/** @param slug empty = from the title; taken = "-2", "-3"… is added */
	public record PostRequest(
			@NotBlank(message = "Vui lòng nhập tiêu đề") @Size(max = 150, message = "Tiêu đề tối đa 150 ký tự") String title,
			@Size(max = 200, message = "Slug tối đa 200 ký tự") String slug,
			@Size(max = 300, message = "Tóm tắt tối đa 300 ký tự") String excerpt,
			@Size(max = MAX_CONTENT, message = "Nội dung tối đa 100.000 ký tự") String content,
			@Size(max = 200, message = "Mô tả ảnh bìa tối đa 200 ký tự") String coverImageAlt,
			@Size(max = MAX_PRODUCTS, message = "Tối đa 4 sản phẩm liên quan") List<@NotNull Long> productIds) {
	}

	public record StatusRequest(@NotNull(message = "Vui lòng chọn trạng thái") BlogPost.Status status) {
	}

	/** @param imageId null = remove the cover (drafts only) */
	public record CoverRequest(UUID imageId,
			@Size(max = 200, message = "Mô tả ảnh bìa tối đa 200 ký tự") String alt) {
	}

	public record PreviewRequest(@Size(max = MAX_CONTENT, message = "Nội dung tối đa 100.000 ký tự") String content) {
	}

	public record PreviewResponse(String html, int readingMinutes) {
	}
}
