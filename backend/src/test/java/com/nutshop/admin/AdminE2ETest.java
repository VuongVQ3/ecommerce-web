package com.nutshop.admin;

import com.nutshop.IntegrationTest;
import com.nutshop.auth.AuthCookies;
import com.nutshop.auth.TokenService;
import com.nutshop.mail.EmailMessage;
import com.nutshop.media.ImageStorage;
import com.nutshop.media.ImageTypes;
import com.nutshop.security.RateLimiter;
import com.nutshop.user.UserRepository;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import testsupport.CapturingEmailSender;
import testsupport.RegisterJson;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Back office against PostgreSQL. Image storage is faked; everything else is the real stack. */
@IntegrationTest
@Import(CapturingEmailSender.Config.class)
class AdminE2ETest {

	private static final byte[] PNG = { (byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n', 0, 0, 0, 13 };

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcTemplate jdbc;

	@Autowired
	CapturingEmailSender mailbox;

	@Autowired
	UserRepository users;

	@Autowired
	TokenService tokens;

	@Autowired
	RateLimiter authRateLimiter;

	@Autowired
	RateLimiter orderCreateRateLimiter;

	@Autowired
	com.nutshop.audit.AuditLog auditLog;

	@Autowired
	org.springframework.transaction.PlatformTransactionManager txManager;

	@MockitoBean
	ImageStorage storage;

	private final List<Long> createdProducts = new ArrayList<>();
	private final AtomicInteger uploads = new AtomicInteger();

	@BeforeEach
	void setUp() {
		authRateLimiter.reset();
		orderCreateRateLimiter.reset();
		mailbox.clear();
		when(storage.isEnabled()).thenReturn(true);
		when(storage.upload(any(), any())).thenAnswer(inv -> {
			String id = "test/" + UUID.randomUUID();
			uploads.incrementAndGet();
			return new ImageStorage.StoredImage(id, "https://res.cloudinary.com/demo/image/upload/v1/" + id + ".png",
					800, 800);
		});
	}

	@AfterEach
	void cleanUp() {
		for (Long id : createdProducts) {
			jdbc.update("DELETE FROM orders WHERE id IN (SELECT order_id FROM order_items WHERE product_id = ?)", id);
			jdbc.update("DELETE FROM inventory_movements WHERE product_id = ?", id);
			jdbc.update("DELETE FROM cart_items WHERE product_id = ?", id);
			jdbc.update("DELETE FROM products WHERE id = ?", id);
		}
	}

	// ---- helpers --------------------------------------------------------------------------------------------

	/** Registers a fresh account with the given role and returns its access cookie. */
	private Cookie as(String role) throws Exception {
		String email = role.toLowerCase() + "-" + UUID.randomUUID() + "@example.com";
		mvc.perform(post("/api/auth/register").header("X-Requested-With", "XMLHttpRequest")
			.contentType(MediaType.APPLICATION_JSON)
			.content(RegisterJson.of("Nhân Viên " + role, email, "matkhau123"))).andExpect(status().isCreated());
		jdbc.update("UPDATE users SET role = ? WHERE email = ?", role, email);
		var user = users.findByEmail(email).orElseThrow();
		return new Cookie(AuthCookies.ACCESS_COOKIE, tokens.issueAccessToken(user));
	}

	private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder request, String body) {
		return request.header("X-Requested-With", "XMLHttpRequest").contentType(MediaType.APPLICATION_JSON).content(body);
	}

	private ResultActions call(MockHttpServletRequestBuilder request, Cookie cookie) throws Exception {
		return mvc.perform(request.header("X-Requested-With", "XMLHttpRequest").cookie(cookie));
	}

	private static String productJson(String name, String slug, long price) {
		return """
				{"name":"%s",%s"categoryId":1,"description":"Mô tả test","origin":"Việt Nam","price":%d,
				 "weightGrams":250,"calories":550,"protein":20,"fat":40,"carbs":25,"fiber":8,"lowStockThreshold":10}"""
			.formatted(name, slug == null ? "" : "\"slug\":\"" + slug + "\",", price);
	}

	private long createProduct(Cookie admin, String name, String slug) throws Exception {
		String response = mvc
			.perform(json(post("/api/admin/products"), productJson(name, slug, 120_000)).cookie(admin))
			.andExpect(status().isCreated())
			.andReturn()
			.getResponse()
			.getContentAsString();
		long id = Long.parseLong(response.replaceAll("(?s).*?\"id\":(\\d+).*", "$1"));
		createdProducts.add(id);
		return id;
	}

	private void importStock(Cookie cookie, long productId, int quantity) throws Exception {
		mvc.perform(json(post("/api/admin/inventory/" + productId + "/import"),
				"{\"quantity\":" + quantity + ",\"unitCost\":80000,\"supplier\":\"NCC Test\"}")
			.cookie(cookie)).andExpect(status().isOk());
	}

	private String placeOrder(long productId, int quantity) throws Exception {
		String body = """
				{"idempotencyKey":"admin-%s","customerName":"Khách Test","phone":"0912345678","email":"khach@example.com",
				 "provinceCode":1,"wardCode":4,"addressLine":"1 Phố Test","items":[{"productId":%d,"quantity":%d}]}"""
			.formatted(UUID.randomUUID(), productId, quantity);
		orderCreateRateLimiter.reset();
		String response = mvc.perform(json(post("/api/orders"), body))
			.andExpect(status().isCreated())
			.andReturn()
			.getResponse()
			.getContentAsString();
		mailbox.clear(); // drop the confirmation email
		return response.replaceAll("(?s).*?\"code\":\"([A-Z0-9]+)\".*", "$1");
	}

	private int[] stock(long productId) {
		return jdbc.queryForObject("SELECT on_hand, reserved FROM products WHERE id = ?",
				(rs, n) -> new int[] { rs.getInt(1), rs.getInt(2) }, productId);
	}

	/** on_hand = Σ(IMPORT, ADJUST, ORDER_SHIP); reserved = Σ(ORDER_RESERVE, ORDER_CANCEL, ORDER_SHIP). */
	private void assertLedgerMatches(long productId) {
		int[] stock = stock(productId);
		Integer onHand = jdbc.queryForObject("""
				SELECT COALESCE(SUM(quantity), 0) FROM inventory_movements
				WHERE product_id = ? AND type IN ('IMPORT', 'ADJUST', 'ORDER_SHIP', 'RETURN')""", Integer.class, productId);
		Integer reserved = jdbc.queryForObject("""
				SELECT COALESCE(SUM(quantity), 0) FROM inventory_movements
				WHERE product_id = ? AND type IN ('ORDER_RESERVE', 'ORDER_CANCEL', 'ORDER_SHIP')""", Integer.class,
				productId);
		assertThat(onHand).isEqualTo(stock[0]);
		assertThat(reserved).isEqualTo(stock[1]);
	}

	private int audits(String action, Object entityId) {
		return jdbc.queryForObject("SELECT COUNT(*) FROM audit_logs WHERE action = ? AND entity_id = ?",
				Integer.class, action, String.valueOf(entityId));
	}

	// ---- access ---------------------------------------------------------------------------------------------

	@Test
	void anonymousGets401AndCustomerGets403() throws Exception {
		mvc.perform(get("/api/admin/orders")).andExpect(status().isUnauthorized());
		Cookie customer = as("CUSTOMER");
		call(get("/api/admin/orders"), customer).andExpect(status().isForbidden());
		call(get("/api/admin/dashboard"), customer).andExpect(status().isForbidden());
		call(get("/api/admin/products"), customer).andExpect(status().isForbidden());
	}

	@Test
	void staffHandlesOrdersAndStockButCannotEditCatalogue() throws Exception {
		Cookie admin = as("ADMIN");
		Cookie staff = as("STAFF");
		long id = createProduct(admin, "Hạt quyền nhân viên", null);

		call(get("/api/admin/orders"), staff).andExpect(status().isOk()).andExpect(jsonPath("$.pendingCount").isNumber());
		call(get("/api/admin/dashboard"), staff).andExpect(status().isOk())
			.andExpect(jsonPath("$.revenueByDay", hasSize(7)));
		call(get("/api/admin/inventory"), staff).andExpect(status().isOk());
		call(get("/api/admin/categories"), staff).andExpect(status().isOk());
		importStock(staff, id, 5);

		mvc.perform(json(put("/api/admin/products/" + id), productJson("Đổi giá", null, 1_000)).cookie(staff))
			.andExpect(status().isForbidden());
		mvc.perform(json(patch("/api/admin/products/" + id + "/active"), "{\"active\":false}").cookie(staff))
			.andExpect(status().isForbidden());
		mvc.perform(json(post("/api/admin/categories"), "{\"name\":\"Mới\"}").cookie(staff))
			.andExpect(status().isForbidden());
		assertThat(jdbc.queryForObject("SELECT price FROM products WHERE id = ?", Long.class, id)).isEqualTo(120_000);
	}

	// ---- orders ---------------------------------------------------------------------------------------------

	@Test
	void orderWorkflowFollowsTheStateMachine() throws Exception {
		Cookie admin = as("ADMIN");
		long id = createProduct(admin, "Hạt quy trình đơn", null);
		importStock(admin, id, 10);
		String code = placeOrder(id, 3);

		call(get("/api/admin/orders/" + code), admin).andExpect(status().isOk())
			.andExpect(jsonPath("$.allowedActions", hasItem("CONFIRM")))
			.andExpect(jsonPath("$.guest").value(true));
		// PENDING -> COMPLETED is not allowed
		call(post("/api/admin/orders/" + code + "/complete"), admin).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("INVALID_STATUS_TRANSITION"));
		mvc.perform(json(post("/api/admin/orders/" + code + "/confirm"), "{\"contact\":\"CALLED\"}").cookie(admin)).andExpect(status().isOk())
			.andExpect(jsonPath("$.order.status").value("CONFIRMED"));
		mvc.perform(json(post("/api/admin/orders/" + code + "/confirm"), "{\"contact\":\"CALLED\"}").cookie(admin)).andExpect(status().isConflict());

		mvc.perform(json(post("/api/admin/orders/" + code + "/ship"), "{\"carrier\":\"\",\"trackingNumber\":\"\"}")
			.cookie(admin)).andExpect(status().isBadRequest());
		mvc.perform(json(post("/api/admin/orders/" + code + "/ship"),
				"{\"carrier\":\"GHN\",\"trackingNumber\":\"GHN123\"}").cookie(admin))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.order.status").value("SHIPPING"))
			.andExpect(jsonPath("$.carrier").value("GHN"));
		assertThat(stock(id)).containsExactly(7, 0);
		EmailMessage mail = mailbox.next(Duration.ofSeconds(5));
		assertThat(mail).isNotNull();
		assertThat(mail.text()).contains("GHN123");

		// Shipped orders can only be cancelled when the parcel is refused at the door
		mvc.perform(json(post("/api/admin/orders/" + code + "/cancel"), "{\"reasonCode\":\"CUSTOMER_REQUEST\",\"reason\":\"Khách đổi ý\"}").cookie(admin))
			.andExpect(status().isConflict());
		call(post("/api/admin/orders/" + code + "/complete"), admin).andExpect(status().isOk())
			.andExpect(jsonPath("$.allowedActions", hasSize(0)));

		mvc.perform(json(post("/api/admin/orders/" + code + "/notes"), "{\"body\":\"Khách hẹn giao chiều\"}")
			.cookie(admin)).andExpect(status().isOk()).andExpect(jsonPath("$.notes[0].body").value("Đã gọi điện xác nhận với khách"))
			.andExpect(jsonPath("$.notes[1].body").value("Khách hẹn giao chiều"));

		call(get("/api/admin/orders?status=COMPLETED&q=" + code), admin).andExpect(status().isOk())
			.andExpect(jsonPath("$.page.items[0].code").value(code));
		call(get("/api/admin/orders?q=0912345678&status=COMPLETED"), admin).andExpect(status().isOk())
			.andExpect(jsonPath("$.page.items[?(@.code == '" + code + "')]").exists());
		assertThat(audits("ORDER_SHIP", code)).isEqualTo(1);
		assertThat(audits("ORDER_COMPLETE", code)).isEqualTo(1);
		assertLedgerMatches(id);
	}

