package com.nutshop.order;

import com.nutshop.IntegrationTest;
import com.nutshop.auth.AuthCookies;
import com.nutshop.common.SecureTokens;
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
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import testsupport.CapturingEmailSender;
import testsupport.RegisterJson;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Guest tracking links, cancelling through them, creating an account from an order and attaching orders. */
@IntegrationTest
@Import(CapturingEmailSender.Config.class)
class OrderTrackingE2ETest {

	private static final Pattern TOKEN_IN_LINK = Pattern.compile("[?&](?:t|token)=([A-Za-z0-9_-]{43})");

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcTemplate jdbc;

	@Autowired
	CapturingEmailSender mailbox;

	@Autowired
	List<RateLimiter> limiters;

	private final List<Long> createdProducts = new ArrayList<>();
	private final List<String> emails = new ArrayList<>();

	@BeforeEach
	void reset() {
		limiters.forEach(RateLimiter::reset);
		mailbox.clear();
	}

	@AfterEach
	void cleanUp() {
		for (Long id : createdProducts) {
			jdbc.update("DELETE FROM orders WHERE id IN (SELECT order_id FROM order_items WHERE product_id = ?)", id);
			jdbc.update("DELETE FROM inventory_movements WHERE product_id = ?", id);
			jdbc.update("DELETE FROM products WHERE id = ?", id);
		}
		for (String email : emails) {
			jdbc.update("DELETE FROM users WHERE email = ?", email);
		}
	}

	// ---- helpers --------------------------------------------------------------------------------------------

	private long product() {
		Long id = jdbc.queryForObject("""
				INSERT INTO products (category_id, name, slug, description, price, weight_grams, on_hand, reserved, active,
				                      calories, protein, fat, carbs, fiber)
				VALUES (1, 'Hạt theo dõi', ?, 'Sản phẩm test', 100000, 500, 20, 0, true, 500, 20, 40, 20, 10)
				RETURNING id""", Long.class, "track-test-" + UUID.randomUUID());
		createdProducts.add(id);
		return id;
	}

	private String email() {
		String email = "track-" + UUID.randomUUID() + "@example.com";
		emails.add(email);
		return email;
	}

