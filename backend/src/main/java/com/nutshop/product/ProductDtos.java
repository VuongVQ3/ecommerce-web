package com.nutshop.product;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/**
 * Public product views. They never expose the exact stock: only a stockStatus, with a number only when few are
 * left. maxPurchasable is a "soft" limit for the quantity picker (see {@link #softMax}).
 */
public final class ProductDtos {

	/** At or below this many available units, the storefront says "Chỉ còn N". */
	static final int LOW_STOCK_PUBLIC = 5;

	private ProductDtos() {
	}

	public enum StockLevel {
		IN_STOCK, LOW_STOCK, OUT_OF_STOCK
	}

	/** @param quantity only set for LOW_STOCK */
	public record StockStatus(StockLevel status, Integer quantity) {

		static StockStatus of(Product p) {
			int available = p.isActive() ? p.availableQuantity() : 0;
			if (available <= 0) {
				return new StockStatus(StockLevel.OUT_OF_STOCK, null);
			}
			return available <= LOW_STOCK_PUBLIC ? new StockStatus(StockLevel.LOW_STOCK, available)
					: new StockStatus(StockLevel.IN_STOCK, null);
		}
	}

	/**
	 * Quantity picker limit without revealing stock: the exact number when it is already public (≤ 5 left),
	 * otherwise the per-item cap. The cart still caps to real stock and says "Chỉ còn N" if needed.
	 */
	static int softMax(Product p, int maxQtyPerItem) {
		if (!p.isActive()) {
			return 0;
		}
		int available = p.availableQuantity();
		return available <= LOW_STOCK_PUBLIC ? Math.max(available, 0) : maxQtyPerItem;
	}

	/** One line of the header search suggestions; price = what the buyer pays now (sale price included). */
	public record ProductSuggestion(Long id, String name, String slug, Long price, String imageUrl,
			String categorySlug) {
	}

	/** A storefront category with how many products are on sale in it. */
	public record CategoryListing(Long id, String name, String slug, long productCount) {
	}

	public record CategoryResponse(Long id, String name, String slug) {

		public static CategoryResponse from(Category c) {
			return new CategoryResponse(c.getId(), c.getName(), c.getSlug());
		}
	}

	/**
	 * @param price what the buyer pays now (sale price during a promotion), see PricingService
	 * @param regularPrice the usual price; equal to price when not discounted
	 * @param discountPercent null when not discounted
	 * @param promotionEndsAt null when not discounted
	 * @param shortDescription typed, or derived from the description (see ShortDescription); null when both are blank
	 */
	public record ProductSummary(Long id, String name, String slug, String shortDescription, Long price, Long regularPrice,
			Integer discountPercent, Instant promotionEndsAt, Integer weightGrams, String imageUrl,
			BigDecimal calories, BigDecimal protein, StockStatus stockStatus, int maxPurchasable,
			CategoryResponse category) {

		static ProductSummary from(Product p, int maxQtyPerItem, PricingService.Price price) {
			return new ProductSummary(p.getId(), p.getName(), p.getSlug(), ShortDescription.of(p), price.price(),
					price.regularPrice(), price.discountPercent(), price.promotionEndsAt(), p.getWeightGrams(), p.getImageUrl(),
					p.getCalories(), p.getProtein(), StockStatus.of(p), softMax(p, maxQtyPerItem),
					CategoryResponse.from(p.getCategory()));
		}
	}

	public record Nutrition(BigDecimal calories, BigDecimal protein, BigDecimal fat, BigDecimal carbs,
			BigDecimal fiber) {
	}

	public record ImageResponse(String url, Integer width, Integer height) {
	}

	/**
	 * @param active false when discontinued (page stays reachable, cannot be bought)
	 * @param images primary first; empty = emoji placeholder
	 * @param nutritionPer100g null when not known yet
	 * @param shortDescription typed, or derived from the description (see ShortDescription)
	 */
	public record ProductDetail(Long id, String name, String slug, String shortDescription, String description, String origin, Long price,
			Long regularPrice, Integer discountPercent, Instant promotionEndsAt, Integer weightGrams, boolean active,
			StockStatus stockStatus, int maxPurchasable, String imageUrl, List<ImageResponse> images,
			Nutrition nutritionPer100g, CategoryResponse category,
			/** Set when the request used an old slug: the current one (the page should replace its URL). */
			@JsonInclude(JsonInclude.Include.NON_NULL) String redirectTo) {

		static ProductDetail from(Product p, int maxQtyPerItem, List<ProductImage> images, PricingService.Price price) {
			return new ProductDetail(p.getId(), p.getName(), p.getSlug(), ShortDescription.of(p), p.getDescription(),
					p.getOrigin(), price.price(), price.regularPrice(), price.discountPercent(), price.promotionEndsAt(),
					p.getWeightGrams(), p.isActive(), StockStatus.of(p), softMax(p, maxQtyPerItem),
					p.getImageUrl(),
					images.stream().map(i -> new ImageResponse(i.getUrl(), i.getWidth(), i.getHeight())).toList(),
					// null until the five figures are known: the page then shows no nutrition table
					p.hasNutrition() ? new Nutrition(p.getCalories(), p.getProtein(), p.getFat(), p.getCarbs(), p.getFiber())
							: null,
					CategoryResponse.from(p.getCategory()), null);
		}

		ProductDetail redirectedFrom() {
			return new ProductDetail(id, name, slug, shortDescription, description, origin, price, regularPrice, discountPercent,
					promotionEndsAt, weightGrams, active, stockStatus, maxPurchasable, imageUrl, images, nutritionPer100g,
					category, slug);
		}
	}
}