	@Test
	void concurrentShipClicksDeductStockOnce() throws Exception {
		Cookie admin = as("ADMIN");
		long id = createProduct(admin, "Hạt bấm đúp", null);
		importStock(admin, id, 10);
		String code = placeOrder(id, 4);
		mvc.perform(json(post("/api/admin/orders/" + code + "/confirm"), "{\"contact\":\"CALLED\"}").cookie(admin)).andExpect(status().isOk());

		int threads = 4;
		CountDownLatch start = new CountDownLatch(1);
		ExecutorService pool = Executors.newFixedThreadPool(threads);
		List<Future<Integer>> results = new ArrayList<>();
		for (int i = 0; i < threads; i++) {
			Callable<Integer> click = () -> {
				start.await();
				return mvc.perform(json(post("/api/admin/orders/" + code + "/ship"),
						"{\"carrier\":\"GHTK\",\"trackingNumber\":\"T1\"}").cookie(admin))
					.andReturn()
					.getResponse()
					.getStatus();
			};
			results.add(pool.submit(click));
		}
		start.countDown();
		List<Integer> statuses = new ArrayList<>();
		for (Future<Integer> f : results) {
			statuses.add(f.get());
		}
		pool.shutdown();

		assertThat(statuses).containsOnly(200, 409);
		assertThat(statuses.stream().filter(s -> s == 200).count()).isEqualTo(1);
		assertThat(stock(id)).containsExactly(6, 0);
		assertLedgerMatches(id);
	}

