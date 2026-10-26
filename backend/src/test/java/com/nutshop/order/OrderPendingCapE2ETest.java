package com.nutshop.order;

import com.nutshop.IntegrationTest;
import com.nutshop.security.RateLimiter;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * run-2 lead 10 (abuse control): one phone can hold only a bounded number of unconfirmed PENDING orders, so an
 * anonymous actor cannot pin stock with an unlimited pile of fake orders. The cap is set low for this context; a
 * fresh phone is used so earlier tests sharing the container do not affect the count.
 */
@IntegrationTest
@TestPropertySource(properties = "app.orders.max-open-pending-per-phone=2")
class OrderPendingCapE2ETest {

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcTemplate jdbc;

	@Autowired
	List<RateLimiter> limiters;

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

	private MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder request, String body) {
		return request.header("X-Requested-With", "XMLHttpRequest").contentType(MediaType.APPLICATION_JSON).content(body);
	}

	@Test
	void aPhoneCannotPileUpUnlimitedPendingOrders() throws Exception {
		Long id = jdbc.queryForObject("""
				INSERT INTO products (category_id, name, slug, description, price, weight_grams, on_hand, reserved, active,
				                      calories, protein, fat, carbs, fiber)
				VALUES (1, 'Cap Product', ?, 'Test', 100000, 500, 100, 0, true, 500, 20, 40, 20, 10) RETURNING id""",
				Long.class, "cap-" + UUID.randomUUID());
		products.add(id);
		String phone = "0938" + (100000 + (int) (Math.random() * 800000)); // a fresh number for this test

		for (int i = 0; i < 2; i++) {
			mvc.perform(order(id, phone)).andExpect(status().isCreated());
		}
		mvc.perform(order(id, phone)).andExpect(status().isTooManyRequests())
			.andExpect(jsonPath("$.code").value("TOO_MANY_PENDING_ORDERS"));
	}

	private MockHttpServletRequestBuilder order(long productId, String phone) {
		return json(post("/api/orders"), """
				{"idempotencyKey":"u-%s","customerName":"Khách Test","phone":"%s","provinceCode":1,"wardCode":4,
				 "addressLine":"1 Phố","items":[{"productId":%d,"quantity":1}]}"""
				.formatted(UUID.randomUUID(), phone, productId));
	}
}
