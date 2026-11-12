package com.nutshop.content.site;

import com.nutshop.IntegrationTest;
import com.nutshop.auth.AuthCookies;
import com.nutshop.auth.TokenService;
import com.nutshop.content.fragment.FragmentDelivery;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import testsupport.RegisterJson;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * CMS pages end to end: authoring, fixed routes protected, publishing (the public never sees a working copy),
 * redirects after a path change, server-rendered meta, the sitemap and the editor's preview. Every test works under
 * its own top-level page "/t-{random}"; everything is deleted afterwards.
 */
@IntegrationTest
class SitesE2ETest {

	private static final String API = "/api/author/pages";

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcTemplate jdbc;

	@Autowired
	JsonMapper json;

	@Autowired
	UserRepository users;

	@Autowired
	TokenService tokens;

	@Autowired
	RateLimiter authRateLimiter;

	@Autowired
	PageDelivery delivery;

	@Autowired
	FragmentDelivery fragmentDelivery;

	@Autowired
	SiteController site;

	private Cookie staff;
	private Cookie admin;
	private String root;
	private String rootId;

	@BeforeEach
	void setUp() throws Exception {
		authRateLimiter.reset();
		delivery.evictAll();
		fragmentDelivery.evictAll();
		site.clearSitemapCache();
		staff = as("STAFF");
		admin = as("ADMIN");
		String name = "t-" + UUID.randomUUID().toString().substring(0, 8);
		JsonNode page = create(null, name, "Trang thử", "landing", staff);
		rootId = page.get("id").asText();
		root = page.get("path").asText();
		assertThat(root).isEqualTo("/" + name);
	}

	@AfterEach
	void cleanUp() {
		var ids = jdbc.queryForList("SELECT id::text FROM site_pages WHERE path = ? OR path LIKE ?", String.class, root, root + "/%");
		ids.addAll(jdbc.queryForList("SELECT page_id::text FROM site_page_path_history WHERE old_path LIKE ?", String.class, root + "%"));
		for (String id : ids) {
			jdbc.update("DELETE FROM content_references WHERE source_type = 'PAGE' AND source_id = ?", id);
		}
		jdbc.update("DELETE FROM site_pages WHERE id = ANY (CAST(? AS uuid[]))", (Object) ids.toArray(String[]::new));
		jdbc.update("DELETE FROM cf_fragments WHERE folder_path = ?", root);
		delivery.evictAll();
		site.clearSitemapCache();
	}

	// ---- helpers --------------------------------------------------------------------------------------------

	private Cookie as(String role) throws Exception {
		String email = "site-" + role.toLowerCase() + "-" + UUID.randomUUID() + "@example.com";
		mvc.perform(post("/api/auth/register").header("X-Requested-With", "XMLHttpRequest")
			.contentType(MediaType.APPLICATION_JSON)
			.content(RegisterJson.of("Người " + role, email, "matkhau123"))).andExpect(status().isCreated());
		jdbc.update("UPDATE users SET role = ? WHERE email = ?", role, email);
		return new Cookie(AuthCookies.ACCESS_COOKIE, tokens.issueAccessToken(users.findByEmail(email).orElseThrow()));
	}

	private ResultActions send(MockHttpServletRequestBuilder request, Cookie cookie, String body) throws Exception {
		request.header("X-Requested-With", "XMLHttpRequest");
		if (body != null) {
			request.contentType(MediaType.APPLICATION_JSON).content(body);
		}
		return mvc.perform(request.cookie(cookie));
	}

	private JsonNode body(ResultActions result) throws Exception {
		return json.readTree(result.andReturn().getResponse().getContentAsString());
	}

	private JsonNode create(String parentId, String name, String title, String template, Cookie cookie) throws Exception {
		String parent = parentId == null ? "null" : "\"" + parentId + "\"";
		return body(send(post(API), cookie, """
				{"parentId": %s, "name": "%s", "title": "%s", "template": "%s"}""".formatted(parent, name, title, template))
			.andExpect(status().isCreated()));
	}

	private ResultActions save(String id, String title, String blocks, String properties) throws Exception {
		return send(put(API + "/" + id), staff, """
				{"title": "%s", "content": {"regions": {"main": %s}}, "properties": %s}""".formatted(title, blocks, properties));
	}

	private static final String TEXT = """
			[{"id": "t1", "type": "rich-text", "props": {"markdown": "%s"}}]""";

	private ResultActions publish(String id, boolean along) throws Exception {
		return send(post(API + "/" + id + "/publish"), admin, "{\"publishReferences\": " + along + "}");
	}

	private ResultActions publicGet(String path) throws Exception {
		return mvc.perform(get("/api/content/pages").param("path", path));
	}

	// ---- paths ----------------------------------------------------------------------------------------------

