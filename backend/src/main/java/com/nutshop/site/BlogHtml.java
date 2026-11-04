package com.nutshop.site;

import com.nutshop.blog.BlogDtos.BlogCard;
import com.nutshop.blog.BlogDtos.BlogPostDetail;
import com.nutshop.blog.BlogMarkdown;
import com.nutshop.product.PricingService;
import org.springframework.web.util.HtmlUtils;

import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * The blog's text as plain HTML inside #root (see HtmlPages), for crawlers and visitors without JavaScript. React
 * replaces it with BlogListPage / BlogPostPage, which show the same content with full styling.
 * <p>
 * Styled by the plain CSS rules for {@code .ssr-blog…} in frontend/src/index.css: Tailwind only generates classes it
 * finds in the frontend sources, so utility classes written here would have no styles.
 */
final class BlogHtml {

	/** Same wording as frontend/src/pages/BlogPostPage.tsx */
	static final String DISCLAIMER = "Thông tin trong bài chỉ mang tính tham khảo, không thay thế tư vấn của bác sĩ hay"
			+ " chuyên gia dinh dưỡng. Sản phẩm không phải là thuốc. Người dị ứng với các loại hạt cần cân nhắc trước khi"
			+ " dùng.";

	private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy").withZone(PricingService.VIETNAM);

	private BlogHtml() {
	}

	static String index(List<BlogCard> posts) {
		var html = new StringBuilder("<main class=\"ssr-blog ssr-blog-list\"><h1>Blog</h1><ul>");
		for (BlogCard post : posts) {
			html.append("<li><a href=\"/blog/").append(esc(post.slug())).append("\">").append(esc(post.title()))
				.append("</a>");
			if (post.excerpt() != null) {
				html.append("<p>").append(esc(post.excerpt())).append("</p>");
			}
			html.append("</li>");
		}
		return html.append("</ul></main>").toString();
	}

	/** contentHtml comes from BlogMarkdown, which escapes raw HTML: inserted as is. */
	static String post(BlogPostDetail post) {
		var html = new StringBuilder("<main class=\"ssr-blog\">");
		html.append("<nav aria-label=\"Breadcrumb\"><a href=\"/\">Trang chủ</a> › <a href=\"/blog\">Blog</a></nav>");
		html.append("<article><h1>").append(esc(post.title())).append("</h1><p class=\"ssr-blog-meta\">");
		if (post.publishedAt() != null) {
			html.append("<time datetime=\"").append(post.publishedAt()).append("\">").append(date(post.publishedAt()))
				.append("</time> · ");
		}
		html.append(post.readingMinutes()).append(" phút đọc</p>");
		if (post.coverImageUrl() != null) {
			html.append("<img class=\"ssr-blog-cover\" src=\"")
				.append(esc(BlogMarkdown.resized(post.coverImageUrl(), 1200)))
				.append("\" alt=\"")
				.append(esc(post.coverImageAlt()))
				.append("\"");
			if (post.coverWidth() != null && post.coverHeight() != null) {
				html.append(" width=\"").append(post.coverWidth()).append("\" height=\"").append(post.coverHeight()).append("\"");
			}
			html.append(" />");
		}
		html.append("<div class=\"prose-blog\">").append(post.contentHtml()).append("</div>");
		html.append("<aside class=\"ssr-blog-note\"><p>").append(esc(DISCLAIMER)).append("</p></aside></article>");
		if (!post.latest().isEmpty()) {
			html.append("<nav class=\"ssr-blog-more\" aria-label=\"Bài viết khác\"><h2>Bài viết khác</h2><ul>");
			for (BlogCard other : post.latest()) {
				html.append("<li><a href=\"/blog/").append(esc(other.slug())).append("\">").append(esc(other.title()))
					.append("</a></li>");
			}
			html.append("</ul></nav>");
		}
		return html.append("</main>").toString();
	}

	private static String date(Instant instant) {
		return DATE.format(instant);
	}

	private static String esc(String value) {
		return HtmlUtils.htmlEscape(value == null ? "" : value, "UTF-8");
	}
}
