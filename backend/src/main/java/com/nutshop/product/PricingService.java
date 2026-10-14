package com.nutshop.product;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * The ONLY place that decides what a product costs right now: the sale price while an active promotion is running,
 * otherwise the regular price. Used by product listings and pages, carts, checkout and orders, so all of them always
 * agree. Promotion periods are absolute instants; Vietnam time only matters for how they are entered and displayed.
 */
@Service
public class PricingService {

	public static final ZoneId VIETNAM = ZoneId.of("Asia/Ho_Chi_Minh");

	/**
	 * @param price what the buyer pays now
	 * @param regularPrice products.price
	 * @param discountPercent rounded, null when not discounted
	 * @param promotionEndsAt null when not discounted
	 */
	public record Price(long price, long regularPrice, Integer discountPercent, Instant promotionEndsAt) {

		public boolean discounted() {
			return price < regularPrice;
		}

		static Price regular(long regularPrice) {
			return new Price(regularPrice, regularPrice, null, null);
		}
	}

	private final ProductPromotionRepository promotions;
	private final Clock clock;

	public PricingService(ProductPromotionRepository promotions, Clock clock) {
		this.promotions = promotions;
		this.clock = clock;
	}

	public Instant now() {
		return clock.instant();
	}

	@Transactional(readOnly = true)
	public Price priceOf(Product product) {
		return pricesOf(List.of(product)).get(product.getId());
	}

	/** One query for any number of products. */
	@Transactional(readOnly = true)
	public Map<Long, Price> pricesOf(Collection<Product> products) {
		if (products.isEmpty()) {
			return Map.of();
		}
		Map<Long, ProductPromotion> running = promotions
			.findRunning(products.stream().map(Product::getId).collect(Collectors.toSet()), clock.instant())
			.stream()
			.collect(Collectors.toMap(ProductPromotion::getProductId, Function.identity(), (a, b) -> a));
		Map<Long, Price> prices = new HashMap<>();
		for (Product p : products) {
			prices.put(p.getId(), compute(p.getPrice(), running.get(p.getId())));
		}
		return prices;
	}

	/** Pure rule, also used to preview a promotion before saving it. */
	static Price compute(long regularPrice, ProductPromotion promotion) {
		// A sale price that is not lower (the regular price was lowered since) never applies
		if (promotion == null || promotion.getSalePrice() >= regularPrice) {
			return Price.regular(regularPrice);
		}
		return new Price(promotion.getSalePrice(), regularPrice, discountPercent(regularPrice, promotion.getSalePrice()),
				promotion.getEndsAt());
	}

	/** Rounded to the nearest whole percent: 189.000 → 132.000 is 30%. */
	public static int discountPercent(long regularPrice, long salePrice) {
		return (int) Math.round((regularPrice - salePrice) * 100.0 / regularPrice);
	}

	/** {@code floor(price × (100 − percent) / 100 / 1000) × 1000}, all in whole đồng. */
	public static long salePriceFor(long regularPrice, int percentOff) {
		return Math.multiplyExact(regularPrice, (long) (100 - percentOff)) / 100 / 1000 * 1000;
	}
}
