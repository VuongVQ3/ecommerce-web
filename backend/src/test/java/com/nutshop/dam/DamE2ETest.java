package com.nutshop.dam;

import com.nutshop.IntegrationTest;
import com.nutshop.auth.AuthCookies;
import com.nutshop.auth.TokenService;
import com.nutshop.content.ContentReferenceService;
import com.nutshop.content.ContentReferenceService.Target;
import com.nutshop.content.ContentReferenceService.TargetType;
import com.nutshop.content.ContentType;
import com.nutshop.content.PreviewTokenService;
import com.nutshop.media.AssetStorage;
import com.nutshop.media.AssetStorage.StoredAsset;
import com.nutshop.media.AssetTypes;
import com.nutshop.security.RateLimiter;
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
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import testsupport.RegisterJson;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Assets (DAM) end to end against PostgreSQL, with the file store mocked. Every test works in its own folder under
 * the root (deleted afterwards with its assets), so tests never see each other's files.
 */
@IntegrationTest
class DamE2ETest {

	private static final String API = "/api/author/assets";

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
	ContentReferenceService references;

	@Autowired
	PreviewTokenService previews;

	@MockitoBean
	AssetStorage storage;

	private Cookie staff;
	private Cookie admin;
	private long rootId;
	private long folder;
	private String folderPath;
	private final List<String> sources = new ArrayList<>();

	@BeforeEach
	void setUp() throws Exception {
		authRateLimiter.reset();
		when(storage.isEnabled()).thenReturn(true);
		when(storage.upload(any(), any())).thenAnswer(inv -> stored("hat-lanh/dam/" + UUID.randomUUID(),
				inv.getArgument(1), 1L));
		when(storage.replace(any(), any(), any())).thenAnswer(inv -> stored(inv.getArgument(0), inv.getArgument(2), 2L));
		staff = as("STAFF");
		admin = as("ADMIN");
		rootId = jdbc.queryForObject("SELECT id FROM dam_folders WHERE path = '/hat-lanh'", Long.class);
		String name = "test-" + UUID.randomUUID().toString().substring(0, 8);
		folder = createFolder(rootId, name, staff).get("id").asLong();
		folderPath = "/hat-lanh/" + name;
	}

	@AfterEach
	void cleanUp() {
		for (String source : sources) {
			jdbc.update("DELETE FROM content_references WHERE source_id = ?", source);
		}
		String like = folderPath + "%";
		jdbc.update("DELETE FROM dam_assets WHERE folder_id IN (SELECT id FROM dam_folders WHERE path LIKE ?)", like);
		jdbc.update("DELETE FROM dam_folders WHERE path LIKE ? AND path <> ?", like + "/%", folderPath);
		jdbc.update("DELETE FROM dam_folders WHERE path LIKE ?", like);
	}

	private static StoredAsset stored(String publicId, AssetTypes.Kind kind, long version) {
		boolean pdf = kind == AssetTypes.Kind.PDF;
		return new StoredAsset(publicId, "https://res.cloudinary.com/demo/image/upload/v" + version + "/" + publicId
				+ (pdf ? ".pdf" : ".jpg"), version, pdf ? 595 : 1200, pdf ? 842 : 800, pdf ? 3 : null, 1000L);
	}

	// ---- files ----------------------------------------------------------------------------------------------

	/** A JPEG header followed by random bytes: a new checksum every time. */
	private static byte[] jpeg() {
		byte[] bytes = new byte[64];
		ThreadLocalRandom.current().nextBytes(bytes);
		bytes[0] = (byte) 0xFF;
		bytes[1] = (byte) 0xD8;
		bytes[2] = (byte) 0xFF;
		return bytes;
	}

	private static byte[] pdf() {
		return ("%PDF-1.4\n% " + UUID.randomUUID() + "\n%%EOF\n").getBytes(StandardCharsets.US_ASCII);
	}

	private ResultActions upload(byte[] bytes, String fileName, long folderId, Cookie cookie) throws Exception {
		return mvc.perform(multipart(API).file(new MockMultipartFile("file", fileName, "application/octet-stream", bytes))
			.param("folderId", String.valueOf(folderId))
			.header("X-Requested-With", "XMLHttpRequest")
			.cookie(cookie));
	}

	private JsonNode uploaded(byte[] bytes, String fileName) throws Exception {
		return body(upload(bytes, fileName, folder, staff).andExpect(status().isCreated()));
	}

