package com.nutshop.content.fragment;

import com.nutshop.IntegrationTest;
import com.nutshop.auth.AuthCookies;
import com.nutshop.auth.TokenService;
import com.nutshop.security.RateLimiter;
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

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Content Fragments end to end: models, the working copy and versions, publishing, the public delivery API (which
 * must never show a working copy), previews and the rules that protect referenced content. Each test writes into
 * its own folder and models with a random suffix; everything is deleted afterwards.
 */
@IntegrationTest
class CfE2ETest {

	private static final String API = "/api/author/cf";

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
	FragmentDelivery delivery;

	private Cookie staff;
	private Cookie admin;
	private String suffix;
	private String folder;
	private long faqModel;
	private final List<Long> products = new ArrayList<>();
	private final List<UUID> assets = new ArrayList<>();

	@BeforeEach
	void setUp() throws Exception {
		authRateLimiter.reset();
		delivery.evictAll();
		staff = as("STAFF");
		admin = as("ADMIN");
		suffix = UUID.randomUUID().toString().substring(0, 8);
		folder = "/test-" + suffix;
		faqModel = jdbc.queryForObject("SELECT id FROM cf_models WHERE slug = 'faq'", Long.class);
	}

	@AfterEach
	void cleanUp() {
		List<String> ids = jdbc.queryForList("SELECT id::text FROM cf_fragments WHERE folder_path LIKE ?", String.class, folder + "%");
		for (String id : ids) {
			jdbc.update("DELETE FROM content_references WHERE source_id = ? OR target_id = ?", id, id);
		}
		jdbc.update("DELETE FROM cf_fragments WHERE folder_path LIKE ?", folder + "%");
		jdbc.update("DELETE FROM cf_models WHERE slug LIKE ?", "%-" + suffix);
		for (UUID asset : assets) {
			jdbc.update("DELETE FROM content_references WHERE target_id = ?", asset.toString());
			jdbc.update("DELETE FROM dam_assets WHERE id = ?", asset);
		}
		for (Long product : products) {
			jdbc.update("DELETE FROM content_references WHERE target_type = 'PRODUCT' AND target_id = ?", String.valueOf(product));
			jdbc.update("DELETE FROM products WHERE id = ?", product);
		}
		delivery.evictAll();
	}

	// ---- helpers --------------------------------------------------------------------------------------------

	private Cookie as(String role) throws Exception {
		String email = "cf-" + role.toLowerCase() + "-" + UUID.randomUUID() + "@example.com";
		mvc.perform(post("/api/auth/register").header("X-Requested-With", "XMLHttpRequest")
			.contentType(MediaType.APPLICATION_JSON)
			.content(RegisterJson.of("Người " + role, email, "matkhau123"))).andExpect(status().isCreated());
		jdbc.update("UPDATE users SET role = ? WHERE email = ?", role, email);
		return new Cookie(AuthCookies.ACCESS_COOKIE, tokens.issueAccessToken(users.findByEmail(email).orElseThrow()));
	}

	private ResultActions call(MockHttpServletRequestBuilder request, Cookie cookie) throws Exception {
		request.header("X-Requested-With", "XMLHttpRequest");
		return mvc.perform(cookie == null ? request : request.cookie(cookie));
	}

	private ResultActions send(MockHttpServletRequestBuilder request, Cookie cookie, String body) throws Exception {
		return call(request.contentType(MediaType.APPLICATION_JSON).content(body), cookie);
	}

	private JsonNode body(ResultActions result) throws Exception {
		return json.readTree(result.andReturn().getResponse().getContentAsString());
	}

	private String faq(String title, String question, String answer, Cookie cookie) throws Exception {
		return body(send(post(API + "/fragments"), cookie, """
				{"modelId": %d, "folderPath": "%s", "title": "%s", "data": {"question": "%s", "answer": "%s", "order": 1}}"""
			.formatted(faqModel, folder, title, question, answer)).andExpect(status().isCreated())).get("id").asText();
	}

	private ResultActions save(String id, String title, String data, Cookie cookie) throws Exception {
		return send(put(API + "/fragments/" + id), cookie, "{\"title\":\"%s\",\"data\":%s}".formatted(title, data));
	}

