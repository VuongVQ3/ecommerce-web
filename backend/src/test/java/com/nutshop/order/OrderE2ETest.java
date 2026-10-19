package com.nutshop.order;

import com.nutshop.IntegrationTest;
import com.nutshop.auth.AuthCookies;
import com.nutshop.mail.EmailMessage;
import com.nutshop.security.RateLimiter;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import testsupport.CapturingEmailSender;
import testsupport.RegisterJson;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** COD orders against PostgreSQL. Each test creates its own products and removes them (and their orders) afterwards. */
@IntegrationTest
@Import(CapturingEmailSender.Config.class)
class OrderE2ETest {

	/** Thành phố Hà Nội → Phường Ba Đình (vn-admin-units.json). */
	private static final int HANOI = 1;
	private static final int BA_DINH = 4;
	private static final long FEE = 30_000;

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcTemplate jdbc;

	@Autowired
	CapturingEmailSender mailbox;

	@Autowired
	RateLimiter orderCreateRateLimiter;

	@Autowired
	RateLimiter orderLookupRateLimiter;

	@Autowired
	RateLimiter authRateLimiter;

	private final List<Long> createdProducts = new ArrayList<>();

	@BeforeEach
	void resetLimits() {
		orderCreateRateLimiter.reset();
		orderLookupRateLimiter.reset();
		authRateLimiter.reset();
		mailbox.clear();
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

	private long product(long price, int onHand) {
		Long id = jdbc.queryForObject("""
				INSERT INTO products (category_id, name, slug, description, price, weight_grams, on_hand, reserved, active,
				                      calories, protein, fat, carbs, fiber)
				VALUES ((SELECT id FROM categories WHERE slug = 'hat-dinh-duong'), ?, ?, 'Sản phẩm test', ?, 500, ?, 0, true,
				        500, 20, 40, 20, 10)
				RETURNING id""", Long.class, "Hạt đơn hàng " + price, "order-test-" + UUID.randomUUID(), price, onHand);
		createdProducts.add(id);
		return id;
	}

	private int reserved(long productId) {
		return jdbc.queryForObject("SELECT reserved FROM products WHERE id = ?", Integer.class, productId);
	}

	private static String body(String key, String phone, String items) {
		return """
				{"idempotencyKey":"%s","customerName":"Nguyễn Văn Khách","phone":"%s","email":"khach@example.com",
				 "provinceCode":%d,"wardCode":%d,"addressLine":"12 Phố Test","note":"Giao giờ hành chính",
				 "items":[%s]}""".formatted(key, phone, HANOI, BA_DINH, items);
	}

	private static String line(long productId, int quantity) {
		return "{\"productId\":" + productId + ",\"quantity\":" + quantity + "}";
	}

	private ResultActions place(String json, Cookie... cookies) throws Exception {
		MockHttpServletRequestBuilder request = post("/api/orders").header("X-Requested-With", "XMLHttpRequest")
			.contentType(MediaType.APPLICATION_JSON)
			.content(json);
		if (cookies.length > 0) {
			request.cookie(cookies);
		}
		return mvc.perform(request);
	}

	private static String key() {
		return "checkout-" + UUID.randomUUID();
	}

	private Cookie signUp() throws Exception {
		return mvc.perform(post("/api/auth/register").header("X-Requested-With", "XMLHttpRequest")
				.contentType(MediaType.APPLICATION_JSON)
				.content(RegisterJson.of("Người Mua", "order-" + UUID.randomUUID() + "@example.com", "matkhau123")))
			.andExpect(status().isCreated())
			.andReturn()
			.getResponse()
			.getCookie(AuthCookies.ACCESS_COOKIE);
	}

	// ---- tests ----------------------------------------------------------------------------------------------

	@Test
	void guestOrderIsPricedFromTheDatabaseIgnoringClientPrices() throws Exception {
		long id = product(120_000, 10);
		String json = body(key(), "0912 345 678", "{\"productId\":" + id + ",\"quantity\":2,\"price\":1,\"unitPrice\":1}")
			.replace("\"note\"", "\"subtotal\":1,\"total\":1,\"shippingFee\":0,\"note\"");

		place(json).andExpect(status().isCreated())
			.andExpect(jsonPath("$.code").value(matchesPattern("^HL\\d{6}[A-HJ-NP-Z2-9]{4}$")))
			.andExpect(jsonPath("$.status").value("PENDING"))
			.andExpect(jsonPath("$.statusLabel").value("Chờ xác nhận"))
			.andExpect(jsonPath("$.items[0].unitPrice").value(120_000))
			.andExpect(jsonPath("$.subtotal").value(240_000))
			.andExpect(jsonPath("$.shippingFee").value(FEE))
			.andExpect(jsonPath("$.total").value(240_000 + FEE))
			.andExpect(jsonPath("$.phone").value("0912345678"))
			.andExpect(jsonPath("$.province").value("Thành phố Hà Nội"))
			.andExpect(jsonPath("$.ward").value("Phường Ba Đình"))
			.andExpect(jsonPath("$.paymentMethod").value("COD"))
			.andExpect(jsonPath("$.history", hasSize(1)));

		assertThat(reserved(id)).isEqualTo(2);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM orders o JOIN order_items i ON i.order_id = o.id "
				+ "WHERE i.product_id = ? AND o.user_id IS NULL", Integer.class, id)).isEqualTo(1);
		assertThat(jdbc.queryForList("SELECT type || ':' || quantity FROM inventory_movements WHERE product_id = ?",
				String.class, id)).containsExactly("ORDER_RESERVE:2");
	}

	@Test
	void twoConcurrentOrdersForTheLastUnitOnlyOneWins() throws Exception {
		long id = product(90_000, 1);
		ExecutorService pool = Executors.newFixedThreadPool(2);
		CountDownLatch start = new CountDownLatch(1);
		List<Future<Integer>> results = new ArrayList<>();
		for (String phone : List.of("0911111111", "0922222222")) {
			results.add(pool.submit(() -> {
				start.await();
				return place(body(key(), phone, line(id, 1))).andReturn().getResponse().getStatus();
			}));
		}
		start.countDown();
		List<Integer> statuses = new ArrayList<>();
		for (Future<Integer> r : results) {
			statuses.add(r.get());
		}
		pool.shutdown();

		assertThat(statuses).containsExactlyInAnyOrder(201, 409);
		assertThat(reserved(id)).isEqualTo(1);
		// The loser sees what is left
		place(body(key(), "0933333333", line(id, 1))).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("OUT_OF_STOCK"))
			.andExpect(jsonPath("$.items[0].productId").value(id))
			.andExpect(jsonPath("$.items[0].requested").value(1))
			.andExpect(jsonPath("$.items[0].available").value(0));
	}

	@Test
	void resendingTheSameIdempotencyKeyReturnsTheSameOrder() throws Exception {
		long id = product(50_000, 20);
		String json = body(key(), "0912345678", line(id, 3));

		String first = place(json).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
		String code = first.replaceAll(".*\"code\":\"([A-Z0-9]+)\".*", "$1");
		place(json).andExpect(status().isOk()).andExpect(jsonPath("$.code").value(code));

		// Several at once with a fresh key: still exactly one order
		String parallelJson = body(key(), "0912345678", line(id, 1));
		ExecutorService pool = Executors.newFixedThreadPool(4);
		CountDownLatch start = new CountDownLatch(1);
		List<Future<String>> codes = new ArrayList<>();
		for (int i = 0; i < 4; i++) {
			codes.add(pool.submit(() -> {
				start.await();
				return place(parallelJson).andReturn().getResponse().getContentAsString()
					.replaceAll(".*\"code\":\"([A-Z0-9]+)\".*", "$1");
			}));
		}
		orderCreateRateLimiter.reset();
		start.countDown();
		Set<String> distinct = new HashSet<>();
		for (Future<String> c : codes) {
			distinct.add(c.get());
		}
		pool.shutdown();

		assertThat(distinct).hasSize(1);
		assertThat(reserved(id)).isEqualTo(3 + 1);
		assertThat(jdbc.queryForObject("SELECT count(DISTINCT order_id) FROM order_items WHERE product_id = ?",
				Integer.class, id)).isEqualTo(2);
	}

	@Test
	void reusingSomeoneElsesKeyWithAnotherPhoneIsRejected() throws Exception {
		long id = product(50_000, 20);
		String k = key();
		place(body(k, "0912345678", line(id, 1))).andExpect(status().isCreated());

		place(body(k, "0987654321", line(id, 1))).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("IDEMPOTENCY_CONFLICT"));
	}

	@Test
	void aShortageRollsBackTheWholeOrder() throws Exception {
		long plenty = product(40_000, 50);
		long scarce = product(60_000, 1);
		String k = key();

		place(body(k, "0912345678", line(plenty, 2) + "," + line(scarce, 2))).andExpect(status().isConflict())
			.andExpect(jsonPath("$.items", hasSize(1)))
			.andExpect(jsonPath("$.items[0].productId").value(scarce))
			.andExpect(jsonPath("$.items[0].available").value(1))
			.andExpect(jsonPath("$.message").value("Một số sản phẩm không còn đủ hàng"));

		assertThat(reserved(plenty)).isZero();
		assertThat(jdbc.queryForObject("SELECT count(*) FROM orders WHERE idempotency_key = ?", Integer.class, k)).isZero();
		assertThat(jdbc.queryForObject("SELECT count(*) FROM inventory_movements WHERE product_id IN (?, ?)",
				Integer.class, plenty, scarce)).isZero();
	}

	@Test
	void signedInOrderIsLinkedClearsTheCartAndCanBeCancelledWhilePending() throws Exception {
		long id = product(70_000, 10);
		Cookie session = signUp();
		mvc.perform(post("/api/cart/items").header("X-Requested-With", "XMLHttpRequest").cookie(session)
				.contentType(MediaType.APPLICATION_JSON).content(line(id, 2)))
			.andExpect(status().isOk());

		String code = place(body(key(), "0912345678", line(id, 2)), session).andExpect(status().isCreated())
			.andReturn().getResponse().getContentAsString().replaceAll(".*\"code\":\"([A-Z0-9]+)\".*", "$1");

		mvc.perform(get("/api/cart").cookie(session)).andExpect(jsonPath("$.items", hasSize(0)));
		mvc.perform(get("/api/orders/me").cookie(session))
			.andExpect(jsonPath("$.items", hasSize(1)))
			.andExpect(jsonPath("$.items[0].code").value(code))
			.andExpect(jsonPath("$.items[0].itemCount").value(2));
		mvc.perform(get("/api/orders/me/" + code).cookie(session)).andExpect(jsonPath("$.canCancel").value(true));
		// Another account cannot see it
		mvc.perform(get("/api/orders/me/" + code).cookie(signUp())).andExpect(status().isNotFound());

		// A customer reason is required; staff-only codes and OTHER without a note are rejected
		for (String bad : new String[] { "", "{}", "{\"reasonCode\":\"NOPE\"}", "{\"reasonCode\":\"OUT_OF_STOCK\"}" }) {
			mvc.perform(cancelMine(code, bad).cookie(session))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_CANCEL_REASON"));
		}
		mvc.perform(cancelMine(code, "{\"reasonCode\":\"OTHER\",\"reason\":\"   \"}").cookie(session))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("CANCEL_REASON_REQUIRED"));
		mvc.perform(cancelMine(code, "{\"reasonCode\":\"CHANGED_MIND\",\"reason\":\"" + "x".repeat(301) + "\"}").cookie(session))
			.andExpect(status().isBadRequest());
		assertThat(reserved(id)).isEqualTo(2);

		mvc.perform(cancelMine(code, "{\"reasonCode\":\"CHANGE_ADDRESS\",\"reason\":\"  Chuyển nhà  \"}").cookie(session))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("CANCELLED"))
			.andExpect(jsonPath("$.canCancel").value(false))
			.andExpect(jsonPath("$.history", hasSize(2)))
			.andExpect(jsonPath("$.history[1].reason").value("Khách huỷ: Muốn đổi địa chỉ giao hàng – Chuyển nhà"))
			.andExpect(jsonPath("$.cancelReasonCode").value("CHANGE_ADDRESS"))
			.andExpect(jsonPath("$.cancelReasonLabel").value("Muốn đổi địa chỉ giao hàng"))
			.andExpect(jsonPath("$.cancelReason").value("Chuyển nhà"))
			.andExpect(jsonPath("$.cancelledByType").value("CUSTOMER"));
		Map<String, Object> audit = jdbc.queryForMap(
				"SELECT actor_id, actor_type, reason_code, reason, entity_label FROM audit_logs WHERE action = 'ORDER_CANCEL' AND entity_id = ?",
				code);
		assertThat(audit).containsEntry("actor_id", null).containsEntry("actor_type", "CUSTOMER")
			.containsEntry("reason_code", "CHANGE_ADDRESS").containsEntry("reason", "Chuyển nhà")
			.containsEntry("entity_label", code);

		assertThat(reserved(id)).isZero();
		assertThat(jdbc.queryForList("SELECT type || ':' || quantity FROM inventory_movements WHERE product_id = ? "
				+ "ORDER BY created_at", String.class, id)).containsExactly("ORDER_RESERVE:2", "ORDER_CANCEL:-2");

		mvc.perform(cancelMine(code, "{\"reasonCode\":\"CHANGED_MIND\"}").cookie(session))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("ORDER_NOT_CANCELLABLE"));
	}

	private static MockHttpServletRequestBuilder cancelMine(String code, String body) {
		return post("/api/orders/me/" + code + "/cancel").header("X-Requested-With", "XMLHttpRequest")
			.contentType(MediaType.APPLICATION_JSON)
			.content(body);
	}

	@Test
	void guestLookupNeedsTheMatchingPhoneAndGivesOneErrorForAnyMismatch() throws Exception {
		long id = product(30_000, 10);
		String code = place(body(key(), "0912345678", line(id, 1))).andReturn().getResponse().getContentAsString()
			.replaceAll(".*\"code\":\"([A-Z0-9]+)\".*", "$1");

		lookup(code.toLowerCase(), "+84 912.345.678").andExpect(status().isOk())
			.andExpect(jsonPath("$.code").value(code))
			.andExpect(jsonPath("$.token").isString());

		String wrongPhone = lookup(code, "0999999999").andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
		String wrongCode = lookup("HL000000AAAA", "0912345678").andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
		String badPhone = lookup(code, "12345").andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
		assertThat(wrongPhone).isEqualTo(wrongCode.replace("HL000000AAAA", code)).isEqualTo(badPhone)
			.contains(OrderService.NOT_FOUND_MESSAGE);
		// The old GET (phone in the URL) is gone: 405, not a sign-in prompt
		mvc.perform(get("/api/orders/lookup").param("code", code).param("phone", "0912345678"))
			.andExpect(status().isMethodNotAllowed());

		// 10 lookups per IP per window: this test has made 4 (the GET is not counted)
		for (int i = 0; i < 6; i++) {
			lookup(code, "0999999999").andExpect(status().isNotFound());
		}
		lookup(code, "0912345678").andExpect(status().isTooManyRequests());
	}

	private org.springframework.test.web.servlet.ResultActions lookup(String code, String phone) throws Exception {
		return mvc.perform(post("/api/orders/lookup").header("X-Requested-With", "XMLHttpRequest")
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"code\":\"%s\",\"phone\":\"%s\"}".formatted(code, phone)));
	}

	@Test
	void validatesCustomerAddressAndQuantities() throws Exception {
		long id = product(30_000, 50);

		place(body(key(), "12345", line(id, 1)).replace("Nguyễn Văn Khách", "A")).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors.phone").value("Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0"))
			.andExpect(jsonPath("$.errors.customerName").value("Họ tên không hợp lệ"));
		place(body(key(), "0912345678", line(id, 1)).replace("\"wardCode\":" + BA_DINH, "\"wardCode\":99999999"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_ADDRESS"));
		place(body(key(), "0912345678", line(id, 11))).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("QUANTITY_TOO_LARGE"));
		place(body(key(), "0912345678", "")).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors.items").exists());
		assertThat(reserved(id)).isZero();
	}

	@Test
	void sendsAConfirmationEmailAfterCommit() throws Exception {
		long id = product(200_000, 10);
		String code = place(body(key(), "0912345678", line(id, 3))).andExpect(status().isCreated())
			.andReturn().getResponse().getContentAsString().replaceAll(".*\"code\":\"([A-Z0-9]+)\".*", "$1");

		EmailMessage mail = mailbox.next(Duration.ofSeconds(5));
		assertThat(mail).isNotNull();
		assertThat(mail.to()).isEqualTo("khach@example.com");
		assertThat(mail.subject()).contains(code);
		assertThat(mail.text()).contains("600.000₫").contains("Phường Ba Đình");
	}

	@Test
	void ordersAreRateLimitedPerIp() throws Exception {
		long id = product(10_000, 99);
		for (int i = 0; i < 5; i++) {
			place(body(key(), "0912345678", line(id, 1))).andExpect(status().isCreated());
		}
		place(body(key(), "0912345678", line(id, 1))).andExpect(status().isTooManyRequests());
	}
}
