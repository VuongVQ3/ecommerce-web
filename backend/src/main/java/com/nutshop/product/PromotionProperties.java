package com.nutshop.product;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Limits for sale prices, matching the shop's reading of the Vietnamese promotion rules (check the regulations in
 * force before running a campaign). Change them in application.properties if the rules change.
 *
 * @param maxDiscountPercent largest allowed discount, in % of the regular price
 * @param maxDaysPerYear total days a product may be on sale per calendar year (Vietnam time)
 */
@ConfigurationProperties(prefix = "promotion")
public record PromotionProperties(int maxDiscountPercent, int maxDaysPerYear) {

	public PromotionProperties {
		if (maxDiscountPercent <= 0 || maxDiscountPercent >= 100) {
			throw new IllegalArgumentException("promotion.max-discount-percent must be between 1 and 99");
		}
		if (maxDaysPerYear <= 0 || maxDaysPerYear > 366) {
			throw new IllegalArgumentException("promotion.max-days-per-year must be between 1 and 366");
		}
	}
}
