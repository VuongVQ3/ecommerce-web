package com.nutshop.notify;

import com.nutshop.IntegrationTest;
import com.nutshop.security.RateLimiter;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
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
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Telegram alerts to the shop after a new order and after a customer cancels (sender mocked, real stack). */
@IntegrationTest
class OrderTelegramAlertsE2ETest {

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcTemplate jdbc;

	@Autowired
	List<RateLimiter> limiters;

	@MockitoBean
	TelegramNotifier telegram;

	private final List<Long> createdProducts = new ArrayList<>();

	@BeforeEach
	void setUp() {
		limiters.forEach(RateLimiter::reset);
		when(telegram.enabled()).thenReturn(true);
	}

	@AfterEach
	void cleanUp() {
		for (Long id : createdProducts) {
			jdbc.update("DELETE FROM orders WHERE id IN (SELECT order_id FROM order_items WHERE product_id = ?)", id);
			jdbc.update("DELETE FROM inventory_movements WHERE product_id = ?", id);
			jdbc.update("DELETE FROM products WHERE id = ?", id);
		}
	}

	private long product(String name, long price) {
		Long id = jdbc.queryForObject("""
				INSERT INTO products (category_id, name, slug, description, price, weight_grams, on_hand, reserved, active,
				                      calories, protein, fat, carbs, fiber)
				VALUES (1, ?, ?, 'Sản phẩm test', ?, 500, 50, 0, true, 500, 20, 40, 20, 10)
				RETURNING id""", Long.class, name, "tg-test-" + UUID.randomUUID(), price);
		createdProducts.add(id);
		return id;
	}

	private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder request, String body) {
		return request.header("X-Requested-With", "XMLHttpRequest").contentType(MediaType.APPLICATION_JSON).content(body);
	}

	private static String field(String json, String name) {
		Matcher m = Pattern.compile("\"" + name + "\":\"([^\"]*)\"").matcher(json);
		return m.find() ? m.group(1) : null;
	}

	@Test
	void newOrderThenCustomerCancelAlertTheShop() throws Exception {
		StringBuilder items = new StringBuilder();
		for (int i = 1; i <= 7; i++) {
			// The name needs escaping in Telegram HTML
			long id = product("Hạt <số " + i + "> & mix", 100_000);
			items.append(i > 1 ? "," : "").append("{\"productId\":").append(id).append(",\"quantity\":").append(i).append('}');
		}
		String body = mvc.perform(json(post("/api/orders"), """
				{"idempotencyKey":"tg-%s","customerName":"Nguyễn Khách","phone":"0912345678",
				 "provinceCode":1,"wardCode":4,"addressLine":"12 Phố Test","items":[%s]}"""
			.formatted(UUID.randomUUID(), items))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
		String code = field(body, "code");
		String token = field(body, "accessToken");

		ArgumentCaptor<String> sent = ArgumentCaptor.forClass(String.class);
		verify(telegram, timeout(5000)).send(sent.capture());
		String placed = sent.getValue();
		assertThat(placed).startsWith("🛒 <b>Đơn mới #" + code + "</b>\n👤 Nguyễn Khách – 0912345678\n📍 ")
			.contains("- Hạt &lt;số 1&gt; &amp; mix x1\n")
			.doesNotContain("số 6")
			.contains("+2 món khác\n")
			.endsWith("</b> – COD\n🔗 http://localhost:8080/admin/don-hang/" + code);
		// 1..7 × 100.000₫ + shipping (free above the threshold)
		long total = jdbc.queryForObject("SELECT total FROM orders WHERE code = ?", Long.class, code);
		assertThat(placed).contains("💰 <b>" + OrderTelegramAlerts.price(total) + "</b>");
		assertThat(OrderTelegramAlerts.price(2_800_000)).isEqualTo("2.800.000₫");

		mvc.perform(json(post("/api/orders/track/" + code + "/cancel").param("t", token),
				"{\"reasonCode\":\"OTHER\",\"reason\":\"Đặt <nhầm>\"}")).andExpect(status().isOk());
		verify(telegram, timeout(5000).times(2)).send(sent.capture());
		assertThat(sent.getValue()).isEqualTo("❌ <b>Khách huỷ đơn #" + code
				+ "</b> – lý do: Lý do khác – Đặt &lt;nhầm&gt;\n🔗 http://localhost:8080/admin/don-hang/" + code);
	}

	@Test
	void escapesTelegramHtml() {
		assertThat(TelegramNotifier.escape("a & <b> c")).isEqualTo("a &amp; &lt;b&gt; c");
		assertThat(TelegramNotifier.escape(null)).isEmpty();
	}
}
