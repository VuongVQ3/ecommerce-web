package com.nutshop.cart;

import com.nutshop.IntegrationTest;
import com.nutshop.auth.AuthCookies;
import com.nutshop.security.RateLimiter;
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

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Cart API against PostgreSQL. Each test creates its own products and removes them afterwards. */
@IntegrationTest
class CartE2ETest {

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcTemplate jdbc;

	@Autowired
	RateLimiter authRateLimiter;

	private final List<Long> createdProducts = new ArrayList<>();

	private Cookie session;

	@BeforeEach
	void signIn() throws Exception {
		authRateLimiter.reset();
		session = mvc.perform(ajax(post("/api/auth/register")).contentType(MediaType.APPLICATION_JSON)
				.content(RegisterJson.of("Người Mua", "cart-" + UUID.randomUUID() + "@example.com", "matkhau123")))
			.andExpect(status().isCreated())
			.andReturn()
			.getResponse()
			.getCookie(AuthCookies.ACCESS_COOKIE);
	}

	@AfterEach
	void removeTestProducts() {
		for (Long id : createdProducts) {
			jdbc.update("DELETE FROM cart_items WHERE product_id = ?", id);
			jdbc.update("DELETE FROM products WHERE id = ?", id);
		}
	}

	// ---- helpers --------------------------------------------------------------------------------------------

	private long product(long price, int onHand, int reserved, boolean active) {
		Long id = jdbc.queryForObject("""
				INSERT INTO products (category_id, name, slug, description, price, weight_grams, on_hand, reserved, active,
				                      calories, protein, fat, carbs, fiber)
				VALUES ((SELECT id FROM categories WHERE slug = 'hat-dinh-duong'), ?, ?, 'Sản phẩm test', ?, 250, ?, ?, ?,
				        500, 20, 40, 20, 10)
				RETURNING id""", Long.class, "Hạt test " + price, "test-" + UUID.randomUUID(), price, onHand, reserved,
				active);
		createdProducts.add(id);
		return id;
	}

	private long product(long price, int onHand) {
		return product(price, onHand, 0, true);
	}

	private static MockHttpServletRequestBuilder ajax(MockHttpServletRequestBuilder request) {
		return request.header("X-Requested-With", "XMLHttpRequest");
	}

	private ResultActions send(MockHttpServletRequestBuilder request, String json) throws Exception {
		return mvc.perform(ajax(request).cookie(session).contentType(MediaType.APPLICATION_JSON).content(json));
	}

	private ResultActions add(long productId, int quantity) throws Exception {
		return send(post("/api/cart/items"), "{\"productId\":" + productId + ",\"quantity\":" + quantity + "}");
	}

	private ResultActions getCart() throws Exception {
		return mvc.perform(get("/api/cart").cookie(session));
	}

	// ---- tests ----------------------------------------------------------------------------------------------

	@Test
	void addingMoreThanAvailableIsCappedWithAWarning() throws Exception {
		long id = product(185_000, 3);

		add(id, 5).andExpect(status().isOk())
			.andExpect(jsonPath("$.cart.items[0].quantity").value(3))
			.andExpect(jsonPath("$.warning.code").value("QTY_LIMITED"))
			.andExpect(jsonPath("$.warning.message").value("Chỉ còn 3 sản phẩm"))
			.andExpect(jsonPath("$.warning.limitedTo").value(3));

		// Adding again cannot go past the limit either
		add(id, 1).andExpect(jsonPath("$.cart.items[0].quantity").value(3)).andExpect(jsonPath("$.warning.limitedTo").value(3));
	}

	@Test
	void quantityIsAlsoCappedByTheConfiguredPerItemMaximum() throws Exception {
		long id = product(10_000, 500);

		add(id, 4).andExpect(jsonPath("$.warning").doesNotExist());
		add(id, 9).andExpect(jsonPath("$.cart.items[0].quantity").value(10))
			.andExpect(jsonPath("$.warning.limitedTo").value(10));
	}

