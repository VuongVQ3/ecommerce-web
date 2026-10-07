package com.nutshop;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
class BackendApplicationTests {

	@Autowired
	MockMvc mvc;

	@Test
	void listsSeededCategoriesAndProducts() throws Exception {
		mvc.perform(get("/api/categories"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$", hasSize(3)));

		mvc.perform(get("/api/products").param("size", "5"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items", hasSize(5)))
			.andExpect(jsonPath("$.totalItems").value(13));
	}

	@Test
	void filtersProductsByCategoryAndSearch() throws Exception {
		mvc.perform(get("/api/products").param("category", "hat-sieu-thuc-pham"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.totalItems").value(5));

		mvc.perform(get("/api/products").param("q", "HẠT CHIA"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items", hasSize(1)))
			.andExpect(jsonPath("$.items[0].slug").value("hat-chia-uc"));

		mvc.perform(get("/api/products").param("category", "hat-dinh-duong").param("q", "hạt").param("sort", "price_asc"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.totalItems").value(4));
	}

	@Test
	void returnsProductDetailOr404() throws Exception {
		mvc.perform(get("/api/products/hanh-nhan-rang-moc"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.nutritionPer100g.protein").value(21.2))
			.andExpect(jsonPath("$.category.slug").value("hat-dinh-duong"));

		mvc.perform(get("/api/products/khong-ton-tai")).andExpect(status().isNotFound());
	}

	@Test
	void publicEndpointsIgnoreAStaleAccessCookie() throws Exception {
		mvc.perform(get("/api/products").cookie(new jakarta.servlet.http.Cookie("access_token", "garbage")))
			.andExpect(status().isOk());
	}
}