	private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder request, String body) {
		return request.header("X-Requested-With", "XMLHttpRequest").contentType(MediaType.APPLICATION_JSON).content(body);
	}

	private static String orderJson(String key, String email, long productId, int qty) {
		return """
				{"idempotencyKey":"%s","customerName":"Nguyễn Khách","phone":"0912345678",%s
				 "provinceCode":1,"wardCode":4,"addressLine":"12 Phố Test","items":[{"productId":%d,"quantity":%d}]}"""
			.formatted(key, email == null ? "" : "\"email\":\"" + email + "\",", productId, qty);
	}

	private ResultActions place(String body, Cookie... cookies) throws Exception {
		var request = json(post("/api/orders"), body);
		if (cookies.length > 0) {
			request.cookie(cookies);
		}
		return mvc.perform(request);
	}

	/** Places a guest order and returns {code, token}. */
	private String[] guestOrder(long productId, String email) throws Exception {
		String body = place(orderJson("trk-" + UUID.randomUUID(), email, productId, 2)).andExpect(status().isCreated())
			.andReturn()
			.getResponse()
			.getContentAsString();
		return new String[] { field(body, "code"), field(body, "accessToken") };
	}

	private static String field(String json, String name) {
		Matcher m = Pattern.compile("\"" + name + "\":\"([^\"]*)\"").matcher(json);
		return m.find() ? m.group(1) : null;
	}

	private ResultActions track(String code, String token) throws Exception {
		return mvc.perform(get("/api/orders/track/" + code).param("t", token));
	}

	private Cookie register(String email) throws Exception {
		return mvc.perform(json(post("/api/auth/register"), RegisterJson.of("Người Mua", email, "matkhau123")))
			.andExpect(status().isCreated())
			.andReturn()
			.getResponse()
			.getCookie(AuthCookies.ACCESS_COOKIE);
	}

	private int[] stock(long productId) {
		return jdbc.queryForObject("SELECT on_hand, reserved FROM products WHERE id = ?",
				(rs, n) -> new int[] { rs.getInt(1), rs.getInt(2) }, productId);
	}

	/** Waits for the next email to this address (others are skipped). */
	private EmailMessage mailTo(String to) throws InterruptedException {
		for (int i = 0; i < 10; i++) {
			EmailMessage m = mailbox.next(Duration.ofSeconds(5));
			if (m == null) {
				return null;
			}
			if (m.to().equals(to)) {
				return m;
			}
		}
		return null;
	}

	private static String tokenIn(EmailMessage mail) {
		Matcher m = TOKEN_IN_LINK.matcher(mail.text());
		assertThat(m.find()).as("link with a token in: " + mail.text()).isTrue();
		return m.group(1);
	}

	// ---- tracking -------------------------------------------------------------------------------------------

	@Test
	void guestOrderGetsATrackingLinkOnceAndOnlyItsHashIsStored() throws Exception {
		long id = product();
		String body = place(orderJson("trk-" + UUID.randomUUID(), null, id, 1)).andExpect(status().isCreated())
			.andExpect(jsonPath("$.accessToken").isString())
			.andExpect(jsonPath("$.trackingUrl", containsString("/don-hang/")))
			.andReturn()
			.getResponse()
			.getContentAsString();
		String code = field(body, "code");
		String token = field(body, "accessToken");
		assertThat(field(body, "trackingUrl")).isEqualTo("http://localhost:8080/don-hang/" + code + "?t=" + token);

		String orderId = jdbc.queryForObject("SELECT id::text FROM orders WHERE code = ?", String.class, code);
		assertThat(jdbc.queryForList("SELECT token_hash FROM order_access_tokens WHERE order_id = ?::uuid", String.class, orderId))
			.containsExactly(SecureTokens.hash(token));
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM order_access_tokens WHERE token_hash = ?", Integer.class, token))
			.isZero();

		track(code, token).andExpect(status().isOk())
			.andExpect(header().string("Cache-Control", containsString("no-store")))
			.andExpect(header().string("Referrer-Policy", "no-referrer"))
			.andExpect(jsonPath("$.code").value(code))
			.andExpect(jsonPath("$.maskedPhone").value("09******78"))
			.andExpect(jsonPath("$.addressLine").value("12 Phố Test"))
			.andExpect(jsonPath("$.canCancel").value(true))
			.andExpect(jsonPath("$.canClaim").value(true))
			.andExpect(jsonPath("$.hasEmail").value(false))
			.andExpect(jsonPath("$.history[0].status").value("PENDING"))
			.andExpect(jsonPath("$.accessToken").doesNotExist());

		// The token is never shown again: a lookup hands out a different one
		lookup(code, "0912345678").andExpect(status().isOk())
			.andExpect(jsonPath("$.accessToken").doesNotExist())
			.andExpect(jsonPath("$.token").value(org.hamcrest.Matchers.not(token)));
	}

	private ResultActions lookup(String code, String phone) throws Exception {
		return mvc.perform(json(post("/api/orders/lookup"), "{\"code\":\"%s\",\"phone\":\"%s\"}".formatted(code, phone)));
	}

	private String orderId(String code) {
		return jdbc.queryForObject("SELECT id::text FROM orders WHERE code = ?", String.class, code);
	}

	@Test
	void lookupHandsOutAShortLivedLinkThatCancels() throws Exception {
		long id = product();
		String[] order = guestOrder(id, null);
		assertThat(stock(id)).containsExactly(20, 2);

		String body = lookup(order[0], "0912345678").andExpect(status().isOk())
			.andExpect(header().string("Cache-Control", containsString("no-store")))
			.andExpect(header().string("Referrer-Policy", "no-referrer"))
			.andReturn()
			.getResponse()
			.getContentAsString();
		// Only the code and a token: nothing personal
		assertThat(body).isEqualTo("{\"code\":\"%s\",\"token\":\"%s\"}".formatted(order[0], field(body, "token")))
			.doesNotContain("0912345678", "12 Phố Test", "Nguyễn");
		String token = field(body, "token");
		assertThat(token).isNotEqualTo(order[1]);

		// 24 hours for the lookup link, 180 days for the one from checkout
		assertThat(jdbc.queryForObject("""
				SELECT COUNT(*) FROM order_access_tokens WHERE order_id = ?::uuid AND token_hash = ?
				AND expires_at BETWEEN now() + interval '23 hours' AND now() + interval '25 hours'""", Integer.class,
				orderId(order[0]), SecureTokens.hash(token))).isOne();
		assertThat(jdbc.queryForObject("""
				SELECT COUNT(*) FROM order_access_tokens WHERE token_hash = ?
				AND expires_at > now() + interval '179 days'""", Integer.class, SecureTokens.hash(order[1]))).isOne();

		track(order[0], token).andExpect(status().isOk())
			.andExpect(jsonPath("$.maskedPhone").value("09******78"))
			.andExpect(jsonPath("$.canCancel").value(true));
		mvc.perform(json(post("/api/orders/track/" + order[0] + "/cancel").param("t", token), "{\"reasonCode\":\"CHANGED_MIND\"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("CANCELLED"));
		assertThat(stock(id)).containsExactly(20, 0);
	}

	@Test
	void lookupLinkExpiresAfterADayWithoutTouchingTheEmailLink() throws Exception {
		String[] order = guestOrder(product(), null);
		String token = field(lookup(order[0], "0912345678").andReturn().getResponse().getContentAsString(), "token");
		track(order[0], token).andExpect(status().isOk());

		jdbc.update("UPDATE order_access_tokens SET expires_at = now() - interval '1 minute' WHERE token_hash = ?",
				SecureTokens.hash(token));
		track(order[0], token).andExpect(status().isNotFound());
		track(order[0], order[1]).andExpect(status().isOk());

		// The next lookup clears the expired link instead of piling up rows
		String again = field(lookup(order[0], "0912345678").andReturn().getResponse().getContentAsString(), "token");
		assertThat(jdbc.queryForList("SELECT token_hash FROM order_access_tokens WHERE order_id = ?::uuid", String.class,
				orderId(order[0]))).containsExactlyInAnyOrder(SecureTokens.hash(order[1]), SecureTokens.hash(again));
	}

	@Test
	void anAccountsOrderIsNotOpenedByLookup() throws Exception {
		String email = email();
		Cookie me = register(email);
		String code = field(place(orderJson("trk-" + UUID.randomUUID(), null, product(), 1), me).andExpect(status().isCreated())
			.andReturn()
			.getResponse()
			.getContentAsString(), "code");

		String body = lookup(code, "0912345678").andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("ORDER_BELONGS_TO_ACCOUNT"))
			.andExpect(jsonPath("$.token").doesNotExist())
			.andReturn()
			.getResponse()
			.getContentAsString();
		assertThat(body).doesNotContain("0912345678", "12 Phố Test");
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM order_access_tokens WHERE order_id = ?::uuid", Integer.class,
				orderId(code))).isZero();
		// Wrong phone: the usual 404, the account is not revealed
		lookup(code, "0999999999").andExpect(status().isNotFound());
	}

	@Test
	void wrongExpiredOrUnknownAllGiveTheSame404() throws Exception {
		String[] order = guestOrder(product(), null);
		String expected = track(order[0], order[1]).andReturn().getResponse().getContentAsString();
		assertThat(expected).contains(order[0]);

		String wrong = track(order[0], SecureTokens.generate()).andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
		String unknown = track("HL000000ZZZZ", order[1]).andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
		String empty = mvc.perform(get("/api/orders/track/" + order[0])).andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
		jdbc.update("UPDATE order_access_tokens SET expires_at = now() - interval '1 day' WHERE token_hash = ?",
				SecureTokens.hash(order[1]));
		String expired = track(order[0], order[1]).andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();

		assertThat(List.of(wrong, unknown, empty, expired)).allSatisfy(b -> {
			assertThat(b).contains("ORDER_NOT_FOUND");
			assertThat(field(b, "detail")).isEqualTo(field(wrong, "detail"));
		});
	}

	@Test
	void signedInOrdersHaveNoTrackingToken() throws Exception {
		Cookie buyer = register(email());
		String body = place(orderJson("trk-" + UUID.randomUUID(), null, product(), 1), buyer).andExpect(status().isCreated())
			.andExpect(jsonPath("$.accessToken").doesNotExist())
			.andExpect(jsonPath("$.trackingUrl").doesNotExist())
			.andReturn()
			.getResponse()
			.getContentAsString();
		String code = field(body, "code");
		assertThat(jdbc.queryForObject("""
				SELECT COUNT(*) FROM order_access_tokens t JOIN orders o ON o.id = t.order_id WHERE o.code = ?""",
				Integer.class, code)).isZero();
		track(code, SecureTokens.generate()).andExpect(status().isNotFound());
	}

	@Test
	void replayingThePlaceRequestReturnsTheSameOrderWithAnotherWorkingLink() throws Exception {
		long id = product();
		String request = orderJson("trk-" + UUID.randomUUID(), null, id, 1);
		String first = place(request).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
		String again = place(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
		assertThat(field(again, "code")).isEqualTo(field(first, "code"));
		assertThat(field(again, "accessToken")).isNotEqualTo(field(first, "accessToken"));
		track(field(first, "code"), field(first, "accessToken")).andExpect(status().isOk());
		track(field(first, "code"), field(again, "accessToken")).andExpect(status().isOk());
		assertThat(stock(id)).containsExactly(20, 1);
	}

	@Test
	void guestCancelsThroughTheLinkOnlyWhilePending() throws Exception {
		long id = product();
		String[] order = guestOrder(id, null);
		assertThat(stock(id)).containsExactly(20, 2);

		mvc.perform(json(post("/api/orders/track/" + order[0] + "/cancel").param("t", SecureTokens.generate()),
				"{\"reasonCode\":\"DUPLICATE_ORDER\"}")).andExpect(status().isNotFound());
		mvc.perform(json(post("/api/orders/track/" + order[0] + "/cancel").param("t", order[1]), "{\"reason\":\"Đặt nhầm\"}"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_CANCEL_REASON"));
		mvc.perform(json(post("/api/orders/track/" + order[0] + "/cancel").param("t", order[1]), "{\"reasonCode\":\"OTHER\"}"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("CANCEL_REASON_REQUIRED"));
		assertThat(stock(id)).containsExactly(20, 2);

		mvc.perform(json(post("/api/orders/track/" + order[0] + "/cancel").param("t", order[1]),
				"{\"reasonCode\":\"OTHER\",\"reason\":\"Đặt nhầm\"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("CANCELLED"))
			.andExpect(jsonPath("$.canCancel").value(false))
			.andExpect(jsonPath("$.history[1].reason").value("Khách huỷ: Lý do khác – Đặt nhầm"))
			.andExpect(jsonPath("$.cancelReasonCode").value("OTHER"))
			.andExpect(jsonPath("$.cancelReason").value("Đặt nhầm"))
			.andExpect(jsonPath("$.cancelledByType").value("CUSTOMER"));
		assertThat(stock(id)).containsExactly(20, 0);
		assertThat(jdbc.queryForObject("SELECT actor_type FROM audit_logs WHERE action = 'ORDER_CANCEL' AND entity_id = ?",
				String.class, order[0])).isEqualTo("CUSTOMER");

		mvc.perform(json(post("/api/orders/track/" + order[0] + "/cancel").param("t", order[1]), "{\"reasonCode\":\"CHANGED_MIND\"}"))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("ORDER_NOT_CANCELLABLE"));
		assertThat(stock(id)).containsExactly(20, 0);
	}

	@Test
	void statusEmailsCarryAFreshLinkAndOldLinksKeepWorking() throws Exception {
		String email = email();
		String[] order = guestOrder(product(), email);
		EmailMessage confirmation = mailTo(email);
		assertThat(confirmation).isNotNull();
		track(order[0], order[1]).andExpect(jsonPath("$.maskedEmail").value("tr***@example.com"))
			.andExpect(jsonPath("$.hasEmail").value(true));
		assertThat(confirmation.html()).contains("Theo dõi đơn hàng");
		// The confirmation email carries the same link the checkout response returned
		assertThat(tokenIn(confirmation)).isEqualTo(order[1]);

		jdbc.update("UPDATE orders SET status = 'CONFIRMED' WHERE code = ?", order[0]);
		// Ship through the admin service path (same transition the back office uses)
		Cookie admin = register(email());
		jdbc.update("UPDATE users SET role = 'ADMIN' WHERE email = ?", emails.getLast());
		admin = mvc.perform(json(post("/api/auth/login"), "{\"email\":\"" + emails.getLast() + "\",\"password\":\"matkhau123\"}"))
			.andReturn().getResponse().getCookie(AuthCookies.ACCESS_COOKIE);
		mvc.perform(json(post("/api/admin/orders/" + order[0] + "/ship"), "{\"carrier\":\"GHN\",\"trackingNumber\":\"G1\"}")
			.cookie(admin)).andExpect(status().isOk());
		EmailMessage shipped = mailTo(email);
		assertThat(shipped).isNotNull();
		String shippedToken = tokenIn(shipped);

		for (String token : List.of(order[1], tokenIn(confirmation), shippedToken)) {
			track(order[0], token).andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("SHIPPING"))
				.andExpect(jsonPath("$.trackingNumber").value("G1"));
		}
	}

	// ---- creating an account from an order ------------------------------------------------------------------

	@Test
	void claimAccountCreatesTheUserAttachesOnlyThisOrderAndSignsIn() throws Exception {
		long id = product();
		String email = email();
		String[] first = guestOrder(id, email);
		String[] second = guestOrder(id, email);

		MockHttpServletResponse res = mvc.perform(json(post("/api/orders/track/" + first[0] + "/claim-account").param("t", first[1]),
				"{\"password\":\"matkhau123\",\"acceptTerms\":true}"))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.email").value(email))
			.andExpect(jsonPath("$.fullName").value("Nguyễn Khách"))
			.andExpect(jsonPath("$.phone").value("0912345678"))
			.andExpect(jsonPath("$.emailVerified").value(false))
			.andReturn()
			.getResponse();
		Cookie session = res.getCookie(AuthCookies.ACCESS_COOKIE);
		assertThat(session).isNotNull();

		Map<String, Object> user = jdbc.queryForMap("SELECT id::text AS id, terms_accepted_at, password_hash FROM users WHERE email = ?", email);
		assertThat(user.get("terms_accepted_at")).isNotNull();
		assertThat((String) user.get("password_hash")).startsWith("$2").doesNotContain("matkhau123");
		assertThat(jdbc.queryForObject("SELECT user_id::text FROM orders WHERE code = ?", String.class, first[0])).isEqualTo(user.get("id"));
		// Only this order: the other one waits for email verification
		assertThat(jdbc.queryForObject("SELECT user_id::text FROM orders WHERE code = ?", String.class, second[0])).isNull();

		// The tracking link of the claimed order no longer works; the account shows it instead
		track(first[0], first[1]).andExpect(status().isNotFound());
		mvc.perform(get("/api/orders/me/" + first[0]).cookie(session)).andExpect(status().isOk());
		assertThat(jdbc.queryForObject("""
				SELECT COUNT(*) FROM order_access_tokens t JOIN orders o ON o.id = t.order_id WHERE o.code = ?""",
				Integer.class, first[0])).isZero();
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_logs WHERE action = 'ORDER_CLAIMED' AND entity_id = ?",
				Integer.class, first[0])).isEqualTo(1);

		// Verifying the email attaches the other guest order with the same email
		EmailMessage verification = null;
		for (int i = 0; i < 5 && verification == null; i++) {
			EmailMessage m = mailTo(email);
			if (m != null && m.subject().contains("Xác minh")) {
				verification = m;
			}
		}
		assertThat(verification).as("verification email").isNotNull();
		String token = tokenIn(verification);
		mvc.perform(json(post("/api/auth/verify-email"), "{\"token\":\"" + token + "\"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.attachedOrders").value(1));
		assertThat(jdbc.queryForObject("SELECT user_id::text FROM orders WHERE code = ?", String.class, second[0])).isEqualTo(user.get("id"));
		track(second[0], second[1]).andExpect(status().isNotFound());
		mvc.perform(get("/api/auth/me").cookie(session)).andExpect(jsonPath("$.emailVerified").value(true));
		// Single use
		mvc.perform(json(post("/api/auth/verify-email"), "{\"token\":\"" + token + "\"}"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_LINK"));
	}

	@Test
	void claimAccountWithAnExistingEmailOrPhoneChangesNothing() throws Exception {
		String email = email();
		register(email);
		String[] order = guestOrder(product(), email);
		int users = jdbc.queryForObject("SELECT COUNT(*) FROM users", Integer.class);

		mvc.perform(json(post("/api/orders/track/" + order[0] + "/claim-account").param("t", order[1]),
				"{\"password\":\"matkhau123\",\"acceptTerms\":true}"))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("ACCOUNT_EXISTS"));
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM users", Integer.class)).isEqualTo(users);
		assertThat(jdbc.queryForObject("SELECT user_id FROM orders WHERE code = ?", String.class, order[0])).isNull();
		track(order[0], order[1]).andExpect(status().isOk());

		// Phone already used by another account
		String other = email();
		jdbc.update("UPDATE users SET phone = '0912345678' WHERE email = ?", email);
		String[] second = guestOrder(product(), other);
		mvc.perform(json(post("/api/orders/track/" + second[0] + "/claim-account").param("t", second[1]),
				"{\"password\":\"matkhau123\",\"acceptTerms\":true}"))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("ACCOUNT_EXISTS"));
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE email = ?", Integer.class, other)).isZero();
	}

	@Test
	void claimAccountNeedsAnEmailTermsAndAValidPassword() throws Exception {
		String[] order = guestOrder(product(), null);
		String url = "/api/orders/track/" + order[0] + "/claim-account";
		mvc.perform(json(post(url).param("t", order[1]), "{\"password\":\"matkhau123\",\"acceptTerms\":true}"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("EMAIL_REQUIRED"));
		mvc.perform(json(post(url).param("t", order[1]), "{\"password\":\"12345678\",\"acceptTerms\":true,\"email\":\"a@b.vn\"}"))
			.andExpect(status().isBadRequest());
		mvc.perform(json(post(url).param("t", order[1]), "{\"password\":\"matkhau123\",\"acceptTerms\":false,\"email\":\"a@b.vn\"}"))
			.andExpect(status().isBadRequest());
		mvc.perform(json(post(url).param("t", SecureTokens.generate()), "{\"password\":\"matkhau123\",\"acceptTerms\":true,\"email\":\"a@b.vn\"}"))
			.andExpect(status().isNotFound());

		String email = email();
		// marketingConsent: the opt-in no longer exists, an older page still sending it must not get a 400
		mvc.perform(json(post(url).param("t", order[1]),
				"{\"password\":\"matkhau123\",\"acceptTerms\":true,\"marketingConsent\":true,\"email\":\"" + email + "\"}"))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.email").value(email));
		assertThat(jdbc.queryForObject("SELECT count(*) FROM users WHERE email = ?", Long.class, email)).isEqualTo(1);
	}

	// ---- attaching after sign-in ----------------------------------------------------------------------------

	@Test
	void signedInUserAttachesOnlyValidUnownedRecentOrdersThatAreTheirs() throws Exception {
		long id = product();
		String[] mine = guestOrder(id, null);
		String[] wrongToken = guestOrder(id, null);
		// Someone else's order, placed with their (verified) email: they claim it first
		String otherEmail = email();
		Cookie someoneElse = register(otherEmail);
		jdbc.update("UPDATE users SET email_verified_at = now() WHERE email = ?", otherEmail);
		String[] taken = guestOrder(id, otherEmail);
		mvc.perform(json(post("/api/orders/claim"), "[{\"code\":\"%s\",\"token\":\"%s\"}]".formatted(taken[0], taken[1]))
			.cookie(someoneElse)).andExpect(jsonPath("$.claimed", hasItem(taken[0])));

		// This account has the phone the orders were placed with
		String email = email();
		Cookie me = register(email);
		jdbc.update("UPDATE users SET phone = '0912345678' WHERE email = ?", email);
		String items = "[{\"code\":\"%s\",\"token\":\"%s\"},{\"code\":\"%s\",\"token\":\"%s\"},{\"code\":\"%s\",\"token\":\"%s\"}]"
			.formatted(mine[0], mine[1], wrongToken[0], SecureTokens.generate(), taken[0], taken[1]);
		mvc.perform(json(post("/api/orders/claim"), items).cookie(me))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.claimed.length()").value(1))
			.andExpect(jsonPath("$.claimed[0]").value(mine[0]))
			.andExpect(jsonPath("$.skipped.length()").value(2));
		String myId = jdbc.queryForObject("SELECT id::text FROM users WHERE email = ?", String.class, email);
		assertThat(jdbc.queryForObject("SELECT user_id::text FROM orders WHERE code = ?", String.class, mine[0])).isEqualTo(myId);
		assertThat(jdbc.queryForObject("SELECT user_id::text FROM orders WHERE code = ?", String.class, taken[0])).isNotEqualTo(myId);
		assertThat(jdbc.queryForObject("SELECT user_id FROM orders WHERE code = ?", String.class, wrongToken[0])).isNull();
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_logs WHERE action = 'ORDER_CLAIMED' AND entity_id = ?",
				Integer.class, mine[0])).isEqualTo(1);

		mvc.perform(json(post("/api/orders/claim"), "[]")).andExpect(status().isUnauthorized());
	}

	@Test
	void aValidLinkAloneDoesNotMoveAnOrderToAnUnrelatedAccount() throws Exception {
		long id = product();
		String buyerEmail = email();
		String[] order = guestOrder(id, buyerEmail);
		String item = "[{\"code\":\"%s\",\"token\":\"%s\"}]".formatted(order[0], order[1]);

		// Different email and phone (e.g. the link was forwarded)
		Cookie stranger = register(email());
		mvc.perform(json(post("/api/orders/claim"), item).cookie(stranger))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.claimed.length()").value(0))
			.andExpect(jsonPath("$.skipped[0]").value(order[0]));

		// Staff helping the buyer, even with the matching phone
		String staffEmail = email();
		Cookie staff = register(staffEmail);
		jdbc.update("UPDATE users SET role = 'STAFF', phone = '0912345678' WHERE email = ?", staffEmail);
		mvc.perform(json(post("/api/orders/claim"), item).cookie(staff))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.claimed.length()").value(0));
		jdbc.update("UPDATE users SET phone = NULL WHERE email = ?", staffEmail);

		// Same email as the order but not verified yet
		jdbc.update("DELETE FROM users WHERE email = ?", buyerEmail);
		Cookie unverified = register(buyerEmail);
		mvc.perform(json(post("/api/orders/claim"), item).cookie(unverified)).andExpect(jsonPath("$.claimed.length()").value(0));

		assertThat(jdbc.queryForObject("SELECT user_id FROM orders WHERE code = ?", String.class, order[0])).isNull();
		track(order[0], order[1]).andExpect(status().isOk());

		// Once that email is verified, the link attaches it
		jdbc.update("UPDATE users SET email_verified_at = now() WHERE email = ?", buyerEmail);
		mvc.perform(json(post("/api/orders/claim"), item).cookie(unverified)).andExpect(jsonPath("$.claimed[0]").value(order[0]));
		track(order[0], order[1]).andExpect(status().isNotFound());
	}

	@Test
	void verificationEmailOnRegisterAndResend() throws Exception {
		String email = email();
		Cookie session = register(email);
		EmailMessage first = mailTo(email);
		assertThat(first).isNotNull();
		assertThat(first.subject()).contains("Xác minh");
		mvc.perform(get("/api/auth/me").cookie(session)).andExpect(jsonPath("$.emailVerified").value(false));

		mvc.perform(json(post("/api/auth/verify-email/resend"), "").cookie(session)).andExpect(status().isAccepted());
		EmailMessage second = mailTo(email);
		assertThat(second).isNotNull();
		// The new link replaces the old one
		mvc.perform(json(post("/api/auth/verify-email"), "{\"token\":\"" + tokenIn(first) + "\"}"))
			.andExpect(status().isBadRequest());
		mvc.perform(json(post("/api/auth/verify-email"), "{\"token\":\"" + tokenIn(second) + "\"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.attachedOrders").value(0));
		mvc.perform(json(post("/api/auth/verify-email/resend"), "").cookie(session))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("ALREADY_VERIFIED"));
	}

	@Test
	void trackingPagesAreNotIndexedOrReferred() throws Exception {
		mvc.perform(get("/don-hang/HL2610130000").param("t", "abc"))
			.andExpect(status().isOk())
			.andExpect(header().string("Referrer-Policy", "no-referrer"))
			.andExpect(header().string("Cache-Control", containsString("no-store")))
			.andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content().string(containsString("noindex")));
		mvc.perform(get("/robots.txt"))
			.andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content().string(containsString("Disallow: /don-hang/")));
	}
}