	@Test
	void cancelNeedsAReasonReleasesStockAndEmailsTheCustomer() throws Exception {
		Cookie staff = as("STAFF");
		Cookie admin = as("ADMIN");
		long id = createProduct(admin, "Hạt huỷ đơn", null);
		importStock(staff, id, 10);
		String code = placeOrder(id, 2);
		assertThat(stock(id)).containsExactly(10, 2);

		mvc.perform(json(post("/api/admin/orders/" + code + "/cancel"), "{\"reasonCode\":\"OUT_OF_STOCK\",\"reason\":\"  \"}").cookie(staff))
			.andExpect(status().isBadRequest());
		assertThat(stock(id)).containsExactly(10, 2);

		mvc.perform(json(post("/api/admin/orders/" + code + "/cancel"), "{\"reasonCode\":\"OUT_OF_STOCK\",\"reason\":\"Hết hàng tại kho\"}")
			.cookie(staff)).andExpect(status().isOk()).andExpect(jsonPath("$.order.status").value("CANCELLED"));
		assertThat(stock(id)).containsExactly(10, 0);
		EmailMessage mail = mailbox.next(Duration.ofSeconds(5));
		assertThat(mail).isNotNull();
		assertThat(mail.text()).contains("Hết hàng tại kho");
		assertThat(audits("ORDER_CANCEL", code)).isEqualTo(1);
		assertLedgerMatches(id);
	}

