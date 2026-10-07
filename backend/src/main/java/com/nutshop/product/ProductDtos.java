package com.nutshop.product;

import java.math.BigDecimal;

public final class ProductDtos {

	private ProductDtos() {
	}

	public record CategoryResponse(Long id, String name, String slug) {

		static CategoryResponse from(Category c) {
			return new CategoryResponse(c.getId(), c.getName(), c.getSlug());
		}
	}

	/**
	 * @param maxPurchasable how many one shopper can put in the cart now: min(on hand - reserved, per-item cap)
	 */
	public record ProductSummary(Long id, String name, String slug, Long price, Integer weightGrams,
			String imageUrl, BigDecimal calories, BigDecimal protein, boolean inStock, int maxPurchasable,
			CategoryResponse category) {

		static ProductSummary from(Product p, int maxQtyPerItem) {
			int max = Math.min(p.availableQuantity(), maxQtyPerItem);
			return new ProductSummary(p.getId(), p.getName(), p.getSlug(), p.getPrice(), p.getWeightGrams(),
					p.getImageUrl(), p.getCalories(), p.getProtein(), max > 0, max,
					CategoryResponse.from(p.getCategory()));
		}
	}

	public record Nutrition(BigDecimal calories, BigDecimal protein, BigDecimal fat, BigDecimal carbs,
			BigDecimal fiber) {
	}

	/**
	 * @param active false when discontinued (page stays reachable, cannot be bought)
	 * @param availableQuantity on hand - reserved
	 * @param maxPurchasable min(availableQuantity, per-item cart cap)
	 */
	public record ProductDetail(Long id, String name, String slug, String description, String origin, Long price,
			Integer weightGrams, boolean active, int availableQuantity, int maxPurchasable, String imageUrl,
			Nutrition nutritionPer100g, CategoryResponse category) {

		static ProductDetail from(Product p, int maxQtyPerItem) {
			return new ProductDetail(p.getId(), p.getName(), p.getSlug(), p.getDescription(), p.getOrigin(),
					p.getPrice(), p.getWeightGrams(), p.isActive(), p.availableQuantity(),
					p.isActive() ? Math.min(p.availableQuantity(), maxQtyPerItem) : 0, p.getImageUrl(),
					new Nutrition(p.getCalories(), p.getProtein(), p.getFat(), p.getCarbs(), p.getFiber()),
					CategoryResponse.from(p.getCategory()));
		}
	}
}
