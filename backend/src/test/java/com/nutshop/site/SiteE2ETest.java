package com.nutshop.site;

import com.nutshop.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Server-rendered meta, robots/sitemap, 404 handling, health and security headers. */
@IntegrationTest
class SiteE2ETest {

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcTemplate jdbc;

	@Autowired
	SiteController siteController;

	private String html(String path) throws Exception {
		return mvc.perform(get(path)).andReturn().getResponse().getContentAsString();
	}

	private long hiddenProduct(String name, String slug) {
		return jdbc.queryForObject("""
				INSERT INTO products (category_id, name, slug, description, price, weight_grams, on_hand, reserved, active,
				                      calories, protein, fat, carbs, fiber)
				VALUES (1, ?, ?, 'Mô tả <b>đậm</b> & "trích dẫn" </script>', 99000, 250, 5, 0, false, 500, 20, 40, 20, 10)
				RETURNING id""", Long.class, name, slug);
	}

	/** On sale in "Hạt dinh dưỡng" (the V2 sample products are hidden since V17); delete it afterwards. */
	private long productOnSale(String name, String slug) {
		return jdbc.queryForObject("""
				INSERT INTO products (category_id, name, slug, description, price, weight_grams, on_hand, reserved, active)
				VALUES ((SELECT id FROM categories WHERE slug = 'hat-dinh-duong'), ?, ?, 'Mắc ca nguyên vỏ.', 189000, 500,
				        10, 0, true)
				RETURNING id""", Long.class, name, slug);
	}

	@Test
	void productPageHasMetaOpenGraphAndJsonLdWithoutJavaScript() throws Exception {
		String slug = "mac-ca-" + UUID.randomUUID();
		long id = productOnSale("Mắc ca thử", slug);
		try {
			checkProductPage(slug);
		}
		finally {
			jdbc.update("DELETE FROM products WHERE id = ?", id);
		}
	}

	private void checkProductPage(String slug) throws Exception {
		mvc.perform(get("/san-pham/" + slug))
			.andExpect(status().isOk())
			.andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
			.andExpect(header().string("Cache-Control", "no-cache"));
		String page = html("/san-pham/" + slug);
		assertThat(page).contains("<title>Mắc ca thử 500g – 189.000₫ | Hạt Lành</title>")
			.contains("<link rel=\"canonical\" href=\"http://localhost:8080/san-pham/" + slug + "\" />")
			.contains("<meta property=\"og:type\" content=\"product\" />")
			.contains("<meta property=\"og:image\" content=\"http://localhost:8080/og-default.png\" />")
			.contains("<meta name=\"twitter:card\" content=\"summary_large_image\" />")
			.contains("<script type=\"application/ld+json\">")
			.contains("\"@type\":\"Product\"")
			.contains("\"price\":189000")
			.contains("\"priceCurrency\":\"VND\"")
			.contains("\"availability\":\"https://schema.org/InStock\"")
			.contains("\"@type\":\"BreadcrumbList\"")
			.contains("http://localhost:8080/danh-muc/hat-dinh-duong")
			.doesNotContain("noindex");
		String description = page.replaceAll("(?s).*<meta name=\"description\" content=\"([^\"]*)\".*", "$1");
		assertThat(description.length()).isLessThanOrEqualTo(160);
	}

	@Test
	void missingAndHiddenProductsAreReal404s() throws Exception {
		mvc.perform(get("/san-pham/khong-co-san-pham-nay"))
			.andExpect(status().isNotFound())
			.andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
			.andExpect(content().string(containsString("Không tìm thấy trang")))
			.andExpect(content().string(containsString("noindex")));

		String slug = "an-" + UUID.randomUUID();
		long id = hiddenProduct("Sản phẩm ẩn", slug);
		try {
			mvc.perform(get("/san-pham/" + slug)).andExpect(status().isNotFound());
			mvc.perform(get("/api/products/" + slug)).andExpect(status().isNotFound());
		}
		finally {
			jdbc.update("DELETE FROM products WHERE id = ?", id);
		}
	}