	// ---- inventory ------------------------------------------------------------------------------------------

	@Test
	void ledgerMatchesStockAfterImportSaleCancelAndStocktake() throws Exception {
		Cookie admin = as("ADMIN");
		long id = createProduct(admin, "Hạt sổ kho", null);
		assertThat(stock(id)).containsExactly(0, 0);

		importStock(admin, id, 20);
		String shipped = placeOrder(id, 3);
		String cancelled = placeOrder(id, 2);
		mvc.perform(json(post("/api/admin/orders/" + shipped + "/confirm"), "{\"contact\":\"CALLED\"}").cookie(admin)).andExpect(status().isOk());
		mvc.perform(json(post("/api/admin/orders/" + shipped + "/ship"), "{\"carrier\":\"GHN\",\"trackingNumber\":\"A\"}")
			.cookie(admin)).andExpect(status().isOk());
		mvc.perform(json(post("/api/admin/orders/" + cancelled + "/cancel"), "{\"reasonCode\":\"CUSTOMER_REQUEST\",\"reason\":\"Khách huỷ\"}").cookie(admin))
			.andExpect(status().isOk());
		assertThat(stock(id)).containsExactly(17, 0);
		assertLedgerMatches(id);

		// Stocktake: needs a reason; records the difference only
		mvc.perform(json(post("/api/admin/inventory/" + id + "/stocktake"), "{\"counted\":15,\"reason\":\"\"}")
			.cookie(admin)).andExpect(status().isBadRequest());
		mvc.perform(json(post("/api/admin/inventory/" + id + "/stocktake"), "{\"counted\":15,\"reason\":\"Hư hỏng 2 gói\"}")
			.cookie(admin))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.difference").value(-2))
			.andExpect(jsonPath("$.stock.onHand").value(15));
		assertLedgerMatches(id);

		// Cannot count below what pending orders hold
		placeOrder(id, 4);
		mvc.perform(json(post("/api/admin/inventory/" + id + "/stocktake"), "{\"counted\":3,\"reason\":\"Đếm lại\"}")
			.cookie(admin)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("COUNT_BELOW_RESERVED"));
		assertLedgerMatches(id);

		call(get("/api/admin/inventory/" + id + "/movements"), admin).andExpect(status().isOk())
			.andExpect(jsonPath("$.items[0].type").value("ORDER_RESERVE"))
			.andExpect(jsonPath("$.items[?(@.type == 'IMPORT')].supplier").value(hasItem("NCC Test")))
			.andExpect(jsonPath("$.items[?(@.type == 'ORDER_SHIP')].orderCode").value(hasItem(shipped)));
		assertThat(audits("STOCK_IMPORTED", id)).isEqualTo(1);
		assertThat(audits("STOCK_ADJUSTED", id)).isEqualTo(1);
	}

