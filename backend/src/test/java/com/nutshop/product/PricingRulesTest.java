package com.nutshop.product;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

class PricingRulesTest {

	private static Instant vn(String date) {
		return LocalDate.parse(date).atStartOfDay(PricingService.VIETNAM).toInstant();
	}

	@Test
	void percentOffRoundsDownToWholeThousands() {
		assertThat(PricingService.salePriceFor(189_000, 30)).isEqualTo(132_000);
		assertThat(PricingService.salePriceFor(249_000, 15)).isEqualTo(211_000);
		assertThat(PricingService.salePriceFor(99_000, 50)).isEqualTo(49_000);
		assertThat(PricingService.discountPercent(189_000, 132_000)).isEqualTo(30);
		assertThat(PricingService.discountPercent(189_000, 150_000)).isEqualTo(21);
	}

	@Test
	void notCheaperMeansNoDiscount() {
		var promo = new ProductPromotion(1L, 200_000, vn("2026-10-01"), vn("2026-11-01"), null, Instant.now());
		var price = PricingService.compute(189_000, promo);
		assertThat(price.price()).isEqualTo(189_000);
		assertThat(price.discountPercent()).isNull();
		assertThat(price.discounted()).isFalse();
	}

	@Test
	void daysCountCalendarDaysInVietnamTime() {
		// 1/10 00:00 → 1/11 00:00 (exclusive end) = the 31 days of October
		assertThat(PromotionService.daysIn(vn("2026-10-01"), vn("2026-11-01"), 2026)).isEqualTo(31);
		// A partly covered day counts: 31/10 23:00 → 1/11 01:00 touches two days
		assertThat(PromotionService.daysIn(vn("2026-10-31").plusSeconds(23 * 3600), vn("2026-11-01").plusSeconds(3600), 2026))
			.isEqualTo(2);
		// Over New Year: counted in each year separately
		assertThat(PromotionService.daysIn(vn("2026-12-25"), vn("2027-01-06"), 2026)).isEqualTo(7);
		assertThat(PromotionService.daysIn(vn("2026-12-25"), vn("2027-01-06"), 2027)).isEqualTo(5);
		assertThat(PromotionService.daysIn(vn("2026-12-25"), vn("2027-01-06"), 2028)).isZero();
	}
}
