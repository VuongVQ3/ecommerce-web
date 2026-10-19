package com.nutshop;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The real catalogue (V17) and the public catalogue API. Products made here live in their own category. */
@IntegrationTest
class BackendApplicationTests {

	private static final List<String> SAMPLE_SLUGS = List.of("hanh-nhan-rang-moc", "nhan-oc-cho-vang", "hat-macca-nut-vo",
			"hat-dieu-rang-moc", "hat-de-cuoi-khong-muoi", "hat-phi-tach-vo", "hat-chia-uc", "hat-lanh-vang",
			"hat-bi-xanh-tach-vo", "hat-diem-mach-3-mau", "hat-huong-duong-tach-vo", "hat-mix-5-loai",
			"granola-an-kieng-khong-duong");

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcTemplate jdbc;

	private final List<Long> categories = new ArrayList<>();

	@AfterEach
	void cleanUp() {
		for (Long id : categories) {
			jdbc.update("DELETE FROM products WHERE category_id = ?", id);
			jdbc.update("DELETE FROM categories WHERE id = ?", id);
		}
	}

	private String category() {
		String slug = "test-cat-" + UUID.randomUUID();
		categories.add(jdbc.queryForObject("INSERT INTO categories (name, slug) VALUES ('Danh mục test', ?) RETURNING id",
				Long.class, slug));
		return slug;
	}

	/** On sale (priced), with nutrition when protein/calories are given. */
	private String product(String categorySlug, String name, int sortOrder, BigDecimal protein, BigDecimal calories) {
		String slug = "test-" + UUID.randomUUID();
		boolean nutrition = protein != null;
		jdbc.update("""
				INSERT INTO products (category_id, name, slug, description, price, weight_grams, on_hand, reserved, active,
				                      calories, protein, fat, carbs, fiber, sort_order)
				VALUES ((SELECT id FROM categories WHERE slug = ?), ?, ?, 'Mô tả', 150000, 500, 10, 0, true, ?, ?, ?, ?, ?, ?)""",
				categorySlug, name, slug, calories, protein, nutrition ? BigDecimal.TEN : null,
				nutrition ? BigDecimal.TEN : null, nutrition ? BigDecimal.ONE : null, sortOrder);
		return slug;
	}