	@Test
	void valuesAreEscapedInHtmlAndJsonLd() throws Exception {
		String slug = "xss-" + UUID.randomUUID();
		long id = hiddenProduct("Hạt <script>alert(1)</script> \"x\" & y", slug);
		jdbc.update("UPDATE products SET active = true WHERE id = ?", id);
		try {
			String page = html("/san-pham/" + slug);
			assertThat(page).doesNotContain("<script>alert(1)")
				.doesNotContain("<b>đậm</b>")
				.contains("Hạt &lt;script&gt;alert(1)&lt;/script&gt; &quot;x&quot; &amp; y")
				.contains("\\u003cscript\\u003ealert(1)\\u003c/script\\u003e");
			// Exactly the JSON-LD script elements close; the description's "</script>" did not break out
			assertThat(page.split("</script>", -1).length - 1).isEqualTo(2);
		}
		finally {
			jdbc.update("DELETE FROM products WHERE id = ?", id);
		}
	}

	@Test
	void categoryAndStaticPagesHaveTheirOwnTitles() throws Exception {
		assertThat(html("/danh-muc/hat-dinh-duong")).contains("<title>Hạt dinh dưỡng | Hạt Lành</title>")
			.contains("href=\"http://localhost:8080/danh-muc/hat-dinh-duong\"");
		mvc.perform(get("/danh-muc/khong-co")).andExpect(status().isNotFound());
		// Renamed in V17: the old address moves permanently, query kept
		mvc.perform(get("/danh-muc/hat-mix-granola?sort=price_asc"))
			.andExpect(status().isMovedPermanently())
			.andExpect(header().string("Location", "/danh-muc/hat-mix-ngu-coc?sort=price_asc"));
		assertThat(html("/danh-muc/hat-mix-ngu-coc")).contains("<title>Hạt mix &amp; ngũ cốc | Hạt Lành</title>");
		assertThat(html("/")).contains("<title>Hạt Lành – Hạt dinh dưỡng &amp; đặc sản chọn lọc</title>");
		assertThat(html("/chinh-sach-doi-tra")).contains("<title>Chính sách đổi trả | Hạt Lành</title>");
		assertThat(html("/lien-he")).contains("<title>Liên hệ | Hạt Lành</title>");
		assertThat(html("/gio-hang")).contains("noindex");
		assertThat(html("/admin/don-hang")).contains("noindex");

		mvc.perform(get("/san-pham?category=hat-dinh-duong&sort=price_asc"))
			.andExpect(status().isMovedPermanently())
			.andExpect(header().string("Location", "/danh-muc/hat-dinh-duong?sort=price_asc"));
		mvc.perform(get("/dieu-khoan"))
			.andExpect(status().isMovedPermanently())
			.andExpect(header().string("Location", "/dieu-khoan-su-dung"));
	}

