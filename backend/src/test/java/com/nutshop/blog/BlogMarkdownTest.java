package com.nutshop.blog;

import com.nutshop.site.SiteProperties;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class BlogMarkdownTest {

	private static final String CLOUD = "https://res.cloudinary.com/demo/image/upload/v1/hat-lanh/blog/a.jpg";

	private final BlogMarkdown markdown = new BlogMarkdown(new SiteProperties("https://hat-lanh.com", null, null));

	private String html(String md) {
		return markdown.render(md, Map.of(CLOUD, new BlogMarkdown.ImageSize(1600, 900))).html();
	}

	@Test
	void rawHtmlIsEscaped() {
		String out = html("Xin chào <script>alert(1)</script>\n\n<div onclick=\"x()\">khối</div>\n\n<img src=x onerror=alert(1)>");
		assertThat(out).doesNotContain("<script").doesNotContain("<div").doesNotContain("<img src=x");
		assertThat(out).contains("&lt;script&gt;alert(1)&lt;/script&gt;").contains("&lt;div onclick=");
	}

	@Test
	void onlyHttpAndSitePathLinksSurvive() {
		String out = html("[a](javascript:alert(1)) [b](JAVASCRIPT:alert(1)) [c](jav&#x61;script:alert(1))"
				+ " [d](data:text/html,x) [e](//evil.com) [f](/\\evil.com) [g](mailto:x@y.z)");
		assertThat(out).doesNotContain("href=").contains("a b c d e f g");

		assertThat(html("[Sản phẩm](/san-pham/mac-ca)")).contains("<a href=\"/san-pham/mac-ca\">Sản phẩm</a>");
		assertThat(html("[Trang](https://www.hat-lanh.com/lien-he)"))
			.contains("<a href=\"https://www.hat-lanh.com/lien-he\">")
			.doesNotContain("nofollow");
	}

	@Test
	void externalLinksOpenInANewTabWithoutPassingRank() {
		assertThat(html("[Nguồn](https://example.org/a?b=1&c=\"2\")"))
			.contains("<a href=\"https://example.org/a?b=1&amp;c=&quot;2&quot;\" target=\"_blank\" rel=\"noopener nofollow\">Nguồn</a>");
	}

	@Test
	void imagesAreLazyWithSizeAndSrcset() {
		String out = html("Ảnh: ![Hạt mắc ca](" + CLOUD + ")");
		assertThat(out).contains("<p>Ảnh: <img ")
			.contains("src=\"https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_800/v1/hat-lanh/blog/a.jpg\"")
			.contains("f_auto,q_auto,w_480/v1/hat-lanh/blog/a.jpg 480w")
			.contains("f_auto,q_auto,w_1200/v1/hat-lanh/blog/a.jpg 1200w")
			.contains("alt=\"Hạt mắc ca\"")
			.contains("width=\"1600\" height=\"900\"")
			.contains("loading=\"lazy\"")
			.contains("decoding=\"async\"");

		// Other https images: no srcset, no size; http and javascript: images are dropped (alt text stays)
		assertThat(html("![x](https://example.org/a.png)")).contains("src=\"https://example.org/a.png\"")
			.doesNotContain("srcset")
			.doesNotContain("width=");
		assertThat(html("![không an toàn](javascript:alert(1)) ![http](http://example.org/a.png)"))
			.doesNotContain("<img")
			.contains("không an toàn");
	}

	@Test
	void titledImageAloneInItsParagraphIsAFigure() {
		String out = html("![Mắc ca rang](" + CLOUD + " \"Mắc ca <b>rang</b> củi\")");
		assertThat(out).startsWith("<figure><img ")
			.contains("<figcaption>Mắc ca &lt;b&gt;rang&lt;/b&gt; củi</figcaption></figure>")
			.doesNotContain("<p>");
	}

	@Test
	void headingsStartAtH2AndTablesWork() {
		String out = html("# Một\n\n## Hai\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n- x\n- y\n\n> trích");
		assertThat(out).contains("<h2>Một</h2>").contains("<h2>Hai</h2>").doesNotContain("<h1")
			.contains("<table>").contains("<td>1</td>")
			.contains("<li>x</li>")
			.contains("<blockquote>");
	}

	@Test
	void readingTimeAtTwoHundredWordsAMinute() {
		assertThat(markdown.render("", Map.of()).readingMinutes()).isEqualTo(1);
		assertThat(markdown.render("từ ".repeat(200), Map.of()).readingMinutes()).isEqualTo(1);
		assertThat(markdown.render("từ ".repeat(201), Map.of()).readingMinutes()).isEqualTo(2);
		assertThat(markdown.readingMinutesOf("## Tiêu đề\n\n" + "chữ ".repeat(1000))).isEqualTo(6);
	}
}