	@Test
	void topLevelPagesCannotTakeAFixedRoute() throws Exception {
		for (String name : new String[] { "San pham", "blog", "gio-hang", "thanh-toan", "admin", "author", "tai-khoan", "dang-nhap" }) {
			send(post(API), staff, """
					{"name": "%s", "title": "X", "template": "landing"}""".formatted(name)).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("RESERVED_PATH"))
				.andExpect(jsonPath("$.errors.name").exists());
		}
		// Below a CMS page the same name is fine
		assertThat(create(rootId, "san-pham", "Sản phẩm Tết", "content", staff).get("path").asText()).isEqualTo(root + "/san-pham");
		send(post(API), staff, """
				{"parentId": "%s", "name": "san-pham", "title": "Trùng", "template": "content"}""".formatted(rootId))
			.andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PAGE_EXISTS"));
		send(post(API), staff, "{\"title\": \"X\", \"template\": \"popup\"}").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors.template").exists());
	}

	@Test
	void renamingRedirectsTheOldPathsOfThePageAndItsChildren() throws Exception {
		String childId = create(rootId, "con", "Trang con", "content", staff).get("id").asText();
		save(childId, "Trang con", TEXT.formatted("Nội dung con"), "{}").andExpect(status().isOk());
		publish(childId, false).andExpect(status().isOk());
		String newRoot = root + "-moi";

		send(post(API + "/" + rootId + "/rename"), staff, "{\"name\": \"" + newRoot.substring(1) + "\"}").andExpect(status().isOk())
			.andExpect(jsonPath("$.path").value(newRoot))
			.andExpect(jsonPath("$.oldPaths[0]").value(root));
		root = newRoot; // for cleanUp

		mvc.perform(get(root.replace("-moi", "") + "/con?utm=zalo")).andExpect(status().isMovedPermanently())
			.andExpect(header().string("Location", newRoot + "/con?utm=zalo"));
		mvc.perform(get(newRoot + "/con")).andExpect(status().isOk());
		publicGet(newRoot + "/con").andExpect(jsonPath("$.path").value(newRoot + "/con"));
		// The old address of an unpublished page leads nowhere
		mvc.perform(get(newRoot.replace("-moi", ""))).andExpect(status().isNotFound());
		send(post(API + "/" + rootId + "/rename"), staff, "{\"name\": \"blog\"}").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("RESERVED_PATH"));
	}

	@Test
	void movingUnderAnotherParentChangesThePathAndCannotGoIntoItself() throws Exception {
		String a = create(rootId, "a", "A", "content", staff).get("id").asText();
		String b = create(rootId, "b", "B", "content", staff).get("id").asText();
		send(post(API + "/" + a + "/move"), staff, "{\"parentId\": \"" + b + "\"}").andExpect(status().isOk())
			.andExpect(jsonPath("$.path").value(root + "/b/a"))
			.andExpect(jsonPath("$.oldPaths[0]").value(root + "/a"));
		send(post(API + "/" + b + "/move"), staff, "{\"parentId\": \"" + a + "\"}").andExpect(status().isBadRequest());
		// Reorder among siblings
		String c = create(rootId, "c", "C", "content", staff).get("id").asText();
		send(post(API + "/" + c + "/move"), staff, "{\"parentId\": \"" + rootId + "\", \"position\": 0}").andExpect(status().isOk());
		JsonNode tree = body(send(get(API + "/tree"), staff, null));
		JsonNode mine = null;
		for (JsonNode node : tree) {
			if (node.get("id").asText().equals(rootId)) {
				mine = node;
			}
		}
		assertThat(mine).isNotNull();
		assertThat(mine.get("children").get(0).get("name").asText()).isEqualTo("c");
		assertThat(mine.get("children").get(1).get("name").asText()).isEqualTo("b");
	}

	// ---- content and publishing -----------------------------------------------------------------------------

	@Test
	void savingValidatesBlocksAgainstTheTemplate() throws Exception {
		String page = create(rootId, "noi-dung", "Nội dung", "content", staff).get("id").asText();
		save(page, "Nội dung", """
				[{"id": "m1", "type": "marquee", "props": {"items": ["a"]}}, {"id": "s1", "type": "spacer", "props": {"size": "xl"}}]""",
				"{}").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors['blocks.m1.type']").exists())
			.andExpect(jsonPath("$.errors['blocks.s1.type']").exists());
		save(rootId, "Trang thử", """
				[{"id": "s1", "type": "spacer", "props": {"size": "xl"}}]""", "{\"seoTitle\": 5}").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors['blocks.s1.props.size']").exists())
			.andExpect(jsonPath("$.errors['properties.seoTitle']").value("Cần nhập chữ"));
		publish(rootId, false).andExpect(status().isOk());
		save(rootId, "Trang thử", "[{\"id\": \"r1\", \"type\": \"rich-text\", \"props\": {}}]", "{}").andExpect(status().isOk());
		publish(rootId, false).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors['blocks.r1.props.markdown']").value("Bắt buộc"));
	}

	@Test
	void thePublicNeverSeesAWorkingCopy() throws Exception {
		save(rootId, "Khuyến mãi", TEXT.formatted("Giảm 10%"), "{\"seoDescription\": \"Ưu đãi tháng 11\"}").andExpect(status().isOk());
		publicGet(root).andExpect(status().isNotFound());
		mvc.perform(get(root)).andExpect(status().isNotFound());
		send(post(API + "/" + rootId + "/publish"), staff, "{}").andExpect(status().isForbidden());

		publish(rootId, false).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PUBLISHED"));
		publicGet(root).andExpect(status().isOk())
			.andExpect(jsonPath("$.title").value("Khuyến mãi"))
			.andExpect(jsonPath("$.regions.main[0].type").value("rich-text"))
			.andExpect(jsonPath("$.regions.main[0].props.markdown.html").value(containsString("Giảm 10%")))
			.andExpect(header().string("Cache-Control", containsString("max-age=60")))
			.andExpect(header().exists("ETag"));

		save(rootId, "Khuyến mãi", TEXT.formatted("Giảm 50%"), "{}").andExpect(jsonPath("$.status").value("MODIFIED"));
		delivery.evictAll();
		publicGet(root).andExpect(jsonPath("$.regions.main[0].props.markdown.markdown").value("Giảm 10%"));
		mvc.perform(get(root)).andExpect(status().isOk())
			.andExpect(content().string(containsString("Giảm 10%")))
			.andExpect(content().string(not(containsString("Giảm 50%"))));

		send(post(API + "/" + rootId + "/unpublish"), admin, null).andExpect(jsonPath("$.status").value("DRAFT"));
		publicGet(root).andExpect(status().isNotFound());
	}

	@Test
	void serverRenderedPagesCarryTheirOwnMetaAndText() throws Exception {
		long rootFolder = jdbc.queryForObject("SELECT id FROM dam_folders WHERE path = '/hat-lanh'", Long.class);
		UUID og = jdbc.queryForObject("""
				INSERT INTO dam_assets (folder_id, file_name, kind, mime, size_bytes, width, height, storage_public_id, url, title,
				                        alt, checksum_sha256)
				VALUES (?, 'og.jpg', 'IMAGE', 'image/jpeg', 1, 1200, 630, ?, ?, 'OG', 'Ảnh', ?) RETURNING id""", UUID.class,
				rootFolder, "hat-lanh/dam/og-" + root, "https://res.cloudinary.com/demo/image/upload/v1/hat-lanh/dam/og.jpg",
				String.format("%064d", Math.abs((long) root.hashCode())));
		try {
			save(rootId, "Giới thiệu", """
					[{"id": "h1", "type": "hero", "props": {"headline": "Hạt sạch từ vườn"}},
					 {"id": "t1", "type": "rich-text", "props": {"markdown": "Chúng tôi **chọn lọc**"}}]""",
					"{\"seoTitle\": \"Về Hạt Lành\", \"seoDescription\": \"Câu chuyện\", \"ogImage\": \"" + og + "\"}")
				.andExpect(status().isOk());
			publish(rootId, false).andExpect(status().isOk());
			String html = mvc.perform(get(root)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
			assertThat(html).contains("<title>Về Hạt Lành | Hạt Lành</title>")
				.contains("<meta name=\"description\" content=\"Câu chuyện\" />")
				.contains("<link rel=\"canonical\" href=\"http://localhost:8080" + root + "\" />")
				.contains("w_1200,h_630,c_fill,f_jpg,q_auto")
				.contains("<h2>Hạt sạch từ vườn</h2>")
				.contains("<strong>chọn lọc</strong>")
				.contains("\"type\":\"cmsPage\"")
				.doesNotContain("name=\"robots\"");
		}
		finally {
			jdbc.update("DELETE FROM content_references WHERE target_id = ?", og.toString());
			jdbc.update("UPDATE site_pages SET published_version_id = NULL, status = 'DRAFT' WHERE path LIKE ?", root + "%");
			jdbc.update("DELETE FROM site_page_versions WHERE page_id = ?::uuid", rootId);
			jdbc.update("DELETE FROM dam_assets WHERE id = ?", og);
		}
	}

	@Test
	void theSitemapListsPublishedPagesButNotNoindexOnes() throws Exception {
		String hidden = create(rootId, "an", "Ẩn", "content", staff).get("id").asText();
		save(rootId, "Trang thử", TEXT.formatted("a"), "{}").andExpect(status().isOk());
		save(hidden, "Ẩn", TEXT.formatted("b"), "{\"noindex\": true}").andExpect(status().isOk());
		publish(rootId, false).andExpect(status().isOk());
		publish(hidden, false).andExpect(status().isOk());
		String sitemap = mvc.perform(get("/sitemap.xml")).andReturn().getResponse().getContentAsString();
		assertThat(sitemap).contains("<loc>http://localhost:8080" + root + "</loc>").doesNotContain(root + "/an<");
		assertThat(mvc.perform(get(root + "/an")).andReturn().getResponse().getContentAsString())
			.contains("<meta name=\"robots\" content=\"noindex");
	}

	@Test
	void unpublishedFragmentsArePublishedAlongOnlyWhenAsked() throws Exception {
		long faq = jdbc.queryForObject("SELECT id FROM cf_models WHERE slug = 'faq'", Long.class);
		String fragment = body(send(post("/api/author/cf/fragments"), staff, """
				{"modelId": %d, "folderPath": "%s", "title": "Hỏi", "data": {"question": "Có giao Tết?", "answer": "Có"}}"""
			.formatted(faq, root)).andExpect(status().isCreated())).get("id").asText();
		save(rootId, "FAQ", """
				[{"id": "q1", "type": "faq", "props": {"title": "Hỏi đáp", "fragmentIds": ["%s"]}}]""".formatted(fragment), "{}")
			.andExpect(status().isOk());

		publish(rootId, false).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("UNPUBLISHED_REFERENCES"))
			.andExpect(jsonPath("$.references[0].id").value(fragment));
		publish(rootId, true).andExpect(status().isOk());
		publicGet(root).andExpect(jsonPath("$.regions.main[0].props.items[0].data.question").value("Có giao Tết?"));
		// Used by the page: the fragment cannot be deleted
		send(delete("/api/author/cf/fragments/" + fragment), admin, null).andExpect(status().isConflict())
			.andExpect(jsonPath("$.usages[0].sourceType").value("PAGE"));
	}

	@Test
	void rollbackRestoresAnEarlierVersion() throws Exception {
		save(rootId, "Bản 2", TEXT.formatted("hai"), "{}").andExpect(status().isOk());
		save(rootId, "Bản 3", TEXT.formatted("ba"), "{}").andExpect(status().isOk());
		JsonNode versions = body(send(get(API + "/" + rootId + "/versions"), staff, null));
		assertThat(versions).hasSize(3);
		String second = versions.get(1).get("id").asText();
		send(post(API + "/" + rootId + "/rollback/" + second), staff, null).andExpect(status().isOk())
			.andExpect(jsonPath("$.title").value("Bản 2"))
			.andExpect(jsonPath("$.content.regions.main[0].props.markdown").value("hai"))
			.andExpect(jsonPath("$.versions[0].comment").value("Khôi phục phiên bản 2"));
	}

	@Test
	void deletingAPageWithChildrenNeedsConfirmation() throws Exception {
		create(rootId, "con", "Con", "content", staff);
		send(delete(API + "/" + rootId), staff, null).andExpect(status().isForbidden());
		send(delete(API + "/" + rootId), admin, null).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("PAGE_HAS_CHILDREN"))
			.andExpect(jsonPath("$.childCount").value(1));
		send(delete(API + "/" + rootId).param("includeChildren", "true"), admin, null).andExpect(status().isNoContent());
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM site_pages WHERE path LIKE ?", Integer.class, root + "%")).isZero();
	}

	// ---- preview --------------------------------------------------------------------------------------------

	@Test
	void thePreviewShowsTheWorkingCopyAndMayBeFramedByTheEditorOnly() throws Exception {
		save(rootId, "Nháp", TEXT.formatted("bản nháp"), "{}").andExpect(status().isOk());
		String url = body(send(post(API + "/" + rootId + "/preview-link"), staff, null)).get("url").asText();
		assertThat(url).startsWith("/author/preview?token=");
		String token = url.substring(url.indexOf('=') + 1);

		mvc.perform(get("/api/content/preview/pages").param("token", token)).andExpect(status().isOk())
			.andExpect(jsonPath("$.preview").value(true))
			.andExpect(jsonPath("$.regions.main[0].props.markdown.markdown").value("bản nháp"))
			.andExpect(header().string("Cache-Control", containsString("no-store")));
		mvc.perform(get("/api/content/preview/pages").param("token", "sai")).andExpect(status().isNotFound());

		mvc.perform(get("/author/preview").param("token", token)).andExpect(status().isOk())
			.andExpect(content().string(containsString("noindex")))
			.andExpect(header().string("Content-Security-Policy", containsString("frame-ancestors 'self'")))
			.andExpect(header().string("X-Frame-Options", "SAMEORIGIN"))
			.andExpect(header().string("Referrer-Policy", "no-referrer"));
		mvc.perform(get("/")).andExpect(header().string("Content-Security-Policy", containsString("frame-ancestors 'none'")))
			.andExpect(header().string("X-Frame-Options", "DENY"));
	}
}