	@Test
	void unknownPathsAre404ByKind() throws Exception {
		mvc.perform(get("/khong-ton-tai"))
			.andExpect(status().isNotFound())
			.andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML));
		mvc.perform(get("/api/khong-ton-tai"))
			.andExpect(status().isNotFound())
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
			.andExpect(jsonPath("$.code").value("NOT_FOUND"));
		mvc.perform(get("/khong-co.png"))
			.andExpect(status().isNotFound())
			.andExpect(content().string(not(containsString("<html"))));
		mvc.perform(get("/actuator/env")).andExpect(status().isNotFound());
		// Existing endpoints still require sign-in
		mvc.perform(get("/api/cart")).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/admin/orders")).andExpect(status().isUnauthorized());
	}

	@Test
	void robotsAndSitemap() throws Exception {
		mvc.perform(get("/robots.txt"))
			.andExpect(status().isOk())
			.andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_PLAIN))
			.andExpect(content().string(containsString("Disallow: /admin")))
			.andExpect(content().string(containsString("Disallow: /tai-khoan")))
			.andExpect(content().string(containsString("Disallow: /thanh-toan")))
			.andExpect(content().string(containsString("Disallow: /api/")))
			.andExpect(content().string(containsString("Sitemap: http://localhost:8080/sitemap.xml")));

		String slug = "an-" + UUID.randomUUID();
		long id = hiddenProduct("Ẩn khỏi sitemap", slug);
		String onSale = "ban-" + UUID.randomUUID();
		long saleId = productOnSale("Mắc ca thử", onSale);
		siteController.clearSitemapCache();
		try {
			mvc.perform(get("/sitemap.xml"))
				.andExpect(status().isOk())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_XML))
				.andExpect(header().string("Cache-Control", "max-age=3600, public"))
				.andExpect(content().string(startsWith("<?xml")))
				.andExpect(content().string(containsString("<loc>http://localhost:8080/san-pham/" + onSale + "</loc><lastmod>")))
				.andExpect(content().string(containsString("<loc>http://localhost:8080/danh-muc/hat-dinh-duong</loc>")))
				// Categories with nothing on sale are left out
				.andExpect(content().string(not(containsString("/danh-muc/banh-thanh-hat<"))))
				.andExpect(content().string(not(containsString("/danh-muc/hat-sieu-thuc-pham<"))))
				.andExpect(content().string(containsString("<loc>http://localhost:8080/chinh-sach-doi-tra</loc>")))
				.andExpect(content().string(not(containsString(slug))))
				.andExpect(content().string(not(containsString("/gio-hang"))));
		}
		finally {
			jdbc.update("DELETE FROM products WHERE id IN (?, ?)", id, saleId);
		}
	}

	@Test
	void healthIsPublicAndChecksTheDatabase() throws Exception {
		mvc.perform(get("/api/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("UP"));
		mvc.perform(head("/api/health")).andExpect(status().isOk());
		mvc.perform(get("/api/site")).andExpect(status().isOk()).andExpect(jsonPath("$.business").isMap())
			.andExpect(jsonPath("$.contact").isMap())
			.andExpect(jsonPath("$.social").isMap());
	}

	@Test
	void securityHeaders() throws Exception {
		mvc.perform(get("/"))
			.andExpect(header().string("Content-Security-Policy", containsString("frame-ancestors 'none'")))
			.andExpect(header().string("Content-Security-Policy", containsString("https://res.cloudinary.com")))
			.andExpect(header().string("Content-Security-Policy", containsString("https://fonts.googleapis.com")))
			.andExpect(header().string("X-Content-Type-Options", "nosniff"))
			.andExpect(header().string("Referrer-Policy", "strict-origin-when-cross-origin"));
	}

	/** Every route of the React app (frontend/src/main.tsx) must be served by PageController, not 404. */
	@Test
	void everyFrontendRouteIsServed() throws Exception {
		String slug = "route-" + UUID.randomUUID();
		long id = productOnSale("Mắc ca thử", slug);
		String routes = Files.readString(Path.of("../frontend/src/main.tsx"));
		Matcher m = Pattern.compile("path: '([^']+)'").matcher(routes);
		List<String> paths = new ArrayList<>();
		while (m.find()) {
			String path = m.group(1);
			if (path.equals("*")) {
				continue;
			}
			// Children of /admin and /tai-khoan are relative
			if (!path.startsWith("/")) {
				path = (routes.indexOf("path: '" + path + "'") > routes.indexOf("path: '/tai-khoan'")
						? "/tai-khoan/" : "/admin/") + path;
			}
			paths.add(path.replace(":slug", path.startsWith("/danh-muc") ? "hat-dinh-duong" : slug)
				.replace(":code", "HL2610130000")
				.replace(":id", "1"));
		}
		assertThat(paths).contains("/", "/san-pham", "/danh-muc/hat-dinh-duong", "/lien-he", "/admin/don-hang");
		try {
			for (String path : paths) {
				int status = mvc.perform(get(path)).andReturn().getResponse().getStatus();
				assertThat(status).as(path).isEqualTo(200);
			}
		}
		finally {
			jdbc.update("DELETE FROM products WHERE id = ?", id);
		}
	}
}
