package com.nutshop.blog;

import com.jayway.jsonpath.JsonPath;
import com.nutshop.IntegrationTest;
import com.nutshop.auth.AuthCookies;
import com.nutshop.auth.TokenService;
import com.nutshop.media.ImageStorage;
import com.nutshop.security.RateLimiter;
import com.nutshop.site.SiteController;
import com.nutshop.user.UserRepository;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import testsupport.RegisterJson;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Blog: back office, public API, server-rendered pages and sitemap. Image storage is faked. */
@IntegrationTest
class BlogE2ETest {

	private static final byte[] PNG = { (byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n', 0, 0, 0, 13 };

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcTemplate jdbc;

	@Autowired
	UserRepository users;

	@Autowired
	TokenService tokens;

	@Autowired
	RateLimiter authRateLimiter;

	@Autowired
	SiteController siteController;

	@MockitoBean
	ImageStorage storage;

	private final List<Long> createdProducts = new ArrayList<>();
	private Cookie admin;

	@BeforeEach
	void setUp() throws Exception {
		authRateLimiter.reset();
		when(storage.isEnabled()).thenReturn(true);
		when(storage.upload(any(), any(), any())).thenAnswer(inv -> {
			String id = "test/" + UUID.randomUUID();
			return new ImageStorage.StoredImage(id, "https://res.cloudinary.com/demo/image/upload/v1/" + id + ".png", 1600,
					900);
		});
		admin = as("ADMIN");
	}

	@AfterEach
	void cleanUp() {
		jdbc.update("DELETE FROM blog_posts WHERE title LIKE 'Test blog%'");
		for (Long id : createdProducts) {
			jdbc.update("DELETE FROM products WHERE id = ?", id);
		}
		siteController.clearSitemapCache();
	}

	@Test
	void onlyAdminsUseTheBackOffice() throws Exception {
		long id = createPost("Test blog Quyền", null, null, "x");
		String imageId = upload(id);
		mvc.perform(get("/api/admin/blog").header("X-Requested-With", "XMLHttpRequest")).andExpect(status().isUnauthorized());
		for (String role : List.of("CUSTOMER", "STAFF")) {
			Cookie cookie = as(role);
			call(get("/api/admin/blog"), cookie).andExpect(status().isForbidden());
			call(get("/api/admin/blog/" + id), cookie).andExpect(status().isForbidden());
			call(json(post("/api/admin/blog"), postJson("Test blog cấm", null, null, "x", null, "[]")), cookie)
				.andExpect(status().isForbidden());
			call(json(put("/api/admin/blog/" + id), postJson("Test blog cấm", null, null, "x", null, "[]")), cookie)
				.andExpect(status().isForbidden());
			call(json(patch("/api/admin/blog/" + id + "/status"), "{\"status\":\"PUBLISHED\"}"), cookie)
				.andExpect(status().isForbidden());
			call(json(put("/api/admin/blog/" + id + "/cover"), "{\"imageId\":\"" + imageId + "\",\"alt\":\"x\"}"), cookie)
				.andExpect(status().isForbidden());
			call(delete("/api/admin/blog/" + id + "/images/" + imageId), cookie).andExpect(status().isForbidden());
			mvc.perform(multipart("/api/admin/blog/" + id + "/images")
				.file(new MockMultipartFile("file", "a.png", "image/png", PNG))
				.header("X-Requested-With", "XMLHttpRequest")
				.cookie(cookie)).andExpect(status().isForbidden());
			call(delete("/api/admin/blog/" + id), cookie).andExpect(status().isForbidden());
			call(json(post("/api/admin/blog/preview"), "{\"content\":\"x\"}"), cookie).andExpect(status().isForbidden());
		}
		// Nothing changed; only GET /api/blog and /api/blog/{slug} are open, writing there is not
		assertThat(jdbc.queryForObject("SELECT status FROM blog_posts WHERE id = ?", String.class, id)).isEqualTo("DRAFT");
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM blog_post_images WHERE post_id = ?", Long.class, id)).isEqualTo(1);
		mvc.perform(post("/api/blog").header("X-Requested-With", "XMLHttpRequest").contentType(MediaType.APPLICATION_JSON)
			.content("{}")).andExpect(status().isUnauthorized());
		call(get("/api/admin/blog"), admin).andExpect(status().isOk());
	}

	@Test
	void draftIsNotFoundUntilPublishedWithExcerptAndCover() throws Exception {
		long id = createPost("Test blog Ăn hạt mỗi ngày", null, null, "Nội dung **đậm**.");
		String slug = slugOf(id);
		assertThat(slug).isEqualTo("test-blog-an-hat-moi-ngay");

		mvc.perform(get("/api/blog/" + slug)).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("BLOG_POST_NOT_FOUND"));
		mvc.perform(get("/blog/" + slug)).andExpect(status().isNotFound());
		mvc.perform(get("/api/blog")).andExpect(content().string(not(containsString(slug))));

		// Nothing to publish with yet
		call(json(patch("/api/admin/blog/" + id + "/status"), "{\"status\":\"PUBLISHED\"}"), admin)
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("BLOG_NOT_READY"))
			.andExpect(jsonPath("$.missing[0]").value("EXCERPT"))
			.andExpect(jsonPath("$.missing[1]").value("COVER"));

		String imageId = upload(id);
		verify(storage).upload(any(), any(), eq("hat-lanh/blog"));
		// A cover needs alt text
		call(json(put("/api/admin/blog/" + id + "/cover"), "{\"imageId\":\"" + imageId + "\"}"), admin)
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("COVER_ALT_REQUIRED"));
		call(json(put("/api/admin/blog/" + id + "/cover"), "{\"imageId\":\"" + imageId + "\",\"alt\":\"Hũ hạt\"}"), admin)
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.coverImageAlt").value("Hũ hạt"));
		call(json(put("/api/admin/blog/" + id), postJson("Test blog Ăn hạt mỗi ngày", slug, "Tóm tắt ngắn.", "Nội dung.",
				"Hũ hạt", "[]")), admin).andExpect(status().isOk());