	private ResultActions replace(String id, byte[] bytes, String fileName, Cookie cookie) throws Exception {
		MockMultipartHttpServletRequestBuilder request = multipart(API + "/" + id + "/replace");
		return mvc.perform(request.file(new MockMultipartFile("file", fileName, "application/octet-stream", bytes))
			.header("X-Requested-With", "XMLHttpRequest")
			.cookie(cookie));
	}

	private JsonNode body(ResultActions result) throws Exception {
		return json.readTree(result.andReturn().getResponse().getContentAsString());
	}

	private JsonNode createFolder(long parentId, String name, Cookie cookie) throws Exception {
		return body(call(json(post(API + "/folders"), "{\"parentId\":%d,\"name\":\"%s\"}".formatted(parentId, name)), cookie)
			.andExpect(status().isCreated()));
	}

	private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder request, String body) {
		return request.contentType(MediaType.APPLICATION_JSON).content(body);
	}

	private ResultActions call(MockHttpServletRequestBuilder request, Cookie cookie) throws Exception {
		request.header("X-Requested-With", "XMLHttpRequest");
		return mvc.perform(cookie == null ? request : request.cookie(cookie));
	}

	private Cookie as(String role) throws Exception {
		String email = "dam-" + role.toLowerCase() + "-" + UUID.randomUUID() + "@example.com";
		mvc.perform(post("/api/auth/register").header("X-Requested-With", "XMLHttpRequest")
			.contentType(MediaType.APPLICATION_JSON)
			.content(RegisterJson.of("Người " + role, email, "matkhau123"))).andExpect(status().isCreated());
		jdbc.update("UPDATE users SET role = ? WHERE email = ?", role, email);
		return new Cookie(AuthCookies.ACCESS_COOKIE, tokens.issueAccessToken(users.findByEmail(email).orElseThrow()));
	}

	private List<String> auditActions(String assetId) {
		return jdbc.queryForList("SELECT action FROM audit_logs WHERE entity_type = 'ASSET' AND entity_id = ? ORDER BY created_at",
				String.class, assetId);
	}

	// ---- upload ---------------------------------------------------------------------------------------------

	@Test
	void uploadsAnImageAndAPdf() throws Exception {
		JsonNode image = uploaded(jpeg(), "Ảnh bìa Tết.jpg");
		assertThat(image.get("kind").asText()).isEqualTo("IMAGE");
		assertThat(image.get("title").asText()).isEqualTo("Ảnh bìa Tết");
		assertThat(image.get("width").asInt()).isEqualTo(1200);
		assertThat(image.get("height").asInt()).isEqualTo(800);
		assertThat(image.get("pageCount").isNull()).isTrue();
		assertThat(image.get("folderPath").asText()).isEqualTo(folderPath);
		assertThat(image.get("stableUrl").asText()).isEqualTo("/files/" + image.get("id").asText() + "/anh-bia-tet.jpg");
		assertThat(image.get("renditions").propertyNames()).containsExactly("thumb", "card", "hero", "og");
		assertThat(image.get("createdByName").asText()).isEqualTo("Người STAFF");

		JsonNode pdf = uploaded(pdf(), "Bảng giá sỉ.pdf");
		assertThat(pdf.get("kind").asText()).isEqualTo("PDF");
		assertThat(pdf.get("mime").asText()).isEqualTo("application/pdf");
		assertThat(pdf.get("pageCount").asInt()).isEqualTo(3);
		assertThat(pdf.get("width").isNull()).isTrue();
		assertThat(pdf.get("renditions").propertyNames()).containsExactly("thumb", "card");
		assertThat(pdf.get("renditions").get("thumb").asText()).contains("/pg_1,").endsWith(".jpg");
	}

	@Test
	void aTitleAndAltCanBeGivenOnUpload() throws Exception {
		mvc.perform(multipart(API).file(new MockMultipartFile("file", "x.jpg", "image/jpeg", jpeg()))
			.param("folderId", String.valueOf(folder))
			.param("title", "Banner mùa thu")
			.param("alt", "Rổ hạt điều")
			.header("X-Requested-With", "XMLHttpRequest")
			.cookie(staff)).andExpect(status().isCreated())
			.andExpect(jsonPath("$.title").value("Banner mùa thu"))
			.andExpect(jsonPath("$.alt").value("Rổ hạt điều"));
	}

	@Test
	void filesOver10MbAreRefusedBeforeReachingTheStore() throws Exception {
		byte[] big = new byte[(int) DamAssetService.MAX_FILE_BYTES + 1];
		big[0] = (byte) 0xFF;
		big[1] = (byte) 0xD8;
		big[2] = (byte) 0xFF;
		upload(big, "to.jpg", folder, staff).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("FILE_TOO_LARGE"));
		verify(storage, never()).upload(any(), any());
	}

	@Test
	void fakeAndEmptyFilesAreRefused() throws Exception {
		upload(pdf(), "bang-gia.jpg", folder, staff).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_FILE"));
		upload("chỉ là chữ".getBytes(StandardCharsets.UTF_8), "ghi-chu.pdf", folder, staff).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_FILE"));
		upload(new byte[0], "rong.pdf", folder, staff).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_FILE"));
		verify(storage, never()).upload(any(), any());
	}

	@Test
	void theSameFileTwiceIsADuplicateNamingTheExistingAsset() throws Exception {
		byte[] bytes = jpeg();
		String id = uploaded(bytes, "a.jpg").get("id").asText();
		upload(bytes, "ban-sao.jpg", folder, staff).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("DUPLICATE_ASSET"))
			.andExpect(jsonPath("$.assetId").value(id));
		verify(storage, org.mockito.Mockito.times(1)).upload(any(), any());
	}

	@Test
	void whenSavingFailsTheUploadedFileIsDeletedAgain() throws Exception {
		String taken = uploaded(jpeg(), "a.jpg").get("id").asText();
		String publicId = jdbc.queryForObject("SELECT storage_public_id FROM dam_assets WHERE id = ?::uuid", String.class, taken);
		// The store hands back an id already in the table: the insert fails
		when(storage.upload(any(), any())).thenReturn(stored(publicId, AssetTypes.Kind.IMAGE, 1L));

		upload(jpeg(), "b.jpg", folder, staff).andExpect(status().isConflict());

		verify(storage).delete(publicId);
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dam_assets WHERE folder_id = ?", Integer.class, folder)).isEqualTo(1);
	}

	@Test
	void uploadingIntoAMissingFolderIs404() throws Exception {
		upload(jpeg(), "a.jpg", 999_999_999L, staff).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("FOLDER_NOT_FOUND"));
	}

	// ---- permissions ----------------------------------------------------------------------------------------

	@Test
	void signedOutIs401AndCustomersAre403() throws Exception {
		call(get(API), null).andExpect(status().isUnauthorized());
		call(get(API + "/folders"), null).andExpect(status().isUnauthorized());
		Cookie customer = as("CUSTOMER");
		call(get(API), customer).andExpect(status().isForbidden());
		upload(jpeg(), "a.jpg", folder, customer).andExpect(status().isForbidden());
	}

	@Test
	void staffEditsAndMovesButOnlyAdminDeletes() throws Exception {
		String id = uploaded(jpeg(), "a.jpg").get("id").asText();
		long other = createFolder(folder, "con", staff).get("id").asLong();

		call(json(patch(API + "/" + id), """
				{"title":"Hạt điều","alt":"Hạt điều rang","description":"Mô tả","tags":["Tết"," banner "]}"""), staff)
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.alt").value("Hạt điều rang"))
			.andExpect(jsonPath("$.tags[0]").value("tết"))
			.andExpect(jsonPath("$.tags[1]").value("banner"));
		call(json(post(API + "/" + id + "/move"), "{\"folderId\":" + other + "}"), staff).andExpect(status().isOk())
			.andExpect(jsonPath("$.folderId").value(other));
		call(delete(API + "/" + id), staff).andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("CONTENT_DELETE_FORBIDDEN"));

		String publicId = jdbc.queryForObject("SELECT storage_public_id FROM dam_assets WHERE id = ?::uuid", String.class, id);
		String preview = previews.issue(ContentType.ASSET, id, null).rawToken();
		call(delete(API + "/" + id), admin).andExpect(status().isNoContent());

		call(get(API + "/" + id), admin).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("ASSET_NOT_FOUND"));
		verify(storage).delete(publicId);
		assertThat(previews.resolve(preview)).isEmpty();
	}

	@Test
	void anAssetInUseCannotBeDeleted() throws Exception {
		String id = uploaded(jpeg(), "a.jpg").get("id").asText();
		String page = "test-page-" + UUID.randomUUID().toString().substring(0, 8);
		sources.add(page);
		references.replace(ContentType.PAGE, page, Set.of(new Target(TargetType.ASSET, id)));

		call(delete(API + "/" + id), admin).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("ASSET_IN_USE"))
			.andExpect(jsonPath("$.usages[0].sourceType").value("PAGE"))
			.andExpect(jsonPath("$.usages[0].sourceId").value(page));
		call(get(API + "/" + id), staff).andExpect(jsonPath("$.usages[0].sourceId").value(page));
		call(get(API + "/" + id + "/usages"), staff).andExpect(jsonPath("$[0].sourceId").value(page));
		verify(storage, never()).delete(any());
	}

	// ---- folders --------------------------------------------------------------------------------------------

	@Test
	void foldersAreSlugsUniqueAmongSiblingsAndRenamingMovesThePathsBelow() throws Exception {
		JsonNode tet = createFolder(folder, "Khuyến mãi Tết", staff);
		assertThat(tet.get("name").asText()).isEqualTo("khuyen-mai-tet");
		assertThat(tet.get("path").asText()).isEqualTo(folderPath + "/khuyen-mai-tet");
		call(json(post(API + "/folders"), "{\"parentId\":%d,\"name\":\"khuyen mai TET\"}".formatted(folder)), staff)
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("FOLDER_EXISTS"));
		long child = createFolder(tet.get("id").asLong(), "banner", staff).get("id").asLong();
		createFolder(child, "nho", staff);

		call(json(patch(API + "/folders/" + tet.get("id").asLong()), "{\"name\":\"Tết 2027\"}"), staff)
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.path").value(folderPath + "/tet-2027"));

		assertThat(jdbc.queryForList("SELECT path FROM dam_folders WHERE path LIKE ? ORDER BY path", String.class,
				folderPath + "/%")).containsExactly(folderPath + "/tet-2027", folderPath + "/tet-2027/banner",
						folderPath + "/tet-2027/banner/nho");
	}

	@Test
	void onlyEmptyFoldersGoAndTheRootStays() throws Exception {
		long full = createFolder(folder, "co-file", staff).get("id").asLong();
		upload(jpeg(), "a.jpg", full, staff).andExpect(status().isCreated());
		long parent = createFolder(folder, "co-con", staff).get("id").asLong();
		createFolder(parent, "con", staff);
		long empty = createFolder(folder, "trong", staff).get("id").asLong();

		call(delete(API + "/folders/" + full), admin).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("FOLDER_NOT_EMPTY"));
		call(delete(API + "/folders/" + parent), admin).andExpect(status().isConflict());
		call(delete(API + "/folders/" + empty), staff).andExpect(status().isForbidden());
		call(delete(API + "/folders/" + empty), admin).andExpect(status().isNoContent());

		call(json(patch(API + "/folders/" + rootId), "{\"name\":\"goc-moi\"}"), admin).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("ROOT_FOLDER_LOCKED"));
		call(delete(API + "/folders/" + rootId), admin).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("ROOT_FOLDER_LOCKED"));
	}

	@Test
	void theTreeCountsAssetsPerFolder() throws Exception {
		uploaded(jpeg(), "a.jpg");
		uploaded(pdf(), "b.pdf");
		JsonNode roots = body(call(get(API + "/folders"), staff).andExpect(status().isOk()));
		assertThat(roots).hasSize(1);
		JsonNode root = roots.get(0);
		assertThat(root.get("path").asText()).isEqualTo("/hat-lanh");
		List<String> names = new ArrayList<>();
		JsonNode mine = null;
		for (JsonNode child : root.get("children")) {
			names.add(child.get("name").asText());
			if (child.get("id").asLong() == folder) {
				mine = child;
			}
		}
		assertThat(names).contains("banners", "san-pham", "tai-lieu");
		assertThat(mine).isNotNull();
		assertThat(mine.get("assetCount").asLong()).isEqualTo(2);
	}

	// ---- replace and the stable link ------------------------------------------------------------------------

	@Test
	void replacingKeepsTheIdAndStableLinkAndChangesVersionAndChecksum() throws Exception {
		JsonNode before = uploaded(pdf(), "Bảng giá.pdf");
		String id = before.get("id").asText();
		call(json(patch(API + "/" + id), "{\"title\":\"Bảng giá sỉ\",\"alt\":null,\"tags\":[\"gia\"]}"), staff)
			.andExpect(status().isOk());

		JsonNode after = body(replace(id, pdf(), "bang-gia-moi.pdf", staff).andExpect(status().isOk()));

		assertThat(after.get("id").asText()).isEqualTo(id);
		assertThat(after.get("stableUrl").asText()).isEqualTo(before.get("stableUrl").asText());
		assertThat(after.get("fileName").asText()).isEqualTo("Bảng giá.pdf");
		assertThat(after.get("title").asText()).isEqualTo("Bảng giá sỉ");
		assertThat(after.get("tags").get(0).asText()).isEqualTo("gia");
		assertThat(after.get("storageVersion").asLong()).isEqualTo(2);
		assertThat(after.get("checksum").asText()).isNotEqualTo(before.get("checksum").asText());
		assertThat(after.get("url").asText()).contains("/v2/");
		String publicId = jdbc.queryForObject("SELECT storage_public_id FROM dam_assets WHERE id = ?::uuid", String.class, id);
		verify(storage).replace(eq(publicId), any(), eq(AssetTypes.Kind.PDF));
		String checksums = jdbc.queryForObject("""
				SELECT before ->> 'checksum' || '>' || (after ->> 'checksum') FROM audit_logs
				WHERE entity_type = 'ASSET' AND entity_id = ? AND action = 'CONTENT_FILE_REPLACED'""", String.class, id);
		assertThat(checksums).isEqualTo(before.get("checksum").asText() + ">" + after.get("checksum").asText());
	}

	@Test
	void anImageIsOnlyReplacedByAnImage() throws Exception {
		String id = uploaded(jpeg(), "a.jpg").get("id").asText();
		replace(id, pdf(), "gia.pdf", staff).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("KIND_MISMATCH"));
		String other = uploaded(jpeg(), "b.jpg").get("id").asText();
		byte[] taken = jpeg();
		uploaded(taken, "c.jpg");
		replace(other, taken, "c.jpg", staff).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("DUPLICATE_ASSET"));
		verify(storage, never()).replace(any(), any(), any());
	}

	@Test
	void theStableLinkRedirectsToTheCurrentFileWithoutSigningIn() throws Exception {
		JsonNode pdf = uploaded(pdf(), "Bảng giá.pdf");
		String link = pdf.get("stableUrl").asText();

		mvc.perform(get(link)).andExpect(status().isFound())
			.andExpect(header().string("Location", pdf.get("url").asText()))
			.andExpect(header().string("Cache-Control", containsString("max-age=300")))
			.andExpect(header().string("Cache-Control", containsString("public")))
			.andExpect(header().string("X-Robots-Tag", "noindex"));
		// The readable part is never looked up
		mvc.perform(get("/files/" + pdf.get("id").asText() + "/ten-khac.pdf")).andExpect(status().isFound());

		JsonNode replaced = body(replace(pdf.get("id").asText(), pdf(), "moi.pdf", staff).andExpect(status().isOk()));
		mvc.perform(get(link)).andExpect(header().string("Location", replaced.get("url").asText()))
			.andExpect(header().string("Location", containsString("/v2/")));

		JsonNode image = uploaded(jpeg(), "a.jpg");
		mvc.perform(get(image.get("stableUrl").asText())).andExpect(status().isFound())
			.andExpect(header().doesNotExist("X-Robots-Tag"));
	}

	@Test
	void unknownFilesAreTheUsual404Page() throws Exception {
		mvc.perform(get("/files/" + UUID.randomUUID() + "/bang-gia.pdf")).andExpect(status().isNotFound())
			.andExpect(content().string(containsString("Không tìm thấy trang")));
		mvc.perform(get("/files/khong-phai-uuid/bang-gia.pdf")).andExpect(status().isNotFound())
			.andExpect(content().string(containsString("Không tìm thấy trang")));
	}

	// ---- search ---------------------------------------------------------------------------------------------

	private List<String> titles(String query) throws Exception {
		JsonNode page = body(call(get(API + "?" + query), staff).andExpect(status().isOk()));
		List<String> titles = new ArrayList<>();
		page.get("items").forEach(item -> titles.add(item.get("title").asText()));
		return titles;
	}

	@Test
	void searchIgnoresCaseAndAccentsAndFiltersByTagKindAndSubfolders() throws Exception {
		String price = uploaded(pdf(), "bao-gia.pdf").get("id").asText();
		call(json(patch(API + "/" + price), "{\"title\":\"Bảng giá sỉ\",\"tags\":[\"Khách sỉ\"]}"), staff).andExpect(status().isOk());
		String banner = uploaded(jpeg(), "Banner Tết.jpg").get("id").asText();
		call(json(patch(API + "/" + banner), "{\"title\":\"Banner Tết\",\"tags\":[\"tet\"]}"), staff).andExpect(status().isOk());
		long child = createFolder(folder, "con", staff).get("id").asLong();
		upload(jpeg(), "Ảnh con.jpg", child, staff).andExpect(status().isCreated());

		String in = "folderId=" + folder;
		assertThat(titles(in + "&q=bang gia")).containsExactly("Bảng giá sỉ");
		assertThat(titles(in + "&q=BANG GIÁ")).containsExactly("Bảng giá sỉ");
		assertThat(titles(in + "&q=khach si")).containsExactly("Bảng giá sỉ");
		assertThat(titles(in + "&q=TẾT.JPG")).containsExactly("Banner Tết");
		assertThat(titles(in + "&tag=TET")).containsExactly("Banner Tết");
		assertThat(titles(in + "&kind=PDF")).containsExactly("Bảng giá sỉ");
		assertThat(titles(in + "&kind=IMAGE")).containsExactly("Banner Tết");
		assertThat(titles(in)).containsExactly("Banner Tết", "Bảng giá sỉ");
		assertThat(titles(in + "&includeSubfolders=true")).containsExactlyInAnyOrder("Ảnh con", "Banner Tết", "Bảng giá sỉ");
		assertThat(titles("folderId=" + child)).containsExactly("Ảnh con");

		JsonNode page = body(call(get(API + "?" + in + "&size=1&page=1"), staff));
		assertThat(page.get("totalItems").asLong()).isEqualTo(2);
		assertThat(page.get("totalPages").asInt()).isEqualTo(2);
		assertThat(page.get("items").get(0).get("title").asText()).isEqualTo("Bảng giá sỉ");
		assertThat(page.get("items").get(0).get("updatedByName").asText()).isEqualTo("Người STAFF");
	}

	@Test
	void tooManyOrTooLongTagsAreRefused() throws Exception {
		String id = uploaded(jpeg(), "a.jpg").get("id").asText();
		String many = String.join(",", java.util.stream.IntStream.range(0, 21).mapToObj(i -> "\"t" + i + "\"").toList());
		call(json(patch(API + "/" + id), "{\"title\":\"A\",\"tags\":[" + many + "]}"), staff).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("TOO_MANY_TAGS"));
		call(json(patch(API + "/" + id), "{\"title\":\" \"}"), staff).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors.title").value("Nhập tiêu đề"));
	}

	// ---- audit ----------------------------------------------------------------------------------------------

	@Test
	void everyChangeIsInTheAuditLog() throws Exception {
		String id = uploaded(jpeg(), "a.jpg").get("id").asText();
		long other = createFolder(folder, "khac", staff).get("id").asLong();
		call(json(patch(API + "/" + id), "{\"title\":\"Ảnh mới\",\"alt\":\"Mô tả\"}"), staff).andExpect(status().isOk());
		call(json(post(API + "/" + id + "/move"), "{\"folderId\":" + other + "}"), staff).andExpect(status().isOk());
		replace(id, jpeg(), "b.jpg", staff).andExpect(status().isOk());
		call(delete(API + "/" + id), admin).andExpect(status().isNoContent());

		assertThat(auditActions(id)).containsExactly("CONTENT_CREATED", "CONTENT_UPDATED", "CONTENT_MOVED",
				"CONTENT_FILE_REPLACED", "CONTENT_DELETED");
		assertThat(jdbc.queryForObject("""
				SELECT before ->> 'folder' || '>' || (after ->> 'folder') FROM audit_logs
				WHERE entity_type = 'ASSET' AND entity_id = ? AND action = 'CONTENT_MOVED'""", String.class, id))
			.isEqualTo(folderPath + ">" + folderPath + "/khac");
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_logs WHERE entity_type = 'DAM_FOLDER' AND entity_id = ?",
				Integer.class, String.valueOf(other))).isEqualTo(1);
	}

	@Test
	void anUnknownAssetIs404() throws Exception {
		call(get(API + "/" + UUID.randomUUID()), staff).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("ASSET_NOT_FOUND"));
		call(get(API + "/khong-ton-tai/usages"), staff).andExpect(status().isBadRequest());
		// The detail page of the app itself (any id): served, never indexed
		mvc.perform(get("/author/assets/" + UUID.randomUUID())).andExpect(status().isOk())
			.andExpect(content().string(containsString("noindex")));
	}
}
