package com.nutshop.admin;

import com.nutshop.IntegrationTest;
import com.nutshop.auth.AuthCookies;
import com.nutshop.auth.TokenService;
import com.nutshop.common.SecureTokens;
import com.nutshop.mail.EmailMessage;
import com.nutshop.security.RateLimiter;
import com.nutshop.user.UserRepository;
import com.nutshop.user.UserStatusCache;
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
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Accounts (ADMIN), locked users, forced password changes, staff invitations, phone flags and refused parcels. */
@IntegrationTest
@Import(CapturingEmailSender.Config.class)
class AdminUsersE2ETest {

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcTemplate jdbc;

	@Autowired
	UserRepository users;

	@Autowired
	TokenService tokens;

	@Autowired
	UserStatusCache statuses;

	@Autowired
	CapturingEmailSender mailbox;

	@Autowired
	List<RateLimiter> limiters;

	private final List<Long> products = new ArrayList<>();

	@BeforeEach
	void reset() {
		limiters.forEach(RateLimiter::reset);
		mailbox.clear();
	}

	@AfterEach
	void cleanUp() {
		for (Long id : products) {
			jdbc.update("DELETE FROM orders WHERE id IN (SELECT order_id FROM order_items WHERE product_id = ?)", id);
			jdbc.update("DELETE FROM inventory_movements WHERE product_id = ?", id);
			jdbc.update("DELETE FROM products WHERE id = ?", id);
		}
		jdbc.update("DELETE FROM phone_flags WHERE phone LIKE '0977%'");
	}

	// ---- helpers --------------------------------------------------------------------------------------------

	private record Account(UUID id, String email, Cookie access, Cookie refresh) {
	}

