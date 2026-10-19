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
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
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
		call(get("/api/admin/dashboard/now"), customer).andExpect(status().isForbidden());
		call(get("/api/admin/dashboard/day"), customer).andExpect(status().isForbidden());
		call(get("/api/admin/products"), customer).andExpect(status().isForbidden());
	}

	@Test
	void staffHandlesOrdersAndStockButCannotEditCatalogue() throws Exception {
		Cookie admin = as("ADMIN");
		Cookie staff = as("STAFF");
		long id = createProduct(admin, "Hạt quyền nhân viên", null);

		call(get("/api/admin/orders"), staff).andExpect(status().isOk()).andExpect(jsonPath("$.pendingCount").isNumber());
		call(get("/api/admin/dashboard/now"), staff).andExpect(status().isOk())
			.andExpect(jsonPath("$.pendingCount").isNumber());
		call(get("/api/admin/dashboard/day"), staff).andExpect(status().isOk())
			.andExpect(jsonPath("$.last7Days", hasSize(7)));
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

	/** Real-catalogue rules: no showing without a price, nutrition all or nothing, "Chưa sẵn sàng" list. */
	@Test
	void aProductWithoutAPriceStaysHiddenUntilPriced() throws Exception {
		Cookie admin = as("ADMIN");
		String draft = """
				{"name":"Mật ong thử","categoryId":1,"description":"Mô tả","weightGrams":500,"lowStockThreshold":5}""";
		String created = mvc.perform(json(post("/api/admin/products"), draft).cookie(admin))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.price").value(0))
			.andExpect(jsonPath("$.active").value(false))
			.andExpect(jsonPath("$.calories").isEmpty())
			.andReturn()
			.getResponse()
			.getContentAsString();
		long id = Long.parseLong(created.replaceAll("(?s).*?\"id\":(\\d+).*", "$1"));
		createdProducts.add(id);
		String slug = created.replaceAll("(?s).*?\"slug\":\"([^\"]+)\".*", "$1");

		mvc.perform(json(patch("/api/admin/products/" + id + "/active"), "{\"active\":true}").cookie(admin))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("PRICE_REQUIRED"))
			.andExpect(jsonPath("$.detail").value("Nhập giá bán trước khi hiện sản phẩm"));
		call(get("/api/admin/products").param("notReady", "true").param("size", "100"), admin)
			.andExpect(jsonPath("$.items[*].id", hasItem((int) id)));

		// Half a nutrition table is refused; all five or none
		mvc.perform(json(put("/api/admin/products/" + id),
				draft.replace("\"weightGrams\"", "\"price\":150000,\"protein\":20,\"weightGrams\"")).cookie(admin))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("NUTRITION_INCOMPLETE"));
		mvc.perform(json(put("/api/admin/products/" + id), draft.replace("\"weightGrams\"", "\"price\":150000,\"weightGrams\""))
			.cookie(admin)).andExpect(status().isOk()).andExpect(jsonPath("$.price").value(150000));

		mvc.perform(json(patch("/api/admin/products/" + id + "/active"), "{\"active\":true}").cookie(admin))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.active").value(true));
		mvc.perform(get("/api/products/" + slug))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.nutritionPer100g").isEmpty());
		// Once on sale its price cannot be removed
		mvc.perform(json(put("/api/admin/products/" + id), draft).cookie(admin))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("PRICE_REQUIRED"));
	}

	/** The list loads with products that have no price, no stock and no nutrition (the V17 drafts), on every tab. */
	@Test
	void productListWorksWithUnpricedProductsWithoutNutrition() throws Exception {
		Cookie admin = as("ADMIN");
		long draft = jdbc.queryForObject("""
				INSERT INTO products (category_id, name, slug, description, price, weight_grams, on_hand, reserved, active,
				                      calories, protein, fat, carbs, fiber, sort_order)
				VALUES (1, 'Nháp chưa giá', ?, 'Mô tả', 0, 500, 0, 0, false, NULL, NULL, NULL, NULL, NULL, 7)
				RETURNING id""", Long.class, "nhap-" + UUID.randomUUID());
		createdProducts.add(draft);
		long noStock = createProduct(admin, "Có giá chưa hàng", null);
		long ready = createProduct(admin, "Có giá có hàng", null);
		importStock(admin, ready, 5);

		call(get("/api/admin/products").param("size", "100"), admin).andExpect(status().isOk())
			.andExpect(jsonPath("$.items[*].id", hasItem((int) draft)));
		call(get("/api/admin/products").param("active", "false").param("size", "100"), admin).andExpect(status().isOk())
			.andExpect(jsonPath("$.items[*].id", hasItem((int) draft)));
		call(get("/api/admin/products").param("active", "true").param("size", "100"), admin).andExpect(status().isOk())
			.andExpect(jsonPath("$.items[*].id", org.hamcrest.Matchers.not(hasItem((int) draft))));
		call(get("/api/admin/products").param("q", "Nháp chưa").param("size", "100"), admin).andExpect(status().isOk())
			.andExpect(jsonPath("$.items[0].price").value(0))
			.andExpect(jsonPath("$.items[0].sortOrder").value(7));
		// "Chưa sẵn sàng": no price or no stock
		call(get("/api/admin/products").param("notReady", "true").param("size", "100"), admin).andExpect(status().isOk())
			.andExpect(jsonPath("$.items[*].id", hasItem((int) draft)))
			.andExpect(jsonPath("$.items[*].id", hasItem((int) noStock)))
			.andExpect(jsonPath("$.items[*].id", org.hamcrest.Matchers.not(hasItem((int) ready))));
		call(get("/api/admin/products/" + draft), admin).andExpect(status().isOk())
			.andExpect(jsonPath("$.calories").isEmpty())
			.andExpect(jsonPath("$.sortOrder").value(7));
	}

	/** An order placed while signed in shows whose account it went to; a staff account stands out. */
	@Test
	void orderDetailShowsTheAccountThatPlacedIt() throws Exception {
		Cookie admin = as("ADMIN");
		Cookie staff = as("STAFF");
		long id = createProduct(admin, "Hạt đặt bằng tài khoản", null);
		importStock(admin, id, 5);
		String body = """
				{"idempotencyKey":"admin-%s","customerName":"Khách Test","phone":"0912345678",
				 "provinceCode":1,"wardCode":4,"addressLine":"1 Phố Test","items":[{"productId":%d,"quantity":1}]}"""
			.formatted(UUID.randomUUID(), id);
		orderCreateRateLimiter.reset();
		String code = mvc.perform(json(post("/api/orders"), body).cookie(staff))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.accessToken").doesNotExist())
			.andReturn()
			.getResponse()
			.getContentAsString()
			.replaceAll("(?s).*?\"code\":\"([A-Z0-9]+)\".*", "$1");
		String staffId = jdbc.queryForObject("SELECT user_id::text FROM orders WHERE code = ?", String.class, code);
		assertThat(staffId).isNotNull();

		call(get("/api/admin/orders/" + code), admin).andExpect(status().isOk())
			.andExpect(jsonPath("$.guest").value(false))
			.andExpect(jsonPath("$.account.id").value(staffId))
			.andExpect(jsonPath("$.account.fullName").value("Nhân Viên STAFF"))
			.andExpect(jsonPath("$.account.email", org.hamcrest.Matchers.startsWith("staff-")))
			.andExpect(jsonPath("$.account.role").value("STAFF"))
			.andExpect(jsonPath("$.accountDeleted").value(false));
	}

	// ---- dashboard ------------------------------------------------------------------------------------------

	/** Moves an order (and its status history) back in time; the history row for toStatus gets its own time. */
	private void backdate(String code, Instant createdAt, String toStatus, Instant changedAt) {
		jdbc.update("UPDATE orders SET created_at = ? WHERE code = ?", java.sql.Timestamp.from(createdAt), code);
		jdbc.update("""
				UPDATE order_status_history SET created_at = CASE WHEN to_status = ? THEN ?::timestamptz ELSE ?::timestamptz END
				WHERE order_id = (SELECT id FROM orders WHERE code = ?)""", toStatus,
				java.sql.Timestamp.from(changedAt == null ? createdAt : changedAt), java.sql.Timestamp.from(createdAt),
				code);
	}

	private long total(String code) {
		return jdbc.queryForObject("SELECT total FROM orders WHERE code = ?", Long.class, code);
	}

	@Test
	void dashboardDaysFollowVietnamTime() throws Exception {
		Cookie admin = as("ADMIN");
		long id = createProduct(admin, "Hạt tổng quan ngày", null);
		importStock(admin, id, 20);
		LocalDate today = LocalDate.now(ZoneId.of("Asia/Ho_Chi_Minh"));
		LocalDate day = today.minusDays(100);
		Instant lateEvening = day.atTime(16, 30).toInstant(ZoneOffset.UTC); // 23:30 that day in Vietnam
		Instant nextMorning = day.plusDays(1).atTime(3, 0).toInstant(ZoneOffset.UTC); // 10:00 the next day

		// Ordered at 23:30, delivered the next morning
		String delivered = placeOrder(id, 2);
		mvc.perform(json(post("/api/admin/orders/" + delivered + "/confirm"), "{\"contact\":\"CALLED\"}").cookie(admin))
			.andExpect(status().isOk());
		mvc.perform(json(post("/api/admin/orders/" + delivered + "/ship"), "{\"carrier\":\"GHN\",\"trackingNumber\":\"D1\"}")
			.cookie(admin)).andExpect(status().isOk());
		call(post("/api/admin/orders/" + delivered + "/complete"), admin).andExpect(status().isOk());
		backdate(delivered, lateEvening, "COMPLETED", nextMorning);
		// Ordered and cancelled the same morning
		String cancelled = placeOrder(id, 1);
		mvc.perform(json(post("/api/admin/orders/" + cancelled + "/cancel"), "{\"reasonCode\":\"OUT_OF_STOCK\",\"reason\":\"Hết\"}")
			.cookie(admin)).andExpect(status().isOk());
		backdate(cancelled, day.atTime(2, 0).toInstant(ZoneOffset.UTC), "CANCELLED", day.atTime(5, 0).toInstant(ZoneOffset.UTC));
		mailbox.clear();

		call(get("/api/admin/dashboard/day").param("date", day.toString()), admin).andExpect(status().isOk())
			.andExpect(jsonPath("$.date").value(day.toString()))
			.andExpect(jsonPath("$.ordersCreated").value(2))
			// the cancelled order is not part of the value ordered
			.andExpect(jsonPath("$.grossValue").value(total(delivered)))
			// revenue goes to the day it was completed
			.andExpect(jsonPath("$.revenue").value(0))
			.andExpect(jsonPath("$.cancelled").value(1))
			.andExpect(jsonPath("$.topCancelReason").value("Hết hàng"))
			.andExpect(jsonPath("$.topProducts", hasSize(1)))
			.andExpect(jsonPath("$.topProducts[0].quantity").value(2))
			.andExpect(jsonPath("$.orders", hasSize(2)))
			.andExpect(jsonPath("$.orders[0].code").value(delivered))
			.andExpect(jsonPath("$.last7Days", hasSize(7)))
			.andExpect(jsonPath("$.last7Days[6].date").value(day.toString()));
		call(get("/api/admin/dashboard/day").param("date", day.plusDays(1).toString()), admin).andExpect(status().isOk())
			.andExpect(jsonPath("$.ordersCreated").value(0))
			.andExpect(jsonPath("$.revenue").value(total(delivered)))
			.andExpect(jsonPath("$.previous.ordersCreated").value(2))
			.andExpect(jsonPath("$.previous.cancelled").value(1))
			.andExpect(jsonPath("$.orders", hasSize(0)))
			.andExpect(jsonPath("$.last7Days[6].revenue").value(total(delivered)))
			.andExpect(jsonPath("$.last7Days[6].orders").value(1));

		call(get("/api/admin/dashboard/day").param("date", today.plusDays(1).toString()), admin)
			.andExpect(status().isBadRequest());
		call(get("/api/admin/dashboard/day").param("date", today.minusDays(366).toString()), admin)
			.andExpect(status().isBadRequest());
		call(get("/api/admin/dashboard/day").param("date", today.minusDays(365).toString()), admin)
			.andExpect(status().isOk());

		// Waiting more than 24 hours
		String waiting = placeOrder(id, 1);
		jdbc.update("UPDATE orders SET created_at = now() - interval '25 hours' WHERE code = ?", waiting);
		call(get("/api/admin/dashboard/now"), admin).andExpect(status().isOk())
			.andExpect(jsonPath("$.pendingOver24h").value(org.hamcrest.Matchers.greaterThanOrEqualTo(1)))
			.andExpect(jsonPath("$.lowStockCount").isNumber());
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
			.andExpect(jsonPath("$.guest").value(true))
			.andExpect(jsonPath("$.account").doesNotExist())
			.andExpect(jsonPath("$.accountDeleted").value(false));
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
		assertThat(jdbc.queryForMap("SELECT cancel_reason, cancelled_by_type FROM orders WHERE code = ?", code))
			.containsEntry("cancel_reason", "Hết hàng tại kho").containsEntry("cancelled_by_type", "STAFF");
		assertThat(jdbc.queryForMap("SELECT actor_type, reason_code, reason FROM audit_logs WHERE action = 'ORDER_CANCEL' AND entity_id = ?", code))
			.containsEntry("actor_type", "STAFF").containsEntry("reason_code", "OUT_OF_STOCK")
			.containsEntry("reason", "Hết hàng tại kho");
		mvc.perform(get("/api/admin/orders/" + code).cookie(staff))
			.andExpect(jsonPath("$.order.cancelReasonCode").value("OUT_OF_STOCK"))
			.andExpect(jsonPath("$.order.cancelledByType").value("STAFF"));
		mvc.perform(get("/api/admin/orders").param("cancelReasonCode", "OUT_OF_STOCK").param("q", code).cookie(staff))
			.andExpect(jsonPath("$.page.items[0].code").value(code));
		mvc.perform(get("/api/admin/orders").param("cancelReasonCode", "CHANGED_MIND").param("q", code).cookie(staff))
			.andExpect(jsonPath("$.page.items").isEmpty());

		// Customer-only reasons are not for staff
		String other = placeOrder(id, 1);
		mvc.perform(json(post("/api/admin/orders/" + other + "/cancel"), "{\"reasonCode\":\"CHANGED_MIND\",\"reason\":\"x\"}")
			.cookie(staff)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_CANCEL_REASON"));
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
		Map<String, Object> change = jdbc.queryForMap(
				"SELECT before::text AS b, after::text AS a, entity_label FROM audit_logs WHERE action = 'PRODUCT_UPDATED' AND entity_id = ?",
				String.valueOf(first));
		// Only what changed (name and price), under the new name
		assertThat(change.get("a").toString()).contains("\"price\": 150000").contains("\"name\": \"Hạt điều mới\"")
			.doesNotContain("weightGrams").doesNotContain("description");
		assertThat(change.get("b").toString()).doesNotContain("weightGrams");
		assertThat(change.get("entity_label")).isEqualTo("Hạt điều mới");
		// Saving without changes writes nothing
		mvc.perform(json(put("/api/admin/products/" + first), productJson("Hạt điều mới", firstSlug, 150_000)).cookie(admin))
			.andExpect(status().isOk());
		assertThat(audits("PRODUCT_UPDATED", first)).isEqualTo(1);

		mvc.perform(json(patch("/api/admin/products/" + first + "/active"), "{\"active\":false}").cookie(admin))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.active").value(false));
		mvc.perform(get("/api/products?q=" + firstSlug)).andExpect(jsonPath("$.items[?(@.id == " + first + ")]").doesNotExist());
		assertThat(audits("PRODUCT_HIDDEN", first)).isEqualTo(1);
	}

	@Test
	void renamedProductsRedirectFromTheirOldSlug() throws Exception {
		Cookie admin = as("ADMIN");
		long id = createProduct(admin, "Hạt đổi tên", "hat-doi-ten-" + uploads.incrementAndGet());
		String old = jdbc.queryForObject("SELECT slug FROM products WHERE id = ?", String.class, id);
		mvc.perform(json(put("/api/admin/products/" + id), productJson("Hạt đổi tên", old + "-moi", 99_000)).cookie(admin))
			.andExpect(status().isOk());

		mvc.perform(get("/san-pham/" + old).queryParam("utm_source", "fb"))
			.andExpect(status().isMovedPermanently())
			.andExpect(header().string("Location", "/san-pham/" + old + "-moi?utm_source=fb"));
		mvc.perform(get("/api/products/" + old))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.id").value(id))
			.andExpect(jsonPath("$.redirectTo").value(old + "-moi"));
		mvc.perform(get("/api/products/" + old + "-moi")).andExpect(jsonPath("$.redirectTo").doesNotExist());

		// Another product cannot take the old address; the product itself can take it back
		long other = createProduct(admin, "Hạt khác", null);
		mvc.perform(json(put("/api/admin/products/" + other), productJson("Hạt khác", old, 99_000)).cookie(admin))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("SLUG_EXISTS"));
		mvc.perform(json(put("/api/admin/products/" + id), productJson("Hạt đổi tên", old, 99_000)).cookie(admin))
			.andExpect(status().isOk());
		mvc.perform(get("/san-pham/" + old)).andExpect(status().isOk());
		mvc.perform(get("/san-pham/" + old + "-moi")).andExpect(status().isMovedPermanently());
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