	@Test
	void theRealCatalogueIsInPlaceHiddenUntilPriced() {
		List<Map<String, Object>> real = jdbc.queryForList("""
				SELECT p.slug, p.active, p.weight_grams, p.price, p.on_hand, p.sort_order, p.calories, p.origin, c.slug AS category
				FROM products p JOIN categories c ON c.id = p.category_id
				WHERE p.slug IN ('mac-ca-size-22-25', 'hat-dieu-a-co-rang-muoi-xep-hoa', 'ngu-coc-hat-dinh-duong',
				                 'thanh-gao-lut-cha-bong', 'mat-ong-hoa-ca-phe')
				ORDER BY p.sort_order""");
		assertThat(real).extracting(r -> r.get("slug") + "@" + r.get("category") + "#" + r.get("sort_order"))
			.containsExactly("mac-ca-size-22-25@hat-dinh-duong#1", "hat-dieu-a-co-rang-muoi-xep-hoa@hat-dinh-duong#6",
					"ngu-coc-hat-dinh-duong@hat-mix-ngu-coc#15", "thanh-gao-lut-cha-bong@banh-thanh-hat#18",
					"mat-ong-hoa-ca-phe@trai-cay-say-dac-san#25");
		assertThat(jdbc.queryForObject("""
				SELECT COUNT(*) FROM products
				WHERE sort_order BETWEEN 1 AND 25 AND weight_grams = 500 AND NOT active AND price = 0 AND on_hand = 0
				  AND calories IS NULL AND origin IS NULL AND image_url IS NULL""", Integer.class)).isEqualTo(25);
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM products WHERE active AND slug = ANY (?)", Integer.class,
				(Object) SAMPLE_SLUGS.toArray(String[]::new))).isZero();
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM products WHERE slug = ANY (?)", Integer.class,
				(Object) SAMPLE_SLUGS.toArray(String[]::new))).isEqualTo(13);

		assertThat(jdbc.queryForList("SELECT slug || '=' || name FROM categories WHERE id <= 5 ORDER BY id", String.class))
			.containsExactly("hat-dinh-duong=Hạt dinh dưỡng", "hat-sieu-thuc-pham=Hạt siêu thực phẩm",
					"hat-mix-ngu-coc=Hạt mix & ngũ cốc", "banh-thanh-hat=Bánh & thanh hạt",
					"trai-cay-say-dac-san=Trái cây sấy & đặc sản");
		// A product cannot be on sale without a price
		org.assertj.core.api.Assertions
			.assertThatThrownBy(() -> jdbc.update("UPDATE products SET active = true WHERE slug = 'bot-ca-cao'"))
			.hasMessageContaining("products_price_when_active");
	}

	@Test
	void theStorefrontListsOnlyCategoriesWithSomethingOnSale() throws Exception {
		String withProduct = category();
		String empty = category();
		product(withProduct, "Mắc ca thử", 1, null, null);
		mvc.perform(get("/api/categories"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$[*].slug", hasItem(withProduct)))
			.andExpect(jsonPath("$[*].slug", not(hasItem(empty))))
			// Only hidden products there (old samples, real catalogue not priced yet)
			.andExpect(jsonPath("$[*].slug", not(hasItem("hat-sieu-thuc-pham"))))
			.andExpect(jsonPath("$[*].slug", not(hasItem("banh-thanh-hat"))));
	}

	@Test
	void filtersByCategoryAndSearchInTheShopsOrder() throws Exception {
		String cat = category();
		String second = product(cat, "Hạt điều thử", 2, null, null);
		String first = product(cat, "Mắc ca thử", 1, null, null);
		mvc.perform(get("/api/products").param("category", cat))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.totalItems").value(2))
			.andExpect(jsonPath("$.items[0].slug").value(first))
			.andExpect(jsonPath("$.items[1].slug").value(second));
		mvc.perform(get("/api/products").param("category", cat).param("q", "MẮC CA"))
			.andExpect(jsonPath("$.items", hasSize(1)))
			.andExpect(jsonPath("$.items[0].slug").value(first));
	}

	@Test
	void productDetailHasNutritionOnlyWhenKnown() throws Exception {
		String cat = category();
		String known = product(cat, "Hạnh nhân thử", 1, new BigDecimal("21.2"), new BigDecimal("579"));
		String unknown = product(cat, "Mật ong thử", 2, null, null);
		mvc.perform(get("/api/products/" + known))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.nutritionPer100g.protein").value(21.2))
			.andExpect(jsonPath("$.category.slug").value(cat));
		mvc.perform(get("/api/products/" + unknown))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.nutritionPer100g").isEmpty())
			.andExpect(jsonPath("$.weightGrams").value(500));
		mvc.perform(get("/api/products").param("category", cat).param("q", "Mật ong"))
			.andExpect(jsonPath("$.items[0].protein").isEmpty())
			.andExpect(jsonPath("$.items[0].calories").isEmpty());
		mvc.perform(get("/api/products/khong-ton-tai")).andExpect(status().isNotFound());
		// Hidden: the 25 real products are not on the storefront yet
		mvc.perform(get("/api/products/mac-ca-size-22-25")).andExpect(status().isNotFound());
	}

	@Test
	void nutritionSortsPutProductsWithoutFiguresLast() throws Exception {
		String cat = category();
		String none = product(cat, "Không số liệu", 1, null, null);
		String low = product(cat, "Ít protein", 2, new BigDecimal("5"), new BigDecimal("300"));
		String high = product(cat, "Nhiều protein", 3, new BigDecimal("25"), new BigDecimal("600"));
		mvc.perform(get("/api/products").param("category", cat).param("sort", "protein_desc"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[*].slug").value(org.hamcrest.Matchers.contains(high, low, none)));
		mvc.perform(get("/api/products").param("category", cat).param("sort", "calories_asc"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[*].slug").value(org.hamcrest.Matchers.contains(low, high, none)));
	}

	@Test
	void publicEndpointsIgnoreAStaleAccessCookie() throws Exception {
		mvc.perform(get("/api/products").cookie(new jakarta.servlet.http.Cookie("access_token", "garbage")))
			.andExpect(status().isOk());
	}
}