	@Test
	void lowStockFilterAndPublicStockStatusHideExactCounts() throws Exception {
		Cookie admin = as("ADMIN");
		long id = createProduct(admin, "Hạt sắp hết", "hat-sap-het-" + UUID.randomUUID().toString().substring(0, 8));
		String slug = jdbc.queryForObject("SELECT slug FROM products WHERE id = ?", String.class, id);

		mvc.perform(get("/api/products/" + slug)).andExpect(jsonPath("$.stockStatus.status").value("OUT_OF_STOCK"))
			.andExpect(jsonPath("$.onHand").doesNotExist());
		importStock(admin, id, 4);
		mvc.perform(get("/api/products/" + slug)).andExpect(jsonPath("$.stockStatus.status").value("LOW_STOCK"))
			.andExpect(jsonPath("$.stockStatus.quantity").value(4))
			.andExpect(jsonPath("$.maxPurchasable").value(4));
		call(get("/api/admin/inventory?low=true&q=" + slug), admin)
			.andExpect(jsonPath("$.items[0].id").value(id))
			.andExpect(jsonPath("$.items[0].lowStock").value(true));

		importStock(admin, id, 96);
		mvc.perform(get("/api/products/" + slug)).andExpect(jsonPath("$.stockStatus.status").value("IN_STOCK"))
			.andExpect(jsonPath("$.stockStatus.quantity").doesNotExist())
			.andExpect(jsonPath("$.maxPurchasable").value(10));
		call(get("/api/admin/inventory?low=true&q=" + slug), admin).andExpect(jsonPath("$.items", hasSize(0)));
	}

	// ---- catalogue ------------------------------------------------------------------------------------------

	@Test
	void adminCreatesEditsAndHidesProductsWithUniqueSlugs() throws Exception {
		Cookie admin = as("ADMIN");
		String name = "Hạt Điều Rang Muối Đặc Biệt " + UUID.randomUUID().toString().substring(0, 6);
		long first = createProduct(admin, name, null);
		long second = createProduct(admin, name, null);
		String firstSlug = jdbc.queryForObject("SELECT slug FROM products WHERE id = ?", String.class, first);
		String secondSlug = jdbc.queryForObject("SELECT slug FROM products WHERE id = ?", String.class, second);
		assertThat(firstSlug).startsWith("hat-dieu-rang-muoi-dac-biet-");
		assertThat(secondSlug).isEqualTo(firstSlug + "-2");

		mvc.perform(json(post("/api/admin/products"), productJson("Trùng slug", firstSlug, 99_000)).cookie(admin))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("SLUG_EXISTS"));
		mvc.perform(json(post("/api/admin/products"), productJson("Slug sai", "Có Dấu!", 99_000)).cookie(admin))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_SLUG"));

		mvc.perform(json(put("/api/admin/products/" + first), productJson("Hạt điều mới", firstSlug, 150_000)).cookie(admin))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.price").value(150_000))
			.andExpect(jsonPath("$.slug").value(firstSlug));
		assertThat(audits("PRODUCT_UPDATED", first)).isEqualTo(1);
		String after = jdbc.queryForObject(
				"SELECT after ->> 'price' FROM audit_logs WHERE action = 'PRODUCT_UPDATED' AND entity_id = ?",
				String.class, String.valueOf(first));
		assertThat(after).isEqualTo("150000");

