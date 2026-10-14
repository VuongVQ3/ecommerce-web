package com.nutshop.product;

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

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Sale prices end to end: rules, the single pricing source, carts, orders and the admin API. */
@IntegrationTest
class PromotionE2ETest {

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcTemplate jdbc;

	@Autowired
	ProductPromotionRepository promotions;

	@Autowired
	PricingService pricing;

	@Autowired
	ProductRepository productRepository;

	@Autowired
	UserRepository users;

	@Autowired
	TokenService tokens;

	@Autowired
	List<RateLimiter> limiters;

	private final List<Long> created = new ArrayList<>();

	@BeforeEach
	void reset() {
		limiters.forEach(RateLimiter::reset);
	}

	@AfterEach
	void cleanUp() {
		for (Long id : created) {
			jdbc.update("DELETE FROM product_promotions WHERE product_id = ?", id);
			jdbc.update("DELETE FROM orders WHERE id IN (SELECT order_id FROM order_items WHERE product_id = ?)", id);
			jdbc.update("DELETE FROM inventory_movements WHERE product_id = ?", id);
			jdbc.update("DELETE FROM cart_items WHERE product_id = ?", id);
			jdbc.update("DELETE FROM products WHERE id = ?", id);
		}
	}

	// ---- helpers --------------------------------------------------------------------------------------------

	private long product(long price) {
		Long id = jdbc.queryForObject("""
				INSERT INTO products (category_id, name, slug, description, price, weight_grams, on_hand, reserved, active,
				                      calories, protein, fat, carbs, fiber)
				VALUES (1, ?, ?, 'Sản phẩm test', ?, 500, 50, 0, true, 500, 20, 40, 20, 10)
				RETURNING id""", Long.class, "Hạt KM " + price, "km-test-" + UUID.randomUUID(), price);
		created.add(id);
		return id;
	}

	private static Instant vn(String date) {
		return LocalDate.parse(date).atStartOfDay(PricingService.VIETNAM).toInstant();
	}

	/** Inserts a promotion directly (bypasses the admin rules, e.g. to start it in the past). */
	private void promo(long productId, long salePrice, Instant start, Instant end) {
		jdbc.update("INSERT INTO product_promotions (product_id, sale_price, starts_at, ends_at) VALUES (?, ?, ?, ?)",
				productId, salePrice, Timestamp.from(start), Timestamp.from(end));
	}

	private Cookie as(String role) throws Exception {
		String email = role.toLowerCase() + "-km-" + UUID.randomUUID() + "@example.com";
		mvc.perform(json(post("/api/auth/register"), RegisterJson.of("Người " + role, email, "matkhau123")))
			.andExpect(status().isCreated());
		jdbc.update("UPDATE users SET role = ? WHERE email = ?", role, email);
		return new Cookie(AuthCookies.ACCESS_COOKIE, tokens.issueAccessToken(users.findByEmail(email).orElseThrow()));
	}