	private ResultActions publish(String id, boolean along) throws Exception {
		return send(post(API + "/fragments/" + id + "/publish"), admin, "{\"publishReferences\":" + along + "}");
	}

	private ResultActions publicGet(String id) throws Exception {
		return mvc.perform(get("/api/content/fragments/" + id));
	}

	/** A model with a multiple fragment field limited to FAQs (for references). */
	private long groupModel() throws Exception {
		return body(send(post(API + "/models"), admin, """
				{"name": "Nhóm FAQ", "slug": "nhom-faq-%s", "status": "ENABLED", "fields": [
				  {"name": "heading", "label": "Tiêu đề", "type": "text", "required": true},
				  {"name": "items", "label": "Câu hỏi", "type": "fragment", "multiple": true, "rules": {"allowedModels": ["faq"]}}
				]}""".formatted(suffix)).andExpect(status().isCreated())).get("id").asLong();
	}

	private String group(long model, String heading, String... faqs) throws Exception {
		String items = String.join(",", java.util.Arrays.stream(faqs).map(f -> "\"" + f + "\"").toList());
		return body(send(post(API + "/fragments"), staff, """
				{"modelId": %d, "folderPath": "%s", "title": "%s", "data": {"heading": "%s", "items": [%s]}}"""
			.formatted(model, folder, heading, heading, items)).andExpect(status().isCreated())).get("id").asText();
	}

	// ---- models ---------------------------------------------------------------------------------------------

	@Test
	void theTwoSeededModelsAreReady() throws Exception {
		JsonNode list = body(call(get(API + "/models"), staff).andExpect(status().isOk()));
		List<String> slugs = new ArrayList<>();
		list.forEach(m -> slugs.add(m.get("slug").asText()));
		assertThat(slugs).contains("faq", "promo-banner");
		long banner = jdbc.queryForObject("SELECT id FROM cf_models WHERE slug = 'promo-banner'", Long.class);
		call(get(API + "/models/" + banner), staff).andExpect(jsonPath("$.status").value("ENABLED"))
			.andExpect(jsonPath("$.fields[2].name").value("image"))
			.andExpect(jsonPath("$.fields[2].rules.allowedKinds[0]").value("IMAGE"))
			.andExpect(jsonPath("$.fields[5].type").value("datetime"));
	}

	@Test
	void onlyAdminsWriteModelsAndEverySaveBumpsTheVersion() throws Exception {
		String create = """
				{"name": "Cảm nhận", "slug": "cam-nhan-%s", "fields": [{"name": "quote", "label": "Lời khen", "type": "textarea"}]}"""
			.formatted(suffix);
		send(post(API + "/models"), staff, create).andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("CONTENT_MODEL_FORBIDDEN"));
		JsonNode model = body(send(post(API + "/models"), admin, create).andExpect(status().isCreated()));
		assertThat(model.get("version").asInt()).isEqualTo(1);
		assertThat(model.get("status").asText()).isEqualTo("DRAFT");

		send(put(API + "/models/" + model.get("id").asLong()), admin, """
				{"name": "Cảm nhận khách", "status": "ENABLED", "fields": [
				  {"name": "quote", "label": "Lời khen", "type": "textarea"},
				  {"name": "author", "label": "Người viết", "type": "text", "required": true}]}""")
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.version").value(2))
			.andExpect(jsonPath("$.fields[1].name").value("author"))
			.andExpect(jsonPath("$.slug").value("cam-nhan-" + suffix));