		mvc.perform(json(patch("/api/admin/products/" + first + "/active"), "{\"active\":false}").cookie(admin))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.active").value(false));
		mvc.perform(get("/api/products?q=" + firstSlug)).andExpect(jsonPath("$.items[?(@.id == " + first + ")]").doesNotExist());
		assertThat(audits("PRODUCT_HIDDEN", first)).isEqualTo(1);
	}

	@Test
	void categoriesCanBeCreatedAndRenamed() throws Exception {
		Cookie admin = as("ADMIN");
		String suffix = UUID.randomUUID().toString().substring(0, 6);
		String response = mvc.perform(json(post("/api/admin/categories"), "{\"name\":\"Hạt Mới " + suffix + "\"}").cookie(admin))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.slug").value("hat-moi-" + suffix))
			.andReturn()
			.getResponse()
			.getContentAsString();
		long id = Long.parseLong(response.replaceAll("(?s).*?\"id\":(\\d+).*", "$1"));
		try {
			mvc.perform(json(put("/api/admin/categories/" + id), "{\"name\":\"Hạt Đổi Tên " + suffix + "\"}").cookie(admin))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.name").value("Hạt Đổi Tên " + suffix));
			mvc.perform(json(post("/api/admin/categories"), "{\"name\":\"Trùng\",\"slug\":\"hat-dinh-duong\"}").cookie(admin))
				.andExpect(status().isConflict());
		}
		finally {
			jdbc.update("DELETE FROM categories WHERE id = ?", id);
		}
	}

	@Test
	void imageUploadsChecksContentSizeAndCount() throws Exception {
		Cookie admin = as("ADMIN");
		long id = createProduct(admin, "Hạt có ảnh", null);

		// A text file renamed to .jpg with an image content type is still rejected
		var fake = new MockMultipartFile("file", "anh.jpg", "image/jpeg", "<?php echo 'hi'; ?>".getBytes());
		mvc.perform(multipart("/api/admin/products/" + id + "/images").file(fake)
			.header("X-Requested-With", "XMLHttpRequest")
			.cookie(admin)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_IMAGE"));
		verify(storage, never()).upload(any(), any());

		var big = new byte[5 * 1024 * 1024 + 1];
		System.arraycopy(PNG, 0, big, 0, PNG.length);
		mvc.perform(multipart("/api/admin/products/" + id + "/images")
			.file(new MockMultipartFile("file", "big.png", "image/png", big))
			.header("X-Requested-With", "XMLHttpRequest")
			.cookie(admin)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("IMAGE_TOO_LARGE"));

		for (int i = 0; i < 5; i++) {
			mvc.perform(multipart("/api/admin/products/" + id + "/images")
				.file(new MockMultipartFile("file", "a" + i + ".png", "image/png", PNG))
				.header("X-Requested-With", "XMLHttpRequest")
				.cookie(admin)).andExpect(status().isCreated()).andExpect(jsonPath("$.images", hasSize(i + 1)));
		}
		mvc.perform(multipart("/api/admin/products/" + id + "/images")
			.file(new MockMultipartFile("file", "a6.png", "image/png", PNG))
			.header("X-Requested-With", "XMLHttpRequest")
			.cookie(admin)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("TOO_MANY_IMAGES"));

		// First image is primary and becomes the product image; switching and deleting keep exactly one primary
		List<String> ids = jdbc.queryForList(
				"SELECT id::text FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, position", String.class, id);
		call(post("/api/admin/products/" + id + "/images/" + ids.get(2) + "/primary"), admin).andExpect(status().isOk())
			.andExpect(jsonPath("$.images[0].id").value(ids.get(2)))
			.andExpect(jsonPath("$.images[0].primary").value(true));
		call(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
			.delete("/api/admin/products/" + id + "/images/" + ids.get(2)), admin)
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.images", hasSize(4)))
			.andExpect(jsonPath("$.images[0].primary").value(true));
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM product_images WHERE product_id = ? AND is_primary",
				Integer.class, id)).isEqualTo(1);
		String primaryUrl = jdbc.queryForObject(
				"SELECT url FROM product_images WHERE product_id = ? AND is_primary", String.class, id);
		assertThat(jdbc.queryForObject("SELECT image_url FROM products WHERE id = ?", String.class, id))
			.isEqualTo(primaryUrl);
		verify(storage).delete(anyString());
		assertThat(ImageTypes.detect(PNG)).isPresent();
	}

	// ---- first admin ----------------------------------------------------------------------------------------

	@Test
	void adminEmailPromotesAnExistingAccountOnly() throws Exception {
		String email = "boss-" + UUID.randomUUID() + "@example.com";
		var tx = new org.springframework.transaction.support.TransactionTemplate(txManager);
		// Not registered yet: nothing is created
		tx.executeWithoutResult(s -> new AdminBootstrap(users, auditLog, email.toUpperCase()).run(null));
		assertThat(users.findByEmail(email)).isEmpty();

		mvc.perform(json(post("/api/auth/register"), RegisterJson.of("Chủ Shop", email, "matkhau123")))
			.andExpect(status().isCreated());
		tx.executeWithoutResult(s -> new AdminBootstrap(users, auditLog, " " + email.toUpperCase() + " ").run(null));
		var user = users.findByEmail(email).orElseThrow();
		assertThat(user.getRole()).isEqualTo(com.nutshop.user.Role.ADMIN);
		assertThat(audits("USER_PROMOTED", user.getId())).isEqualTo(1);
	}
}