		publish(id);
		mvc.perform(get("/api/blog/" + slug)).andExpect(status().isOk())
			.andExpect(jsonPath("$.title").value("Test blog Ăn hạt mỗi ngày"))
			.andExpect(jsonPath("$.contentHtml").value("<p>Nội dung.</p>\n"))
			.andExpect(jsonPath("$.coverWidth").value(1600))
			.andExpect(jsonPath("$.readingMinutes").value(1))
			.andExpect(jsonPath("$.publishedAt").isNotEmpty());
		mvc.perform(get("/api/blog")).andExpect(jsonPath("$.items[0].slug").value(slug));

		// Unpublish → gone again; republish keeps the first date
		String firstDate = jdbc.queryForObject("SELECT published_at::text FROM blog_posts WHERE id = ?", String.class, id);
		call(json(patch("/api/admin/blog/" + id + "/status"), "{\"status\":\"DRAFT\"}"), admin).andExpect(status().isOk());
		mvc.perform(get("/api/blog/" + slug)).andExpect(status().isNotFound());
		publish(id);
		assertThat(jdbc.queryForObject("SELECT published_at::text FROM blog_posts WHERE id = ?", String.class, id))
			.isEqualTo(firstDate);

		assertThat(jdbc.queryForList("SELECT action FROM audit_logs WHERE entity_type = 'BLOG_POST' AND entity_id = ?"
				+ " ORDER BY created_at", String.class, String.valueOf(id)))
			.containsSubsequence("BLOG_POST_CREATED", "BLOG_IMAGE_ADDED", "BLOG_POST_UPDATED", "BLOG_POST_PUBLISHED",
					"BLOG_POST_UNPUBLISHED", "BLOG_POST_PUBLISHED");
	}

	@Test
	void slugsGetASuffixAndOnlyPublishedOnesRedirect() throws Exception {
		long first = createPost("Test blog Trùng tên", null, null, "a");
		long second = createPost("Test blog Trùng tên", null, null, "b");
		long third = createPost("Test blog Khác", "test-blog-trung-ten", null, "c");
		assertThat(slugOf(second)).isEqualTo("test-blog-trung-ten-2");
		assertThat(slugOf(third)).isEqualTo("test-blog-trung-ten-3");
		call(json(post("/api/admin/blog"), postJson("Test blog sai", "Sai Slug", null, "x", null, "[]")), admin)
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_SLUG"));

		// A draft that was never public: renaming leaves no redirect
		call(json(put("/api/admin/blog/" + second), postJson("Test blog Trùng tên", "test-blog-nhap-moi", null, "b", null,
				"[]")), admin).andExpect(status().isOk());
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM blog_slug_history WHERE post_id = ?", Long.class, second))
			.isZero();

		// A published post: the old address redirects (page 301, API redirectTo); the old slug stays reserved
		readyAndPublish(first);
		call(json(put("/api/admin/blog/" + first), postJson("Test blog Trùng tên", "test-blog-ten-moi", "Tóm tắt.", "a",
				"Ảnh bìa", "[]")), admin).andExpect(status().isOk());
		mvc.perform(get("/blog/test-blog-trung-ten").queryParam("utm_source", "fb"))
			.andExpect(status().isMovedPermanently())
			.andExpect(header().string("Location", "/blog/test-blog-ten-moi?utm_source=fb"));
		mvc.perform(get("/api/blog/test-blog-trung-ten")).andExpect(status().isOk())
			.andExpect(jsonPath("$.redirectTo").value("test-blog-ten-moi"));
		long fourth = createPost("Test blog Trùng tên", null, null, "d");
		assertThat(slugOf(fourth)).isEqualTo("test-blog-trung-ten-2");
	}

	@Test
	void imagesInUseAreProtected() throws Exception {
		long id = createPost("Test blog Ảnh", null, null, "");
		String cover = readyAndPublish(id);
		String inline = upload(id);
		String inlineUrl = jdbc.queryForObject("SELECT url FROM blog_post_images WHERE id = ?::uuid", String.class, inline);
		call(json(put("/api/admin/blog/" + id), postJson("Test blog Ảnh", null, "Tóm tắt.", "![Hạt](" + inlineUrl + ")",
				"Ảnh bìa", "[]")), admin).andExpect(status().isOk());

		call(delete("/api/admin/blog/" + id + "/images/" + cover), admin).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("IMAGE_IS_COVER"));
		call(delete("/api/admin/blog/" + id + "/images/" + inline), admin).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("IMAGE_IN_USE"));
		call(json(put("/api/admin/blog/" + id + "/cover"), "{\"imageId\":null}"), admin).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("COVER_REQUIRED"));

		// The same image in a draft may be deleted (the editor warns); the file goes after the commit
		call(json(patch("/api/admin/blog/" + id + "/status"), "{\"status\":\"DRAFT\"}"), admin).andExpect(status().isOk());
		String publicId = jdbc.queryForObject("SELECT public_id FROM blog_post_images WHERE id = ?::uuid", String.class, inline);
		call(delete("/api/admin/blog/" + id + "/images/" + inline), admin).andExpect(status().isOk())
			.andExpect(jsonPath("$.images", hasSize(1)));
		verify(storage).delete(publicId);
	}

	@Test
	void contentIsLimitedToOneHundredThousandCharacters() throws Exception {
		long id = createPost("Test blog Dài", null, null, "");
		String tooLong = "a".repeat(BlogDtos.MAX_CONTENT + 1);
		call(json(put("/api/admin/blog/" + id), postJson("Test blog Dài", null, null, tooLong, null, "[]")), admin)
			.andExpect(status().isBadRequest());
		call(json(post("/api/admin/blog/preview"), "{\"content\":\"" + tooLong + "\"}"), admin)
			.andExpect(status().isBadRequest());
		call(json(post("/api/admin/blog/preview"), "{\"content\":\"<b>x</b> [y](javascript:alert(1))\"}"), admin)
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.html").value("<p>&lt;b&gt;x&lt;/b&gt; y</p>\n"));
	}

	@Test
	void postPageHasMetaJsonLdTextAndInitialDataWithoutJavaScript() throws Exception {
		long onSale = product("Mắc ca blog", true);
		long hidden = product("Ẩn blog", false);
		long older = createPost("Test blog Bài cũ hơn", null, null, "x");
		readyAndPublish(older);
		long id = createPost("Test blog Hạt & \\\"bí quyết\\\" </script>", "test-blog-bi-quyet", null, "");
		readyAndPublish(id);
		call(json(put("/api/admin/blog/" + id), postJson("Test blog Hạt & \\\"bí quyết\\\" </script>", "test-blog-bi-quyet",
				"Mẹo chọn hạt </script><b>ngon</b>.", "## Chọn hạt\\n\\nĐoạn văn <script>alert(1)</script>.", "Ảnh bìa",
				"[" + hidden + "," + onSale + "]")), admin).andExpect(status().isOk());

		mvc.perform(get("/api/blog/test-blog-bi-quyet")).andExpect(status().isOk())
			.andExpect(jsonPath("$.products", hasSize(1)))
			.andExpect(jsonPath("$.products[0].id").value(onSale))
			.andExpect(jsonPath("$.products[0].price").value(189000))
			.andExpect(jsonPath("$.latest[0].slug").value("test-blog-bai-cu-hon"));

		String html = mvc.perform(get("/blog/test-blog-bi-quyet")).andExpect(status().isOk())
			.andReturn().getResponse().getContentAsString();
		assertThat(html).contains("<title>Test blog Hạt &amp; &quot;bí quyết&quot; &lt;/script&gt; | Hạt Lành</title>")
			.contains("<meta property=\"og:type\" content=\"article\" />")
			.contains("<meta name=\"description\" content=\"Mẹo chọn hạt &lt;/script&gt;&lt;b&gt;ngon&lt;/b&gt;.\" />")
			.contains("<link rel=\"canonical\" href=\"http://localhost:8080/blog/test-blog-bi-quyet\" />")
			.contains("c_fill,w_1200,h_630,q_auto,f_jpg/")
			.contains("\"@type\":\"BlogPosting\"")
			.contains("\"datePublished\":")
			.contains("\"mainEntityOfPage\":{\"@type\":\"WebPage\",\"@id\":\"http://localhost:8080/blog/test-blog-bi-quyet\"}")
			.contains("\"@type\":\"BreadcrumbList\"")
			// Text for crawlers inside #root
			.contains("<div id=\"root\"><!--app-body--><main")
			.contains("<h1>Test blog Hạt &amp; &quot;bí quyết&quot; &lt;/script&gt;</h1>")
			.contains("<h2>Chọn hạt</h2>")
			.contains("Đoạn văn &lt;script&gt;alert(1)&lt;/script&gt;.")
			.contains("không thay thế tư vấn của bác sĩ")
			.contains("<a href=\"/blog/test-blog-bai-cu-hon\">");
		// Exactly one real </script> per script element: nothing from the post can close one early
		assertThat(html).doesNotContain("<script>alert(1)");
		Matcher data = Pattern.compile("<script type=\"application/json\" id=\"initial-data\">(.*?)</script>").matcher(html);
		assertThat(data.find()).isTrue();
		String json = data.group(1);
		assertThat(json).doesNotContain("</").doesNotContain("<");
		assertThat((String) JsonPath.read(json, "$.type")).isEqualTo("blogPost");
		assertThat((String) JsonPath.read(json, "$.slug")).isEqualTo("test-blog-bi-quyet");
		assertThat((String) JsonPath.read(json, "$.data.contentHtml")).contains("<h2>Chọn hạt</h2>");
		assertThat((Integer) JsonPath.read(json, "$.data.products.length()")).isEqualTo(1);

		// The blog page lists links to posts for crawlers
		mvc.perform(get("/blog")).andExpect(status().isOk())
			.andExpect(content().string(containsString("<title>Blog | Hạt Lành</title>")))
			.andExpect(content().string(containsString("<h1>Blog</h1>")))
			.andExpect(content().string(containsString("<a href=\"/blog/test-blog-bi-quyet\">")))
			.andExpect(content().string(not(containsString("initial-data"))));
	}

	@Test
	void sitemapFollowsPublishingWithoutWaiting() throws Exception {
		long id = createPost("Test blog Sitemap", null, null, "x");
		String slug = slugOf(id);
		long draft = createPost("Test blog Sitemap nháp", null, null, "x");
		mvc.perform(get("/sitemap.xml")).andExpect(content().string(containsString("<loc>http://localhost:8080/blog</loc>")))
			.andExpect(content().string(not(containsString("/blog/" + slug + "<"))));

		readyAndPublish(id);
		mvc.perform(get("/sitemap.xml"))
			.andExpect(content().string(containsString("<loc>http://localhost:8080/blog/" + slug + "</loc><lastmod>")))
			.andExpect(content().string(not(containsString("/blog/" + slugOf(draft) + "<"))));

		List<String> files = jdbc.queryForList("SELECT public_id FROM blog_post_images WHERE post_id = ?", String.class, id);
		call(delete("/api/admin/blog/" + id), admin).andExpect(status().isNoContent());
		mvc.perform(get("/sitemap.xml")).andExpect(content().string(not(containsString("/blog/" + slug + "<"))));
		mvc.perform(get("/blog/" + slug)).andExpect(status().isNotFound());
		files.forEach(publicId -> verify(storage).delete(publicId));
	}

	// ---- helpers --------------------------------------------------------------------------------------------

	private Cookie as(String role) throws Exception {
		String email = role.toLowerCase() + "-" + UUID.randomUUID() + "@example.com";
		mvc.perform(post("/api/auth/register").header("X-Requested-With", "XMLHttpRequest")
			.contentType(MediaType.APPLICATION_JSON)
			.content(RegisterJson.of("Người Viết " + role, email, "matkhau123"))).andExpect(status().isCreated());
		jdbc.update("UPDATE users SET role = ? WHERE email = ?", role, email);
		var user = users.findByEmail(email).orElseThrow();
		return new Cookie(AuthCookies.ACCESS_COOKIE, tokens.issueAccessToken(user));
	}

	private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder request, String body) {
		return request.contentType(MediaType.APPLICATION_JSON).content(body);
	}

	private ResultActions call(MockHttpServletRequestBuilder request, Cookie cookie) throws Exception {
		return mvc.perform(request.header("X-Requested-With", "XMLHttpRequest").cookie(cookie));
	}

	/** Values are inserted as JSON string content: callers escape quotes and newlines. */
	private static String postJson(String title, String slug, String excerpt, String content, String coverAlt,
			String productIds) {
		return """
				{"title":"%s","slug":%s,"excerpt":%s,"content":"%s","coverImageAlt":%s,"productIds":%s}"""
			.formatted(title, quoted(slug), quoted(excerpt), content, quoted(coverAlt), productIds);
	}

	private static String quoted(String value) {
		return value == null ? "null" : "\"" + value + "\"";
	}

	private long createPost(String title, String slug, String excerpt, String content) throws Exception {
		String response = call(json(post("/api/admin/blog"), postJson(title, slug, excerpt, content, null, "[]")), admin)
			.andExpect(status().isCreated())
			.andReturn()
			.getResponse()
			.getContentAsString();
		return ((Number) JsonPath.read(response, "$.id")).longValue();
	}

	private String slugOf(long id) {
		return jdbc.queryForObject("SELECT slug FROM blog_posts WHERE id = ?", String.class, id);
	}

	private String upload(long id) throws Exception {
		String response = mvc.perform(multipart("/api/admin/blog/" + id + "/images")
				.file(new MockMultipartFile("file", "a.png", "image/png", PNG))
				.header("X-Requested-With", "XMLHttpRequest")
				.cookie(admin))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.width").value(1600))
			.andReturn()
			.getResponse()
			.getContentAsString();
		return JsonPath.read(response, "$.id");
	}

	/** Uploads a cover, adds an excerpt and publishes; returns the cover image id. */
	private String readyAndPublish(long id) throws Exception {
		String imageId = upload(id);
		call(json(put("/api/admin/blog/" + id + "/cover"), "{\"imageId\":\"" + imageId + "\",\"alt\":\"Ảnh bìa\"}"), admin)
			.andExpect(status().isOk());
		jdbc.update("UPDATE blog_posts SET excerpt = 'Tóm tắt.' WHERE id = ? AND excerpt IS NULL", id);
		publish(id);
		return imageId;
	}

	private void publish(long id) throws Exception {
		call(json(patch("/api/admin/blog/" + id + "/status"), "{\"status\":\"PUBLISHED\"}"), admin)
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("PUBLISHED"));
	}

	private long product(String name, boolean active) {
		long id = jdbc.queryForObject("""
				INSERT INTO products (category_id, name, slug, description, price, weight_grams, on_hand, reserved, active)
				VALUES ((SELECT id FROM categories WHERE slug = 'hat-dinh-duong'), ?, ?, 'Mô tả.', 189000, 500, 10, 0, ?)
				RETURNING id""", Long.class, name, "blog-" + UUID.randomUUID(), active);
		createdProducts.add(id);
		return id;
	}
}