		send(post(API + "/models"), admin, """
				{"name": "Sai", "slug": "sai-%s", "fields": [{"name": "Bad Name", "label": "", "type": "color"}]}""".formatted(suffix))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors['fields[0].name']").exists())
			.andExpect(jsonPath("$.errors['fields[0].label']").value("Nhập nhãn"))
			.andExpect(jsonPath("$.errors['fields[0].type']").exists());
	}

	@Test
	void removingAFieldThatHoldsDataNeedsAnExplicitDropByAnAdmin() throws Exception {
		long model = body(send(post(API + "/models"), admin, """
				{"name": "Thử", "slug": "thu-%s", "status": "ENABLED", "fields": [
				  {"name": "headline", "label": "Tiêu đề", "type": "text"},
				  {"name": "note", "label": "Ghi chú", "type": "text"}]}""".formatted(suffix))).get("id").asLong();
		String withNote = body(send(post(API + "/fragments"), staff, """
				{"modelId": %d, "folderPath": "%s", "title": "Có ghi chú", "data": {"headline": "A", "note": "giữ"}}"""
			.formatted(model, folder))).get("id").asText();
		send(post(API + "/fragments"), staff, """
				{"modelId": %d, "folderPath": "%s", "title": "Không ghi chú", "data": {"headline": "B"}}""".formatted(model, folder))
			.andExpect(status().isCreated());
		String change = """
				{"name": "Thử", "fields": [{"name": "headline", "label": "Tiêu đề", "type": "text"}]%s}""";

		send(put(API + "/models/" + model), admin, change.formatted("")).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("MODEL_CHANGE_CONFLICT"))
			.andExpect(jsonPath("$.affectedFragments").value(1))
			.andExpect(jsonPath("$.fields[0]").value("note"));
		// Changing the type is the same as removing
		send(put(API + "/models/" + model), admin, """
				{"name": "Thử", "fields": [{"name": "headline", "label": "Tiêu đề", "type": "text"},
				  {"name": "note", "label": "Ghi chú", "type": "number"}]}""").andExpect(status().isConflict());
		assertThat(jdbc.queryForObject("SELECT version FROM cf_models WHERE id = ?", Integer.class, model)).isEqualTo(1);

		send(put(API + "/models/" + model), admin, change.formatted(", \"dropFieldData\": true")).andExpect(status().isOk())
			.andExpect(jsonPath("$.version").value(2));
		assertThat(jdbc.queryForObject("SELECT data::text FROM cf_fragments WHERE id = ?::uuid", String.class, withNote))
			.isEqualTo("{\"headline\": \"A\"}");
		assertThat(jdbc.queryForObject("""
				SELECT reason FROM audit_logs WHERE entity_type = 'CF_MODEL' AND entity_id = ? AND action = 'CONTENT_UPDATED'
				ORDER BY created_at DESC LIMIT 1""", String.class, String.valueOf(model))).contains("note").contains("1 fragment");
	}

	@Test
	void aModelInUseCannotBeDeleted() throws Exception {
		long model = groupModel();
		group(model, "Nhóm");
		call(delete(API + "/models/" + model), admin).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("MODEL_IN_USE"));
	}

	// ---- working copy, versions, rollback -------------------------------------------------------------------

	@Test
	void everyChangeIsAVersionAndRollbackBringsAnOldOneBack() throws Exception {
		String id = faq("Giao hàng", "Bao lâu thì nhận hàng?", "2-3 ngày", staff);
		save(id, "Giao hàng", "{\"question\":\"Bao lâu thì nhận hàng?\",\"answer\":\"1-2 ngày\",\"order\":1}", staff)
			.andExpect(status().isOk());
		// Nothing changed: no new version
		save(id, "Giao hàng", "{\"question\":\"Bao lâu thì nhận hàng?\",\"answer\":\"1-2 ngày\",\"order\":1}", staff)
			.andExpect(status().isOk());

		JsonNode versions = body(call(get(API + "/fragments/" + id + "/versions"), staff).andExpect(status().isOk()));
		assertThat(versions).hasSize(2);
		assertThat(versions.get(0).get("versionNo").asInt()).isEqualTo(2);
		String first = versions.get(1).get("id").asText();

		JsonNode back = body(call(post(API + "/fragments/" + id + "/rollback/" + first), staff).andExpect(status().isOk()));
		assertThat(back.get("data").get("answer").asText()).isEqualTo("2-3 ngày");
		assertThat(back.get("versions")).hasSize(3);
		assertThat(back.get("versions").get(0).get("comment").asText()).isEqualTo("Khôi phục phiên bản 1");
		call(post(API + "/fragments/" + id + "/rollback/" + UUID.randomUUID()), staff).andExpect(status().isNotFound());
	}

	@Test
	void draftsMayBeIncompleteButFieldErrorsArePerField() throws Exception {
		JsonNode created = body(send(post(API + "/fragments"), staff, """
				{"modelId": %d, "folderPath": "%s", "title": "Chưa xong", "data": {"question": "Hỏi?"}}"""
			.formatted(faqModel, folder)).andExpect(status().isCreated()));
		assertThat(created.get("status").asText()).isEqualTo("DRAFT");
		save(created.get("id").asText(), "Chưa xong", "{\"question\":123,\"order\":-5}", staff).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors['data.question']").value("Cần nhập chữ"))
			.andExpect(jsonPath("$.errors['data.order']").value("Nhỏ nhất là 0"));
		publish(created.get("id").asText(), false).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors['data.answer']").value("Bắt buộc"));
	}

	// ---- publishing and the public API ----------------------------------------------------------------------

	@Test
	void thePublicApiNeverShowsAWorkingCopy() throws Exception {
		String id = faq("Đổi trả", "Đổi trả thế nào?", "Trong 7 ngày", staff);
		publicGet(id).andExpect(status().isNotFound());

		send(post(API + "/fragments/" + id + "/publish"), staff, "{}").andExpect(status().isForbidden());
		publish(id, false).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PUBLISHED"));
		publicGet(id).andExpect(status().isOk())
			.andExpect(jsonPath("$.model").value("faq"))
			.andExpect(jsonPath("$.data.question").value("Đổi trả thế nào?"))
			.andExpect(jsonPath("$.data.answer.markdown").value("Trong 7 ngày"))
			.andExpect(jsonPath("$.data.answer.html").value(containsString("<p>Trong 7 ngày</p>")))
			.andExpect(jsonPath("$.data.order").value(1))
			.andExpect(header().string("Cache-Control", containsString("max-age=60")))
			.andExpect(header().exists("ETag"));

		// Edited after publishing: MODIFIED, the public still sees the published version
		save(id, "Đổi trả", "{\"question\":\"Đổi trả thế nào?\",\"answer\":\"Trong 30 ngày\",\"order\":1}", staff)
			.andExpect(jsonPath("$.status").value("MODIFIED"));
		publicGet(id).andExpect(jsonPath("$.data.answer.markdown").value("Trong 7 ngày"));
		delivery.evictAll();
		publicGet(id).andExpect(jsonPath("$.data.answer.markdown").value("Trong 7 ngày"));
		JsonNode list = body(mvc.perform(get("/api/content/fragments?model=faq&folder=" + folder)));
		assertThat(list.get("totalItems").asLong()).isEqualTo(1);
		assertThat(list.get("items").get(0).get("data").get("answer").get("markdown").asText()).isEqualTo("Trong 7 ngày");

		// Publishing again shows the edit; unpublishing hides it
		publish(id, false).andExpect(jsonPath("$.status").value("PUBLISHED"));
		publicGet(id).andExpect(jsonPath("$.data.answer.markdown").value("Trong 30 ngày"));
		call(post(API + "/fragments/" + id + "/unpublish"), admin).andExpect(jsonPath("$.status").value("DRAFT"));
		publicGet(id).andExpect(status().isNotFound());
		publicGet("khong-phai-uuid").andExpect(status().isNotFound());
	}

	@Test
	void anUnchangedAnswerIsA304() throws Exception {
		String id = faq("ETag", "Hỏi?", "Đáp", staff);
		publish(id, false).andExpect(status().isOk());
		String etag = publicGet(id).andReturn().getResponse().getHeader("ETag");
		mvc.perform(get("/api/content/fragments/" + id).header("If-None-Match", etag)).andExpect(status().isNotModified());
	}

	@Test
	void outsideItsWindowAPublishedFragmentIsNotDelivered() throws Exception {
		String id = faq("Hẹn giờ", "Hỏi?", "Đáp", staff);
		publish(id, false).andExpect(status().isOk());
		send(put(API + "/fragments/" + id), staff, """
				{"title": "Hẹn giờ", "data": {"question": "Hỏi?", "answer": "Đáp", "order": 1}, "publishAt": "2999-01-01T00:00:00Z"}""")
			.andExpect(status().isOk());
		publicGet(id).andExpect(status().isNotFound());
	}

	@Test
	void unpublishedReferencesArePublishedAlongOnlyWhenAsked() throws Exception {
		String faq1 = faq("Một", "Câu 1?", "Đáp 1", staff);
		String faq2 = faq("Hai", "Câu 2?", "Đáp 2", staff);
		publish(faq1, false).andExpect(status().isOk());
		String groupId = group(groupModel(), "Câu hỏi về giao hàng", faq1, faq2);

		publish(groupId, false).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("UNPUBLISHED_REFERENCES"))
			.andExpect(jsonPath("$.references.length()").value(1))
			.andExpect(jsonPath("$.references[0].id").value(faq2));
		publicGet(groupId).andExpect(status().isNotFound());

		publish(groupId, true).andExpect(status().isOk());
		publicGet(faq2).andExpect(status().isOk());
		publicGet(groupId).andExpect(jsonPath("$.data.heading").value("Câu hỏi về giao hàng"))
			.andExpect(jsonPath("$.data.items.length()").value(2))
			.andExpect(jsonPath("$.data.items[1].data.question").value("Câu 2?"))
			.andExpect(jsonPath("$.data.items[1].data.answer.markdown").value("Đáp 2"));
	}

	@Test
	void referencesNestAtMostTwoLevels() throws Exception {
		long model = groupModel();
		// Level 3 is a FAQ, levels 1 and 2 are groups: only groups may hold groups, so allow every model here
		jdbc.update("UPDATE cf_models SET fields = jsonb_set(fields, '{1,rules,allowedModels}', '[]') WHERE id = ?", model);
		String leaf = faq("Lá", "Câu?", "Đáp", staff);
		String level2 = group(model, "Cấp 2", leaf);
		String level1 = group(model, "Cấp 1", level2);
		String top = group(model, "Trên cùng", level1);
		publish(top, true).andExpect(status().isOk());

		publicGet(top).andExpect(jsonPath("$.data.items[0].title").value("Cấp 1"))
			.andExpect(jsonPath("$.data.items[0].data.items[0].title").value("Cấp 2"))
			.andExpect(jsonPath("$.data.items[0].data.items[0].data.items[0].id").value(leaf))
			.andExpect(jsonPath("$.data.items[0].data.items[0].data.items[0].model").value("faq"))
			.andExpect(jsonPath("$.data.items[0].data.items[0].data.items[0].data").doesNotExist());
	}

	@Test
	void assetsAndProductsAreResolvedForThePublic() throws Exception {
		long root = jdbc.queryForObject("SELECT id FROM dam_folders WHERE path = '/hat-lanh'", Long.class);
		UUID asset = jdbc.queryForObject("""
				INSERT INTO dam_assets (folder_id, file_name, kind, mime, size_bytes, width, height, storage_public_id, url, title,
				                        alt, checksum_sha256)
				VALUES (?, 'banner.jpg', 'IMAGE', 'image/jpeg', 1000, 1600, 900, ?, ?, 'Banner', 'Giỏ quà Tết', ?) RETURNING id""",
				UUID.class, root, "hat-lanh/dam/cf-" + suffix,
				"https://res.cloudinary.com/demo/image/upload/v1/hat-lanh/dam/cf-" + suffix + ".jpg", "c".repeat(56) + suffix);
		assets.add(asset);
		long product = jdbc.queryForObject("""
				INSERT INTO products (category_id, name, slug, description, price, weight_grams, on_hand, reserved, active)
				VALUES ((SELECT id FROM categories WHERE slug = 'hat-dinh-duong'), 'Mắc ca CF', ?, 'Mô tả', 189000, 500, 10, 0, true)
				RETURNING id""", Long.class, "mac-ca-cf-" + suffix);
		products.add(product);
		long model = body(send(post(API + "/models"), admin, """
				{"name": "Banner sản phẩm", "slug": "banner-sp-%s", "status": "ENABLED", "fields": [
				  {"name": "image", "label": "Ảnh", "type": "asset", "required": true, "rules": {"allowedKinds": ["IMAGE"]}},
				  {"name": "product", "label": "Sản phẩm", "type": "product"},
				  {"name": "note", "label": "Ghi chú", "type": "text"}]}""".formatted(suffix))).get("id").asLong();
		String id = body(send(post(API + "/fragments"), staff, """
				{"modelId": %d, "folderPath": "%s", "title": "Banner mắc ca", "data": {"image": "%s", "product": %d}}"""
			.formatted(model, folder, asset, product)).andExpect(status().isCreated())).get("id").asText();
		publish(id, false).andExpect(status().isOk());

		publicGet(id).andExpect(jsonPath("$.data.image.id").value(asset.toString()))
			.andExpect(jsonPath("$.data.image.alt").value("Giỏ quà Tết"))
			.andExpect(jsonPath("$.data.image.width").value(1600))
			.andExpect(jsonPath("$.data.image.renditions.thumb").value(containsString("/upload/w_240,h_240")))
			.andExpect(jsonPath("$.data.product.id").value(product))
			.andExpect(jsonPath("$.data.product.name").value("Mắc ca CF"))
			.andExpect(jsonPath("$.data.product.price").value(189000))
			.andExpect(jsonPath("$.data.note").doesNotExist() /* present but null */);

		// The asset is now used: the DAM refuses to delete it
		call(delete("/api/author/assets/" + asset), admin).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("ASSET_IN_USE"))
			.andExpect(jsonPath("$.usages[0].sourceType").value("FRAGMENT"));
		// The editor gets names and thumbnails of what it points to
		call(get(API + "/fragments/" + id), staff).andExpect(jsonPath("$.refs['" + asset + "'].title").value("Banner"))
			.andExpect(jsonPath("$.refs['" + product + "'].title").value("Mắc ca CF"));
	}

	@Test
	void aReferencedFragmentCannotBeDeleted() throws Exception {
		String faq1 = faq("Bị dùng", "Câu?", "Đáp", staff);
		String groupId = group(groupModel(), "Nhóm", faq1);

		call(delete(API + "/fragments/" + faq1), staff).andExpect(status().isForbidden());
		call(delete(API + "/fragments/" + faq1), admin).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("FRAGMENT_IN_USE"))
			.andExpect(jsonPath("$.usages[0].sourceId").value(groupId))
			.andExpect(jsonPath("$.usages[0].title").value("Nhóm"));
		call(get(API + "/fragments/" + faq1), staff).andExpect(jsonPath("$.usages[0].title").value("Nhóm"));

		call(delete(API + "/fragments/" + groupId), admin).andExpect(status().isNoContent());
		call(delete(API + "/fragments/" + faq1), admin).andExpect(status().isNoContent());
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM cf_fragment_versions WHERE fragment_id = ?::uuid", Integer.class, faq1))
			.isZero();
	}

	@Test
	void aPreviewLinkShowsTheWorkingCopyToItsHolderOnly() throws Exception {
		String id = faq("Xem trước", "Hỏi?", "Bản nháp", staff);
		String url = body(call(post(API + "/fragments/" + id + "/preview-link"), staff).andExpect(status().isOk())).get("url").asText();
		assertThat(url).startsWith("/api/content/preview/fragments/" + id + "?token=");

		mvc.perform(get(url)).andExpect(status().isOk())
			.andExpect(jsonPath("$.preview").value(true))
			.andExpect(jsonPath("$.data.answer.markdown").value("Bản nháp"))
			.andExpect(header().string("Cache-Control", containsString("no-store")))
			.andExpect(header().string("X-Robots-Tag", "noindex"));
		mvc.perform(get("/api/content/preview/fragments/" + id + "?token=sai")).andExpect(status().isNotFound());
		String other = faq("Khác", "Hỏi?", "Khác", staff);
		mvc.perform(get(url.replace(id, other))).andExpect(status().isNotFound());
	}

	@Test
	void listsFilterByModelFolderStatusAndText() throws Exception {
		String a = faq("Thanh toán", "Trả tiền thế nào?", "COD", staff);
		faq("Bảo quản", "Để được bao lâu?", "6 tháng", staff);
		publish(a, false).andExpect(status().isOk());

		JsonNode page = body(call(get(API + "/fragments?folder=" + folder + "&status=PUBLISHED"), staff));
		assertThat(page.get("totalItems").asLong()).isEqualTo(1);
		page = body(call(get(API + "/fragments?folder=" + folder + "&q=bao quan&modelSlugs=faq"), staff));
		assertThat(page.get("items").get(0).get("title").asText()).isEqualTo("Bảo quản");
		call(get(API + "/folders"), staff).andExpect(jsonPath("$[?(@ == '" + folder + "')]").exists());
	}
}