	private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder request, String body) {
		return request.header("X-Requested-With", "XMLHttpRequest").contentType(MediaType.APPLICATION_JSON).content(body);
	}

	private ResultActions create(Cookie admin, long productId, long salePrice, Instant start, Instant end) throws Exception {
		return mvc.perform(json(post("/api/admin/promotions"), """
				{"productId":%d,"salePrice":%d,"startsAt":"%s","endsAt":"%s"}""".formatted(productId, salePrice, start, end))
			.cookie(admin));
	}

	private static String field(String json, String name) {
		Matcher m = Pattern.compile("\"" + name + "\":\"?([^\",}]*)").matcher(json);
		return m.find() ? m.group(1) : null;
	}

	// ---- the single price source ----------------------------------------------------------------------------

	@Test
	void promotionAppliesFromStartUntilJustBeforeEnd() {
		long id = product(189_000);
		Instant start = vn("2026-11-01");
		Instant end = vn("2026-11-08");
		promo(id, 132_000, start, end);

		assertThat(promotions.findRunning(List.of(id), start.minusNanos(1000))).isEmpty();
		assertThat(promotions.findRunning(List.of(id), start)).singleElement()
			.satisfies(p -> assertThat(p.getSalePrice()).isEqualTo(132_000));
		assertThat(promotions.findRunning(List.of(id), end.minusNanos(1000))).hasSize(1);
		assertThat(promotions.findRunning(List.of(id), end)).isEmpty();
		// 1/11 00:00 in Vietnam is still 31/10 in UTC
		assertThat(start.toString()).isEqualTo("2026-10-31T17:00:00Z");
	}

	@Test
	void publicApiShowsCurrentPriceAndSortsByIt() throws Exception {
		long onSale = product(189_000);
		long regular = product(150_000);
		promo(onSale, 100_000, Instant.now().minus(1, ChronoUnit.HOURS), Instant.now().plus(2, ChronoUnit.DAYS));
		String slug = jdbc.queryForObject("SELECT slug FROM products WHERE id = ?", String.class, onSale);

		mvc.perform(get("/api/products/" + slug))
			.andExpect(jsonPath("$.price").value(100_000))
			.andExpect(jsonPath("$.regularPrice").value(189_000))
			.andExpect(jsonPath("$.discountPercent").value(47))
			.andExpect(jsonPath("$.promotionEndsAt").isString());
		String other = jdbc.queryForObject("SELECT slug FROM products WHERE id = ?", String.class, regular);
		mvc.perform(get("/api/products/" + other))
			.andExpect(jsonPath("$.price").value(150_000))
			.andExpect(jsonPath("$.regularPrice").value(150_000))
			.andExpect(jsonPath("$.discountPercent").doesNotExist());

		// Price sort uses the discounted price: 100k (regular 189k) comes before 150k
		String asc = mvc.perform(get("/api/products?q=Hạt KM&sort=price_asc&size=48")).andReturn().getResponse().getContentAsString();
		assertThat(asc.indexOf("\"id\":" + onSale)).isLessThan(asc.indexOf("\"id\":" + regular));
		String desc = mvc.perform(get("/api/products?q=Hạt KM&sort=price_desc&size=48")).andReturn().getResponse().getContentAsString();
		assertThat(desc.indexOf("\"id\":" + regular)).isLessThan(desc.indexOf("\"id\":" + onSale));
		// The server-rendered product page uses it too
		assertThat(mvc.perform(get("/san-pham/" + slug)).andReturn().getResponse().getContentAsString())
			.contains("– 100.000₫ | Hạt Lành").contains("\"price\":100000").contains("priceValidUntil");
	}

	@Test
	void ordersChargeTheSalePriceAndRememberTheRegularOne() throws Exception {
		long id = product(189_000);
		promo(id, 132_000, Instant.now().minus(1, ChronoUnit.HOURS), Instant.now().plus(1, ChronoUnit.DAYS));
		// A forged client price is ignored: lines carry ids and quantities only
		String body = """
				{"idempotencyKey":"km-%s","customerName":"Khách KM","phone":"0912345678","provinceCode":1,"wardCode":4,
				 "addressLine":"1 Phố KM","items":[{"productId":%d,"quantity":2,"price":1000,"unitPrice":1000}],"total":1}"""
			.formatted(UUID.randomUUID(), id);
		mvc.perform(json(post("/api/orders"), body))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.items[0].unitPrice").value(132_000))
			.andExpect(jsonPath("$.items[0].regularUnitPrice").value(189_000))
			.andExpect(jsonPath("$.subtotal").value(264_000));
		Map<String, Object> line = jdbc.queryForMap(
				"SELECT unit_price, regular_unit_price, line_total FROM order_items WHERE product_id = ?", id);
		assertThat(line).containsEntry("unit_price", 132_000L).containsEntry("regular_unit_price", 189_000L)
			.containsEntry("line_total", 264_000L);
	}

	@Test
	void cartShowsTheDiscountAndFlagsAPriceChangeWhenThePromotionEnds() throws Exception {
		long id = product(189_000);
		Cookie buyer = as("CUSTOMER");
		promo(id, 132_000, Instant.now().minus(1, ChronoUnit.HOURS), Instant.now().plus(1, ChronoUnit.DAYS));
		mvc.perform(json(post("/api/cart/items"), "{\"productId\":" + id + ",\"quantity\":2}").cookie(buyer))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.cart.items[0].price").value(132_000))
			.andExpect(jsonPath("$.cart.items[0].regularPrice").value(189_000))
			.andExpect(jsonPath("$.cart.items[0].status").value("OK"))
			.andExpect(jsonPath("$.cart.subtotal").value(264_000))
			.andExpect(jsonPath("$.cart.discountTotal").value(114_000));
		// Guest carts are priced the same way
		mvc.perform(json(post("/api/cart/validate"), "{\"items\":[{\"productId\":" + id + ",\"quantity\":1}]}"))
			.andExpect(jsonPath("$.items[0].price").value(132_000))
			.andExpect(jsonPath("$.discountTotal").value(57_000));

		jdbc.update("UPDATE product_promotions SET ends_at = now() - interval '1 minute' WHERE product_id = ?", id);
		mvc.perform(get("/api/cart").cookie(buyer))
			.andExpect(jsonPath("$.items[0].price").value(189_000))
			.andExpect(jsonPath("$.items[0].regularPrice").doesNotExist())
			.andExpect(jsonPath("$.items[0].status").value("PRICE_CHANGED"))
			.andExpect(jsonPath("$.discountTotal").value(0));
	}

	// ---- admin rules ----------------------------------------------------------------------------------------

	@Test
	void rejectsTooBigDiscountsOverlapsAndTooManyDaysPerYear() throws Exception {
		Cookie admin = as("ADMIN");
		long id = product(189_000);

		create(admin, id, 94_000, vn("2027-01-01"), vn("2027-01-10")).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("DISCOUNT_TOO_LARGE"))
			.andExpect(jsonPath("$.detail", containsString("50%")))
			.andExpect(jsonPath("$.detail", containsString("95.000₫")));
		create(admin, id, 189_000, vn("2027-01-01"), vn("2027-01-10")).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_SALE_PRICE"));
		create(admin, id, 150_500, vn("2027-01-01"), vn("2027-01-10")).andExpect(status().isBadRequest());
		create(admin, id, 150_000, vn("2027-01-10"), vn("2027-01-01")).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_PERIOD"));

		// 1/1 → 10/4/2027 = 100 days
		create(admin, id, 150_000, vn("2027-01-01"), vn("2027-04-11")).andExpect(status().isCreated())
			.andExpect(jsonPath("$.discountPercent").value(21))
			.andExpect(jsonPath("$.status").value("UPCOMING"));
		create(admin, id, 150_000, vn("2027-04-01"), vn("2027-04-20")).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("PROMOTION_OVERLAP"));
		// +31 days in May = 131 > 120
		create(admin, id, 150_000, vn("2027-05-01"), vn("2027-06-01")).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("TOO_MANY_DAYS"))
			.andExpect(jsonPath("$.detail", containsString("100 ngày")))
			.andExpect(jsonPath("$.detail", containsString("120 ngày/năm")));
		// +20 days fits exactly
		create(admin, id, 150_000, vn("2027-05-01"), vn("2027-05-21")).andExpect(status().isCreated());
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_logs WHERE action = 'PROMOTION_CREATED' AND entity_id = ?",
				Integer.class, String.valueOf(id))).isEqualTo(2);
	}

	@Test
	void bulkThirtyPercentOffRoundsDownAndReportsEachProduct() throws Exception {
		Cookie admin = as("ADMIN");
		long a = product(189_000);
		long b = product(249_000);
		long busy = product(120_000);
		promo(busy, 100_000, vn("2027-02-01"), vn("2027-02-10"));

		mvc.perform(json(post("/api/admin/promotions/bulk"), """
				{"productIds":[%d,%d,%d],"percentOff":30,"startsAt":"%s","endsAt":"%s"}"""
			.formatted(a, b, busy, vn("2027-02-01"), vn("2027-02-15"))).cookie(admin))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$[0].ok").value(true))
			.andExpect(jsonPath("$[0].salePrice").value(132_000))
			.andExpect(jsonPath("$[1].salePrice").value(174_000))
			.andExpect(jsonPath("$[2].ok").value(false))
			.andExpect(jsonPath("$[2].code").value("PROMOTION_OVERLAP"));
		assertThat(jdbc.queryForObject("SELECT sale_price FROM product_promotions WHERE product_id = ?", Long.class, a))
			.isEqualTo(132_000);
	}

	@Test
	void regularPriceCannotDropToTheSalePriceAndPromotionsCanBeEndedOrCancelled() throws Exception {
		Cookie admin = as("ADMIN");
		long id = product(189_000);
		promo(id, 132_000, Instant.now().minus(1, ChronoUnit.HOURS), Instant.now().plus(3, ChronoUnit.DAYS));
		String promoId = jdbc.queryForObject("SELECT id::text FROM product_promotions WHERE product_id = ?", String.class, id);

		String product = """
				{"name":"Hạt KM 189000","categoryId":1,"description":"Sản phẩm test","price":%d,"weightGrams":500,
				 "calories":500,"protein":20,"fat":40,"carbs":20,"fiber":10,"lowStockThreshold":10}""";
		mvc.perform(json(put("/api/admin/products/" + id), product.formatted(132_000)).cookie(admin))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("PROMOTION_PRICE_CONFLICT"));
		assertThat(jdbc.queryForObject("SELECT price FROM products WHERE id = ?", Long.class, id)).isEqualTo(189_000);
		mvc.perform(json(put("/api/admin/products/" + id), product.formatted(199_000)).cookie(admin))
			.andExpect(status().isOk());

		// Running: only ending early is allowed
		mvc.perform(json(put("/api/admin/promotions/" + promoId), """
				{"productId":%d,"salePrice":120000,"startsAt":"%s","endsAt":"%s"}""".formatted(id, vn("2027-03-01"), vn("2027-03-05")))
			.cookie(admin)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PROMOTION_NOT_EDITABLE"));
		mvc.perform(json(post("/api/admin/promotions/" + promoId + "/end"), "").cookie(admin))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("ENDED"));
		assertThat(pricing.priceOf(productRepository.findById(id).orElseThrow()).price()).isEqualTo(199_000);
		mvc.perform(json(post("/api/admin/promotions/" + promoId + "/end"), "").cookie(admin))
			.andExpect(status().isConflict());

		// Upcoming: editable, and "end" cancels it
		String upcoming = create(admin, id, 150_000, vn("2027-03-01"), vn("2027-03-05")).andReturn().getResponse().getContentAsString();
		String upcomingId = field(upcoming, "id");
		mvc.perform(json(put("/api/admin/promotions/" + upcomingId), """
				{"productId":%d,"salePrice":140000,"startsAt":"%s","endsAt":"%s"}""".formatted(id, vn("2027-03-02"), vn("2027-03-06")))
			.cookie(admin)).andExpect(status().isOk()).andExpect(jsonPath("$.salePrice").value(140_000));
		mvc.perform(json(post("/api/admin/promotions/" + upcomingId + "/end"), "").cookie(admin))
			.andExpect(jsonPath("$.status").value("CANCELLED"));
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_logs WHERE action IN ('PROMOTION_ENDED','PROMOTION_CANCELLED','PROMOTION_UPDATED') AND entity_id = ?",
				Integer.class, String.valueOf(id))).isEqualTo(3);
	}

	@Test
	void onlyAdminsManagePromotions() throws Exception {
		Cookie staff = as("STAFF");
		mvc.perform(get("/api/admin/promotions").cookie(staff)).andExpect(status().isForbidden());
		create(staff, product(189_000), 150_000, vn("2027-01-01"), vn("2027-01-10")).andExpect(status().isForbidden());
		mvc.perform(get("/api/admin/promotions/usage").cookie(as("ADMIN")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.maxDaysPerYear").value(120))
			.andExpect(jsonPath("$.maxDiscountPercent").value(50));
	}
}
