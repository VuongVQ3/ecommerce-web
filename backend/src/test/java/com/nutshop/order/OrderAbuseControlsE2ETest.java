package com.nutshop.order;

import com.nutshop.IntegrationTest;
import com.nutshop.auth.TurnstileVerifier;
import com.nutshop.common.ApiException;
import com.nutshop.security.RateLimiter;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** run-2 group 6: stale-PENDING expiry (lead 10), optional Turnstile on order creation (11/12), and the
 * inactive-product disclosure fix on /api/cart/validate (lead 13). */
@IntegrationTest
class OrderAbuseControlsE2ETest {

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcTemplate jdbc;

	@Autowired
	OrderService orderService;

	@Autowired
	List<RateLimiter> limiters;

	@MockitoBean
	TurnstileVerifier turnstile;

	private final List<Long> products = new ArrayList<>();

	@BeforeEach
	void reset() {
		limiters.forEach(RateLimiter::reset);
	}

	@AfterEach
	void cleanUp() {
		for (Long id : products) {
			jdbc.update("DELETE FROM orders WHERE id IN (SELECT order_id FROM order_items WHERE product_id = ?)", id);
			jdbc.update("DELETE FROM inventory_movements WHERE product_id = ?", id);
			jdbc.update("DELETE FROM products WHERE id = ?", id);
		}
	}

	private long product(String name, boolean active, int onHand) {
		Long id = jdbc.queryForObject("""
				INSERT INTO products (category_id, name, slug, description, price, weight_grams, on_hand, reserved, active,
				                      calories, protein, fat, carbs, fiber)
				VALUES (1, ?, ?, 'Test', 100000, 500, ?, 0, ?, 500, 20, 40, 20, 10) RETURNING id""",
				Long.class, name, "p-" + UUID.randomUUID(), onHand, active);
		products.add(id);
		return id;
	}

	private MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder request, String body) {
		return request.header("X-Requested-With", "XMLHttpRequest").contentType(MediaType.APPLICATION_JSON).content(body);
	}

	private String place(long productId, int qty, String phone, String extraFields) throws Exception {
		String body = mvc.perform(json(post("/api/orders"), """
				{"idempotencyKey":"u-%s","customerName":"Khách Test","phone":"%s","provinceCode":1,"wardCode":4,
				 "addressLine":"1 Phố","items":[{"productId":%d,"quantity":%d}]%s}"""
				.formatted(UUID.randomUUID(), phone, productId, qty, extraFields)))
				.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
		Matcher m = Pattern.compile("\"code\":\"([A-Z0-9]+)\"").matcher(body);
		assertThat(m.find()).isTrue();
		return m.group(1);
	}

	private int reserved(long id) {
		return jdbc.queryForObject("SELECT reserved FROM products WHERE id = ?", Integer.class, id);
	}

	// Lead 13: an inactive (draft/discontinued) product must not leak its name/slug through the public validate endpoint.
	@Test
	void validateDoesNotRevealInactiveProductMetadata() throws Exception {
		long id = product("Draft Secret Product", false, 10);
		mvc.perform(json(post("/api/cart/validate"), "{\"items\":[{\"productId\":" + id + ",\"quantity\":1}]}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[0].status").value("UNAVAILABLE"))
			.andExpect(jsonPath("$.items[0].name").value(org.hamcrest.Matchers.not("Draft Secret Product")))
			.andExpect(jsonPath("$.items[0].slug").value(org.hamcrest.Matchers.nullValue()));
	}

	// Lead 10: a PENDING order older than the expiry window is auto-cancelled and its reserved stock is released.
	@Test
	void stalePendingOrdersAreCancelledAndStockReleased() throws Exception {
		long id = product("Stock Holder", true, 5);
		String code = place(id, 2, "0912345678", "");
		assertThat(reserved(id)).isEqualTo(2);

		jdbc.update("UPDATE orders SET created_at = now() - interval '2 days' WHERE code = ?", code);
		orderService.expireStalePendingOrders();

		assertThat(jdbc.queryForObject("SELECT status FROM orders WHERE code = ?", String.class, code)).isEqualTo("CANCELLED");
		assertThat(reserved(id)).as("reserved stock released on auto-cancel").isEqualTo(0);
	}

	// Leads 11/12: a Turnstile token is optional, but when present it is verified and can block the order.
	@Test
	void optionalTurnstileTokenIsVerifiedWhenPresent() throws Exception {
		long id = product("Token Product", true, 10);
		Mockito.doThrow(new ApiException(HttpStatus.BAD_REQUEST, TurnstileVerifier.FAILED_CODE, "bad"))
			.when(turnstile).verify(eq("bad-token"), any());

		mvc.perform(json(post("/api/orders"), """
				{"idempotencyKey":"u-%s","customerName":"Khách Test","phone":"0912345678","provinceCode":1,"wardCode":4,
				 "addressLine":"1 Phố","turnstileToken":"bad-token","items":[{"productId":%d,"quantity":1}]}"""
				.formatted(UUID.randomUUID(), id))).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value(TurnstileVerifier.FAILED_CODE));

		// No token → order is created and the verifier is never called for it.
		place(id, 1, "0912345679", "");
		Mockito.verify(turnstile).verify(eq("bad-token"), any());
		Mockito.verifyNoMoreInteractions(turnstile);
	}
}