	private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder request, String body) {
		return request.header("X-Requested-With", "XMLHttpRequest").contentType(MediaType.APPLICATION_JSON).content(body);
	}

	/** Registers with a good password, sets the role, and signs in again so the token carries it. */
	private Account account(String role) throws Exception {
		String email = role.toLowerCase() + "-u-" + UUID.randomUUID() + "@example.com";
		mvc.perform(json(post("/api/auth/register"), RegisterJson.of("Người " + role, email, "matkhau123")))
			.andExpect(status().isCreated());
		jdbc.update("UPDATE users SET role = ? WHERE email = ?", role, email);
		MockHttpServletResponse login = mvc
			.perform(json(post("/api/auth/login"), "{\"email\":\"" + email + "\",\"password\":\"matkhau123\"}"))
			.andExpect(status().isOk())
			.andReturn()
			.getResponse();
		UUID id = users.findByEmail(email).orElseThrow().getId();
		statuses.evict(id);
		return new Account(id, email, login.getCookie(AuthCookies.ACCESS_COOKIE), login.getCookie(AuthCookies.REFRESH_COOKIE));
	}

	private ResultActions as(Account a, MockHttpServletRequestBuilder request) throws Exception {
		return mvc.perform(request.header("X-Requested-With", "XMLHttpRequest").cookie(a.access()));
	}

	private long product(int onHand) {
		Long id = jdbc.queryForObject("""
				INSERT INTO products (category_id, name, slug, description, price, weight_grams, on_hand, reserved, active,
				                      calories, protein, fat, carbs, fiber)
				VALUES (1, 'Hạt hoàn kho', ?, 'Test', 100000, 500, ?, 0, true, 500, 20, 40, 20, 10) RETURNING id""",
				Long.class, "return-" + UUID.randomUUID(), onHand);
		products.add(id);
		return id;
	}

	private String order(long productId, int qty, String phone) throws Exception {
		String body = mvc.perform(json(post("/api/orders"), """
				{"idempotencyKey":"u-%s","customerName":"Khách Test","phone":"%s","provinceCode":1,"wardCode":4,
				 "addressLine":"1 Phố","items":[{"productId":%d,"quantity":%d}]}""".formatted(UUID.randomUUID(), phone,
				productId, qty))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
		Matcher m = Pattern.compile("\"code\":\"([A-Z0-9]+)\"").matcher(body);
		assertThat(m.find()).isTrue();
		return m.group(1);
	}

	private int[] stock(long id) {
		return jdbc.queryForObject("SELECT on_hand, reserved FROM products WHERE id = ?",
				(rs, n) -> new int[] { rs.getInt(1), rs.getInt(2) }, id);
	}

	// ---- users ----------------------------------------------------------------------------------------------

	@Test
	void onlyAdminsManageUsers() throws Exception {
		Account staff = account("STAFF");
		as(staff, get("/api/admin/users")).andExpect(status().isForbidden());
		as(staff, get("/api/admin/audit-logs")).andExpect(status().isForbidden());
		as(staff, json(post("/api/admin/users/" + staff.id() + "/active"), "{\"active\":false,\"reason\":\"x\"}"))
			.andExpect(status().isForbidden());
		Account admin = account("ADMIN");
		as(admin, get("/api/admin/users").param("q", staff.email())).andExpect(status().isOk())
			.andExpect(jsonPath("$.items[0].email").value(staff.email()))
			.andExpect(jsonPath("$.items[0].role").value("STAFF"));
	}

	@Test
	void adminCannotChangeThemselvesOrRemoveTheLastAdmin() throws Exception {
		Account admin = account("ADMIN");
		as(admin, json(post("/api/admin/users/" + admin.id() + "/active"), "{\"active\":false,\"reason\":\"thử\"}"))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("SELF_CHANGE"));
		as(admin, json(post("/api/admin/users/" + admin.id() + "/role"), "{\"role\":\"CUSTOMER\",\"reason\":\"thử\"}"))
			.andExpect(status().isConflict());

		// The acting admin is always an active admin and can never lock itself, so the last active admin cannot be
		// removed through the API; another admin can be locked (and unlocked) while one remains
		Account other = account("ADMIN");
		as(admin, json(post("/api/admin/users/" + other.id() + "/active"), "{\"active\":false,\"reason\":\"nghỉ việc\"}"))
			.andExpect(status().isOk());
		as(other, get("/api/admin/orders")).andExpect(status().isUnauthorized());
		as(admin, json(post("/api/admin/users/" + other.id() + "/active"), "{\"active\":true,\"reason\":\"quay lại\"}"))
			.andExpect(status().isOk());
		// Admin roles are not changed here (admins come from ADMIN_EMAIL)
		as(admin, json(post("/api/admin/users/" + other.id() + "/role"), "{\"role\":\"STAFF\",\"reason\":\"x\"}"))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("ROLE_NOT_ALLOWED"));
	}

	@Test
	void auditLogIsReadableFilteredAndPaged() throws Exception {
		Account admin = account("ADMIN");
		Account staff = account("STAFF");
		as(admin, json(post("/api/admin/users/" + staff.id() + "/active"), "{\"active\":false,\"reason\":\"nghỉ việc\"}"))
			.andExpect(status().isOk());
		// A row written before entity_label existed: the current name is looked up
		long id = product(5);
		jdbc.update("""
				INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, before, after)
				VALUES (?, 'PRODUCT_UPDATED', 'PRODUCT', ?, '{"price": 1}', '{"price": 2}')""", admin.id(), String.valueOf(id));

		as(admin, get("/api/admin/audit-logs").param("actorId", admin.id().toString()).param("action", "USER_LOCKED"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.size").value(50))
			.andExpect(jsonPath("$.totalItems").value(1))
			.andExpect(jsonPath("$.items[0].actorType").value("STAFF"))
			.andExpect(jsonPath("$.items[0].entityLabel").value("Người STAFF (" + staff.email() + ")"))
			.andExpect(jsonPath("$.items[0].reason").value("nghỉ việc"))
			.andExpect(jsonPath("$.items[0].before.active").value(true))
			.andExpect(jsonPath("$.items[0].after.active").value(false))
			.andExpect(jsonPath("$.items[0].after.reason").doesNotExist());
		as(admin, get("/api/admin/audit-logs").param("actorId", admin.id().toString()).param("entityType", "PRODUCT")
			.param("action", "PRODUCT_UPDATED"))
			.andExpect(jsonPath("$.items[0].entityLabel").value("Hạt hoàn kho"))
			.andExpect(jsonPath("$.items[0].after.price").value(2));
		// Promotion snapshots show the product's name instead of its id
		jdbc.update("""
				INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, before, after)
				VALUES (?, 'PROMOTION_CREATED', 'PRODUCT', ?, NULL, CAST(? AS jsonb))""", admin.id(), String.valueOf(id),
				"{\"productId\": " + id + ", \"salePrice\": 90000}");
		as(admin, get("/api/admin/audit-logs").param("actorId", admin.id().toString()).param("action", "PROMOTION_CREATED"))
			.andExpect(jsonPath("$.items[0].after.productId").value("Hạt hoàn kho"))
			.andExpect(jsonPath("$.items[0].after.salePrice").value(90000));
	}

	@Test
	void lockingRevokesSessionsAndOldAccessTokens() throws Exception {
		Account admin = account("ADMIN");
		Account staff = account("STAFF");
		as(staff, get("/api/admin/orders")).andExpect(status().isOk());

		as(admin, json(post("/api/admin/users/" + staff.id() + "/active"), "{\"active\":false,\"reason\":\"nghỉ việc\"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.active").value(false));
		// The still-valid access token is refused (cache evicted on this server; otherwise within 60 s)
		as(staff, get("/api/admin/orders")).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("ACCOUNT_LOCKED"));
		as(staff, get("/api/auth/me")).andExpect(status().isUnauthorized());
		mvc.perform(json(post("/api/auth/refresh"), "").cookie(staff.refresh())).andExpect(status().isUnauthorized());
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_logs WHERE action = 'USER_LOCKED' AND entity_id = ?",
				Integer.class, staff.id().toString())).isEqualTo(1);

		// Role change CUSTOMER ↔ STAFF only, with a reason
		Account customer = account("CUSTOMER");
		as(admin, json(post("/api/admin/users/" + customer.id() + "/role"), "{\"role\":\"STAFF\",\"reason\":\"\"}"))
			.andExpect(status().isBadRequest());
		as(admin, json(post("/api/admin/users/" + customer.id() + "/role"), "{\"role\":\"ADMIN\",\"reason\":\"x\"}"))
			.andExpect(status().isConflict());
		as(admin, json(post("/api/admin/users/" + customer.id() + "/role"), "{\"role\":\"STAFF\",\"reason\":\"tuyển mới\"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.role").value("STAFF"));
	}

	@Test
	void weakStaffPasswordsMustBeChangedBeforeUsingTheBackOffice() throws Exception {
		Account staff = account("STAFF");
		// Simulate an old account whose password no longer meets the rules
		jdbc.update("UPDATE users SET password_hash = ? WHERE id = ?",
				new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder(4).encode("12345678"), staff.id());
		MockHttpServletResponse login = mvc
			.perform(json(post("/api/auth/login"), "{\"email\":\"" + staff.email() + "\",\"password\":\"12345678\"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.passwordChangeRequired").value(true))
			.andReturn()
			.getResponse();
		Cookie access = login.getCookie(AuthCookies.ACCESS_COOKIE);
		mvc.perform(get("/api/admin/orders").cookie(access))
			.andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("PASSWORD_CHANGE_REQUIRED"));
		// The rest of the site still works
		mvc.perform(get("/api/auth/me").cookie(access)).andExpect(status().isOk());

		mvc.perform(json(post("/api/auth/change-password"), "{\"currentPassword\":\"12345678\",\"newPassword\":\"12345678\"}")
			.cookie(access)).andExpect(status().isBadRequest());
		mvc.perform(json(post("/api/auth/change-password"), "{\"currentPassword\":\"sai\",\"newPassword\":\"matkhaumoi1\"}")
			.cookie(access)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("WRONG_PASSWORD"));
		Cookie fresh = mvc
			.perform(json(post("/api/auth/change-password"), "{\"currentPassword\":\"12345678\",\"newPassword\":\"matkhaumoi1\"}")
				.cookie(access))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.passwordChangeRequired").value(false))
			.andReturn()
			.getResponse()
			.getCookie(AuthCookies.ACCESS_COOKIE);
		mvc.perform(get("/api/admin/orders").cookie(fresh)).andExpect(status().isOk());
	}

	@Test
	void staffInvitationLinkIsSingleUseAndExpiresAfter48Hours() throws Exception {
		Account admin = account("ADMIN");
		String email = "moi-" + UUID.randomUUID() + "@example.com";
		as(admin, json(post("/api/admin/users/invitations"),
				"{\"fullName\":\"Nhân Viên Mới\",\"email\":\"" + email + "\",\"reason\":\"tuyển kho\"}"))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.role").value("STAFF"))
			.andExpect(jsonPath("$.invitationPending").value(true));
		EmailMessage mail = null;
		for (int i = 0; i < 5 && (mail == null || !mail.to().equals(email)); i++) {
			mail = mailbox.next(Duration.ofSeconds(5));
		}
		assertThat(mail).isNotNull();
		Matcher m = Pattern.compile("/dat-mat-khau\\?token=([A-Za-z0-9_-]{43})").matcher(mail.text());
		assertThat(m.find()).isTrue();
		String token = m.group(1);
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM password_reset_tokens WHERE token_hash = ? AND purpose = 'INVITE' "
				+ "AND expires_at BETWEEN now() + interval '47 hours' AND now() + interval '49 hours'", Integer.class,
				SecureTokens.hash(token))).isEqualTo(1);
		// An invitation token is not a password-reset token
		mvc.perform(json(post("/api/auth/reset-password"), "{\"token\":\"" + token + "\",\"newPassword\":\"matkhau123\"}"))
			.andExpect(status().isBadRequest());

		mvc.perform(json(post("/api/auth/accept-invite"), "{\"token\":\"" + token + "\",\"newPassword\":\"matkhau123\",\"acceptTerms\":true}"))
			.andExpect(status().isNoContent());
		mvc.perform(json(post("/api/auth/accept-invite"), "{\"token\":\"" + token + "\",\"newPassword\":\"matkhau456\",\"acceptTerms\":true}"))
			.andExpect(status().isBadRequest());
		mvc.perform(json(post("/api/auth/login"), "{\"email\":\"" + email + "\",\"password\":\"matkhau123\"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.role").value("STAFF"))
			.andExpect(jsonPath("$.emailVerified").value(true));

		// Expired
		String other = "moi2-" + UUID.randomUUID() + "@example.com";
		as(admin, json(post("/api/admin/users/invitations"), "{\"fullName\":\"Bình\",\"email\":\"" + other + "\",\"reason\":\"x\"}"))
			.andExpect(status().isCreated());
		mail = null;
		for (int i = 0; i < 5 && (mail == null || !mail.to().equals(other)); i++) {
			mail = mailbox.next(Duration.ofSeconds(5));
		}
		m = Pattern.compile("token=([A-Za-z0-9_-]{43})").matcher(mail.text());
		assertThat(m.find()).isTrue();
		jdbc.update("UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute' WHERE token_hash = ?",
				SecureTokens.hash(m.group(1)));
		mvc.perform(json(post("/api/auth/accept-invite"), "{\"token\":\"" + m.group(1) + "\",\"newPassword\":\"matkhau123\",\"acceptTerms\":true}"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_LINK"));
	}

	// ---- phone flags ----------------------------------------------------------------------------------------

	@Test
	void staffMayOnlyWatchAndBlockedNumbersCannotOrderCod() throws Exception {
		Account staff = account("STAFF");
		Account admin = account("ADMIN");
		String phone = "0977" + String.valueOf(System.nanoTime()).substring(0, 6);

		as(staff, json(put("/api/admin/phone-flags/" + phone), "{\"level\":\"BLOCK_COD\",\"reason\":\"boom hàng\"}"))
			.andExpect(status().isForbidden());
		as(staff, json(put("/api/admin/phone-flags/" + phone), "{\"level\":\"WATCH\",\"reason\":\"\"}"))
			.andExpect(status().isBadRequest());
		as(staff, json(put("/api/admin/phone-flags/+84" + phone.substring(1)), "{\"level\":\"WATCH\",\"reason\":\"gọi không nghe\"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.phone").value(phone));
		as(staff, json(post("/api/admin/phone-flags/" + phone + "/remove"), "{\"reason\":\"nhầm\"}")).andExpect(status().isForbidden());

		long id = product(10);
		order(id, 1, phone); // WATCH does not block
		as(admin, json(put("/api/admin/phone-flags/" + phone), "{\"level\":\"BLOCK_COD\",\"reason\":\"bom hàng 2 lần\"}"))
			.andExpect(status().isOk());
		mvc.perform(json(post("/api/orders"), """
				{"idempotencyKey":"blk-%s","customerName":"Khách","phone":"+84 %s","provinceCode":1,"wardCode":4,
				 "addressLine":"1 Phố","items":[{"productId":%d,"quantity":1}]}""".formatted(UUID.randomUUID(), phone.substring(1), id)))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("COD_NOT_AVAILABLE"))
			.andExpect(jsonPath("$.detail").value("Vui lòng liên hệ hotline để được hỗ trợ đặt hàng."));
		assertThat(stock(id)).containsExactly(10, 1);

		as(admin, json(post("/api/admin/phone-flags/" + phone + "/remove"), "{\"reason\":\"đã xác minh\"}"))
			.andExpect(status().isNoContent());
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_logs WHERE entity_type = 'PHONE' AND entity_id = ?",
				Integer.class, phone)).isEqualTo(3);
	}

	// ---- refused parcels ------------------------------------------------------------------------------------

	@Test
	void refusedDeliveryReturnsStockOnceEvenWhenClickedTwice() throws Exception {
		Account staff = account("STAFF");
		long id = product(10);
		String phone = "0977" + String.valueOf(System.nanoTime()).substring(0, 6);
		String first = order(id, 1, phone);
		String code = order(id, 3, phone);
		as(staff, json(post("/api/admin/orders/" + code + "/confirm"), "{\"contact\":\"UNREACHABLE\",\"note\":\"thuê bao\"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.order.status").value("PENDING"))
			.andExpect(jsonPath("$.notes[0].body").value("Chưa liên hệ được khách: thuê bao"));
		as(staff, json(post("/api/admin/orders/" + code + "/confirm"), "{\"contact\":\"CALLED\"}"))
			.andExpect(jsonPath("$.order.status").value("CONFIRMED"));
		as(staff, json(post("/api/admin/orders/" + code + "/ship"), "{\"carrier\":\"GHN\",\"trackingNumber\":\"G9\"}"))
			.andExpect(status().isOk());
		assertThat(stock(id)).containsExactly(7, 1);

		// Shipping orders only accept "refused at the door"
		as(staff, json(post("/api/admin/orders/" + code + "/cancel"), "{\"reasonCode\":\"CUSTOMER_REQUEST\",\"reason\":\"đổi ý\"}"))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("INVALID_CANCEL_REASON"));

		int threads = 4;
		CountDownLatch start = new CountDownLatch(1);
		ExecutorService pool = Executors.newFixedThreadPool(threads);
		List<Future<Integer>> results = new ArrayList<>();
		for (int i = 0; i < threads; i++) {
			Callable<Integer> click = () -> {
				start.await();
				return as(staff, json(post("/api/admin/orders/" + code + "/cancel"),
						"{\"reasonCode\":\"REFUSED_DELIVERY\",\"reason\":\"khách không nhận\"}")).andReturn().getResponse().getStatus();
			};
			results.add(pool.submit(click));
		}
		start.countDown();
		List<Integer> statuses = new ArrayList<>();
		for (Future<Integer> f : results) {
			statuses.add(f.get());
		}
		pool.shutdown();
		assertThat(statuses.stream().filter(s -> s == 200).count()).isEqualTo(1);
		assertThat(stock(id)).containsExactly(10, 1);
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM inventory_movements WHERE product_id = ? AND type = 'RETURN' AND quantity = 3",
				Integer.class, id)).isEqualTo(1);
		assertThat(jdbc.queryForObject("SELECT cancel_reason_code FROM orders WHERE code = ?", String.class, code))
			.isEqualTo("REFUSED_DELIVERY");
		// on_hand = Σ(IMPORT, ADJUST, ORDER_SHIP, RETURN) from the starting stock of 10 (inserted directly)
		assertThat(10 + jdbc.queryForObject("SELECT COALESCE(SUM(quantity),0) FROM inventory_movements WHERE product_id = ? "
				+ "AND type IN ('IMPORT','ADJUST','ORDER_SHIP','RETURN')", Integer.class, id)).isEqualTo(stock(id)[0]);

		// REFUSED_DELIVERY is only for shipping orders
		as(staff, json(post("/api/admin/orders/" + first + "/cancel"), "{\"reasonCode\":\"REFUSED_DELIVERY\",\"reason\":\"x\"}"))
			.andExpect(status().isConflict());

		// Stats by phone: the order being looked at is not its own "first order"
		as(staff, get("/api/admin/customers/by-phone/" + phone + "/stats").param("exclude", first))
			.andExpect(jsonPath("$.totalOrders").value(2))
			.andExpect(jsonPath("$.previousOrders").value(0))
			.andExpect(jsonPath("$.refusedDelivery").value(1))
			.andExpect(jsonPath("$.cancelled").value(1));
		as(staff, get("/api/admin/customers/by-phone/" + phone + "/stats").param("exclude", code))
			.andExpect(jsonPath("$.previousOrders").value(1))
			.andExpect(jsonPath("$.firstOrderAt").isString());
	}
}