	@Test
	void unknownDiscontinuedAndSoldOutProductsAreRejectedWithCodes() throws Exception {
		add(987_654_321L, 1).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("PRODUCT_NOT_FOUND"))
			.andExpect(jsonPath("$.message").value("Không tìm thấy sản phẩm"));
		add(product(50_000, 10, 0, false), 1).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("PRODUCT_UNAVAILABLE"))
			.andExpect(jsonPath("$.message").exists());
		// on hand 2 but both reserved by orders: nothing left to buy
		add(product(50_000, 2, 2, true), 1).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("OUT_OF_STOCK"));
	}

	@Test
	void parallelAddsOfTheSameProductMakeOneLineWithTheRightQuantity() throws Exception {
		long id = product(20_000, 100);
		int threads = 8;
		ExecutorService pool = Executors.newFixedThreadPool(threads);
		CountDownLatch start = new CountDownLatch(1);
		List<Future<Integer>> results = new ArrayList<>();
		for (int i = 0; i < threads; i++) {
			Callable<Integer> call = () -> {
				start.await();
				return add(id, 1).andReturn().getResponse().getStatus();
			};
			results.add(pool.submit(call));
		}
		start.countDown();
		for (Future<Integer> result : results) {
			assertThat(result.get()).isEqualTo(200);
		}
		pool.shutdown();

		Integer rows = jdbc.queryForObject("SELECT count(*) FROM cart_items WHERE product_id = ?", Integer.class, id);
		Integer quantity = jdbc.queryForObject("SELECT quantity FROM cart_items WHERE product_id = ?", Integer.class, id);
		assertThat(rows).isEqualTo(1);
		assertThat(quantity).isEqualTo(threads);
	}

	@Test
	void priceChangeAfterAddingIsReportedWithTheNewPrice() throws Exception {
		long id = product(185_000, 20);
		add(id, 2);
		jdbc.update("UPDATE products SET price = 199000 WHERE id = ?", id);

		getCart().andExpect(status().isOk())
			.andExpect(jsonPath("$.items[0].status").value("PRICE_CHANGED"))
			.andExpect(jsonPath("$.items[0].price").value(199_000))
			.andExpect(jsonPath("$.items[0].priceAtAdd").value(185_000))
			.andExpect(jsonPath("$.items[0].lineTotal").value(398_000))
			.andExpect(jsonPath("$.subtotal").value(398_000));
	}

	@Test
	void pricesSentByTheClientAreIgnored() throws Exception {
		long id = product(150_000, 20);

		send(post("/api/cart/items"), "{\"productId\":" + id + ",\"quantity\":2,\"price\":1,\"lineTotal\":2}")
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.cart.items[0].price").value(150_000))
			.andExpect(jsonPath("$.cart.items[0].priceAtAdd").value(150_000))
			.andExpect(jsonPath("$.cart.items[0].lineTotal").value(300_000));
		send(post("/api/cart/validate"), "{\"items\":[{\"productId\":" + id + ",\"quantity\":1,\"price\":1}]}")
			.andExpect(jsonPath("$.items[0].price").value(150_000));
	}

	@Test
	void stockDroppingBelowTheCartQuantityIsReportedAndBlocksNothingButOutOfStockDoes() throws Exception {
		long reduced = product(100_000, 10);
		long soldOut = product(100_000, 10);
		add(reduced, 5);
		add(soldOut, 1);
		jdbc.update("UPDATE products SET on_hand = 2 WHERE id = ?", reduced);
		jdbc.update("UPDATE products SET reserved = on_hand WHERE id = ?", soldOut);

		getCart().andExpect(jsonPath("$.items[0].status").value("QTY_REDUCED"))
			.andExpect(jsonPath("$.items[0].quantity").value(2))
			.andExpect(jsonPath("$.items[0].requestedQuantity").value(5))
			.andExpect(jsonPath("$.items[1].status").value("OUT_OF_STOCK"))
			.andExpect(jsonPath("$.items[1].lineTotal").value(0))
			.andExpect(jsonPath("$.subtotal").value(200_000))
			.andExpect(jsonPath("$.canCheckout").value(false));

		jdbc.update("UPDATE products SET active = false WHERE id = ?", reduced);
		getCart().andExpect(jsonPath("$.items[0].status").value("UNAVAILABLE"));
	}

	@Test
	void shippingIsFreeFromTheThreshold() throws Exception {
		long id = product(120_000, 50);

		add(id, 2).andExpect(jsonPath("$.cart.subtotal").value(240_000))
			.andExpect(jsonPath("$.cart.shippingFee").value(30_000))
			.andExpect(jsonPath("$.cart.amountToFreeShipping").value(260_000))
			.andExpect(jsonPath("$.cart.total").value(270_000))
			.andExpect(jsonPath("$.cart.canCheckout").value(true));
		add(id, 3).andExpect(jsonPath("$.cart.subtotal").value(600_000))
			.andExpect(jsonPath("$.cart.shippingFee").value(0))
			.andExpect(jsonPath("$.cart.amountToFreeShipping").value(0))
			.andExpect(jsonPath("$.cart.total").value(600_000));
	}

	@Test
	void setQuantityRemoveAndClear() throws Exception {
		long a = product(10_000, 50);
		long b = product(20_000, 50);
		add(a, 1);
		add(b, 1);

		send(patch("/api/cart/items/" + a), "{\"quantity\":4}").andExpect(jsonPath("$.cart.items[0].quantity").value(4));
		send(patch("/api/cart/items/" + a), "{\"quantity\":0}").andExpect(jsonPath("$.cart.items", hasSize(1)));
		send(patch("/api/cart/items/" + b), "{\"quantity\":-1}").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors.quantity").value("Số lượng không được âm"));
		mvc.perform(ajax(delete("/api/cart/items/" + b)).cookie(session)).andExpect(jsonPath("$.items", hasSize(0)));

		add(a, 2);
		mvc.perform(ajax(delete("/api/cart")).cookie(session)).andExpect(jsonPath("$.items", hasSize(0)));
		getCart().andExpect(jsonPath("$.items", hasSize(0))).andExpect(jsonPath("$.canCheckout").value(false));
	}

	@Test
	void mergeAddsUpCapsSkipsInvalidAndIsIdempotent() throws Exception {
		long a = product(50_000, 6);
		long b = product(80_000, 50);
		long discontinued = product(10_000, 5, 0, false);
		add(a, 2);
		String body = "{\"mergeKey\":\"guest-" + UUID.randomUUID() + "\",\"items\":[{\"productId\":" + a
				+ ",\"quantity\":5},{\"productId\":" + b + ",\"quantity\":3},{\"productId\":" + discontinued
				+ ",\"quantity\":1},{\"productId\":987654321,\"quantity\":1}]}";

		send(post("/api/cart/merge"), body).andExpect(status().isOk())
			.andExpect(jsonPath("$.alreadyMerged").value(false))
			.andExpect(jsonPath("$.cart.items[0].quantity").value(6)) // 2 + 5, capped at 6 in stock
			.andExpect(jsonPath("$.cart.items[1].quantity").value(3))
			.andExpect(jsonPath("$.cart.items", hasSize(2)))
			.andExpect(jsonPath("$.skipped", hasSize(2)))
			.andExpect(jsonPath("$.skipped[0].code").value("PRODUCT_UNAVAILABLE"))
			.andExpect(jsonPath("$.skipped[1].code").value("PRODUCT_NOT_FOUND"));

		// Retrying the same merge (e.g. the response was lost) must not add again
		jdbc.update("UPDATE products SET on_hand = 50 WHERE id = ?", a);
		send(post("/api/cart/merge"), body).andExpect(jsonPath("$.alreadyMerged").value(true))
			.andExpect(jsonPath("$.cart.items[0].quantity").value(6))
			.andExpect(jsonPath("$.cart.items[1].quantity").value(3));
	}

	@Test
	void guestValidationIsPublicAndUsesTheSameShape() throws Exception {
		long ok = product(90_000, 20);
		long soldOut = product(90_000, 3, 3, true);

		mvc.perform(ajax(post("/api/cart/validate")).contentType(MediaType.APPLICATION_JSON)
				.content("{\"items\":[{\"productId\":" + ok + ",\"quantity\":2},{\"productId\":" + soldOut
						+ ",\"quantity\":1},{\"productId\":" + ok + ",\"quantity\":1}]}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items", hasSize(2))) // duplicate lines are added up
			.andExpect(jsonPath("$.items[0].quantity").value(3))
			.andExpect(jsonPath("$.items[0].priceAtAdd").doesNotExist())
			.andExpect(jsonPath("$.items[1].status").value("OUT_OF_STOCK"))
			.andExpect(jsonPath("$.subtotal").value(270_000))
			.andExpect(jsonPath("$.canCheckout").value(false));

		StringBuilder tooMany = new StringBuilder("{\"items\":[");
		for (int i = 0; i < 51; i++) {
			tooMany.append(i == 0 ? "" : ",").append("{\"productId\":").append(ok).append(",\"quantity\":1}");
		}
		mvc.perform(ajax(post("/api/cart/validate")).contentType(MediaType.APPLICATION_JSON)
				.content(tooMany.append("]}").toString()))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors.items").value("Giỏ hàng tối đa 50 sản phẩm"));
	}

	@Test
	void cartEndpointsOtherThanValidateRequireSignIn() throws Exception {
		mvc.perform(get("/api/cart")).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.message").exists());
		mvc.perform(ajax(post("/api/cart/items")).contentType(MediaType.APPLICATION_JSON)
				.content("{\"productId\":1,\"quantity\":1}")).andExpect(status().isUnauthorized());
	}

	@Test
	void catalogueHidesDiscontinuedProductsButTheirPageStaysReachable() throws Exception {
		long id = product(10_000, 5, 0, false);
		String slug = jdbc.queryForObject("SELECT slug FROM products WHERE id = ?", String.class, id);

		mvc.perform(get("/api/products").param("q", "Hạt test 10000"))
			.andExpect(jsonPath("$.items", hasSize(0)));
		mvc.perform(get("/api/products/" + slug))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.active").value(false))
			.andExpect(jsonPath("$.maxPurchasable").value(0));
	}
}
