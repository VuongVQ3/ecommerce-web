package com.nutshop.product;

import com.nutshop.audit.AuditLog;
import com.nutshop.common.ApiException;
import com.nutshop.product.ProductPromotion.Status;
import com.nutshop.product.PromotionService.PromotionRow;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.invocation.Invocation;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.TimeZone;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockingDetails;

/**
 * PromotionService rules with a controlled clock and an in-memory store that answers like the repository queries
 * (half-open periods, cancelled ones ignored). The database side (exclusion constraint) is in PromotionE2ETest.
 */
class PromotionServiceTest {

	/** 05/11/2026 16:25:49 in Vietnam: when promotion 229.000₫ was ended early on production */
	private static final Instant ENDED_AT = Instant.parse("2026-11-05T09:25:49Z");

	private static final long PRODUCT_ID = 29L;

	private static final UUID ADMIN = UUID.randomUUID();

	private final TestClock clock = new TestClock(ENDED_AT);

	private final List<ProductPromotion> store = new ArrayList<>();

	private final JdbcTemplate jdbc = mock(JdbcTemplate.class);

	private PromotionService service;

	private static Instant vn(String date) {
		return LocalDate.parse(date).atStartOfDay(PricingService.VIETNAM).toInstant();
	}

	/** Render runs in UTC; this machine runs in UTC+7, which would hide a day computed in the JVM's zone. */
	private static final TimeZone MACHINE_ZONE = TimeZone.getDefault();

	@AfterEach
	void restoreZone() {
		TimeZone.setDefault(MACHINE_ZONE);
	}

	@BeforeEach
	void setUp() {
		TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
		ProductPromotionRepository promotions = mock(ProductPromotionRepository.class);
		given(promotions.findById(any())).willAnswer(i -> store.stream().filter(p -> p.getId().equals(i.getArgument(0))).findFirst());
		given(promotions.saveAndFlush(any())).willAnswer(i -> {
			ProductPromotion p = i.getArgument(0);
			ReflectionTestUtils.setField(p, "id", UUID.randomUUID());
			store.add(p);
			return p;
		});
		// Same WHERE as the JPQL: active, same product, startsAt < to AND endsAt > from
		given(promotions.findActiveBetween(anyLong(), any(), any())).willAnswer(i -> {
			Long productId = i.getArgument(0);
			Instant from = i.getArgument(1);
			Instant to = i.getArgument(2);
			return store.stream()
				.filter(p -> p.isActive() && p.getProductId().equals(productId) && p.getStartsAt().isBefore(to)
						&& p.getEndsAt().isAfter(from))
				.toList();
		});

		Product product = new Product(null, "mac-ca", new Product.Details("Mắc ca size 22-25", null, "Mô tả", null,
				new Product.LabelInfo(null, null, null), 269_000, 500, BigDecimal.TEN, BigDecimal.TEN, BigDecimal.TEN,
				BigDecimal.TEN, BigDecimal.TEN, 10, null));
		ReflectionTestUtils.setField(product, "id", PRODUCT_ID);
		ProductRepository products = mock(ProductRepository.class);
		given(products.lockById(PRODUCT_ID)).willReturn(Optional.of(product));
		given(products.findById(PRODUCT_ID)).willReturn(Optional.of(product));
		given(products.findAll(any(Sort.class))).willReturn(List.of(product));
		given(products.findByIdIn(any())).willReturn(List.of(product));
		given(promotions.findAllByOrderByStartsAtDesc()).willAnswer(i -> List.copyOf(store));

		PricingService pricing = new PricingService(promotions, clock);
		AuditLog audit = new AuditLog(jdbc, JsonMapper.builder().build());
		service = new PromotionService(promotions, products, new PromotionProperties(50, 120), pricing, audit,
				mock(PlatformTransactionManager.class));
	}

	/** Inserts a promotion as if created earlier (bypasses the rules, e.g. to start it in the past). */
	private ProductPromotion existing(long salePrice, Instant start, Instant end) {
		ProductPromotion p = new ProductPromotion(PRODUCT_ID, salePrice, start, end, ADMIN, start);
		ReflectionTestUtils.setField(p, "id", UUID.randomUUID());
		store.add(p);
		return p;
	}

	private static String code(Throwable ex) {
		return ((ApiException) ex).getCode();
	}

	/** The audit rows written, as [action, before, after] */
	private List<String[]> auditRows() {
		List<String[]> rows = new ArrayList<>();
		for (Invocation call : mockingDetails(jdbc).getInvocations()) {
			Object[] args = call.getArguments();
			if (call.getMethod().getName().equals("update") && args[0].toString().contains("audit_logs")) {
				rows.add(new String[] { (String) args[3], (String) args[7], (String) args[8] });
			}
		}
		return rows;
	}

	// ---- bug: ended early, then started again the same day ---------------------------------------------------------

	@Test
	void endedEarlyThenANewPromotionFromTodayStartsRightNow() {
		ProductPromotion old = existing(229_000, Instant.parse("2026-11-03T07:31:38Z"), vn("2026-12-01"));
		service.end(old.getId(), ADMIN);
		assertThat(old.getEndsAt()).isEqualTo(ENDED_AT);

		clock.advance(90);
		// The form sends the first day as its midnight in Vietnam (05/11 00:00 = 04/11 17:00 UTC)
		PromotionRow created = service.create(PRODUCT_ID, 219_000, vn("2026-11-05"), vn("2026-11-11"), ADMIN);
		assertThat(created.startsAt()).isEqualTo(clock.instant()).isAfterOrEqualTo(ENDED_AT);
		assertThat(created.status()).isEqualTo(Status.RUNNING);
	}

	@Test
	void aPromotionFromTodayCanStartTheVeryInstantTheOtherOneEnded() {
		ProductPromotion old = existing(229_000, Instant.parse("2026-11-03T07:31:38Z"), vn("2026-12-01"));
		service.end(old.getId(), ADMIN);
		// No time passes: [.., T) and [T, ..) touch, they do not overlap
		PromotionRow created = service.create(PRODUCT_ID, 219_000, vn("2026-11-05"), vn("2026-11-11"), ADMIN);
		assertThat(created.startsAt()).isEqualTo(ENDED_AT);
	}

	@Test
	void startsAndEndsSetToNowKeepTheDatabasePrecisionSoTheStartCanBeSentBack() {
		ProductPromotion old = existing(229_000, Instant.parse("2026-11-03T07:31:38Z"), vn("2026-12-01"));
		clock.set(ENDED_AT.plusNanos(123_456_789));
		service.end(old.getId(), ADMIN);
		assertThat(old.getEndsAt()).isEqualTo(ENDED_AT.plusNanos(123_456_000));

		clock.set(ENDED_AT.plusNanos(123_456_900));
		PromotionRow created = service.create(PRODUCT_ID, 219_000, vn("2026-11-05"), vn("2026-11-11"), ADMIN);
		// Same microsecond as the end: touching, not overlapping, and exactly what Postgres stores
		assertThat(created.startsAt()).isEqualTo(old.getEndsAt());
		// The client sends back the start it was given (or a nanosecond reading of it): still "unchanged"
		assertThat(service.update(created.id(), 209_000, created.startsAt(), vn("2026-11-11"), ADMIN).salePrice()).isEqualTo(209_000);
		assertThat(service.update(created.id(), 199_000, created.startsAt().plusNanos(400), vn("2026-11-11"), ADMIN).salePrice()).isEqualTo(199_000);
	}

	@Test
	void bulkFromTodayStartsRightNowToo() {
		ProductPromotion old = existing(229_000, Instant.parse("2026-11-03T07:31:38Z"), vn("2026-12-01"));
		service.end(old.getId(), ADMIN);
		clock.advance(60);
		var results = service.createBulk(List.of(PRODUCT_ID), 20, vn("2026-11-05"), vn("2026-11-11"), ADMIN);
		assertThat(results).singleElement().satisfies(r -> assertThat(r.ok()).as(r.message()).isTrue());
		assertThat(store.getLast().getStartsAt()).isEqualTo(clock.instant());
	}

	@Test
	void movingAnUpcomingPromotionToTodayStartsItRightNow() {
		ProductPromotion old = existing(229_000, Instant.parse("2026-11-03T07:31:38Z"), vn("2026-12-01"));
		service.end(old.getId(), ADMIN);
		ProductPromotion upcoming = existing(219_000, vn("2026-11-07"), vn("2026-11-11"));
		clock.advance(60);
		PromotionRow row = service.update(upcoming.getId(), 219_000, vn("2026-11-05"), vn("2026-11-11"), ADMIN);
		assertThat(row.startsAt()).isEqualTo(clock.instant());
		assertThat(row.status()).isEqualTo(Status.RUNNING);
	}

	@Test
	void aLaterFirstDayStartsAtItsMidnightInVietnam() {
		Instant afternoon = vn("2026-11-08").plus(15, ChronoUnit.HOURS);
		PromotionRow row = service.create(PRODUCT_ID, 219_000, afternoon, vn("2026-11-11"), ADMIN);
		assertThat(row.startsAt()).isEqualTo(vn("2026-11-08")).hasToString("2026-11-07T17:00:00Z");
	}

	// ---- time zone: "today" is the Vietnam day, whatever the server's zone -----------------------------------------

	@Test
	void at0130InVietnamTodayIsAlreadyTheNextDayWhileUtcIsStillTheDayBefore() {
		// 2026-11-05T18:30Z = 06/11 01:30 in Vietnam (still 05/11 in UTC, the server's zone)
		Instant now = Instant.parse("2026-11-05T18:30:00Z");
		clock.set(now);
		// The form sends 06/11 as its midnight in Vietnam: 2026-11-05T17:00Z
		PromotionRow row = service.create(PRODUCT_ID, 219_000, vn("2026-11-06"), vn("2026-11-11"), ADMIN);
		assertThat(row.startsAt()).isEqualTo(now);
		assertThat(row.status()).isEqualTo(Status.RUNNING);
		assertThat(PromotionService.startOf(vn("2026-11-06"), now)).isEqualTo(now);
		// 05/11 is yesterday in Vietnam
		assertThatThrownBy(() -> service.create(PRODUCT_ID, 219_000, vn("2026-11-05"), vn("2026-11-12"), ADMIN))
			.satisfies(ex -> assertThat(code(ex)).isEqualTo("INVALID_PERIOD"))
			.hasMessageContaining("quá khứ");
		// 07/11 is a later day: its midnight in Vietnam
		assertThat(PromotionService.startOf(vn("2026-11-07"), now)).isEqualTo(vn("2026-11-07"));
	}

	@Test
	void theYearAndItsDaysFollowVietnamAtNewYear() {
		// 2026-12-31T18:00Z = 01/01/2027 01:00 in Vietnam
		clock.set(Instant.parse("2026-12-31T18:00:00Z"));
		PromotionRow row = service.create(PRODUCT_ID, 219_000, vn("2027-01-01"), vn("2027-01-04"), ADMIN);
		assertThat(row.productDaysThisYear()).isEqualTo(3);
		assertThat(service.usage(null).year()).isEqualTo(2027);
		assertThat(service.daysUsed(PRODUCT_ID, 2026, null)).isZero();
	}

	@Test
	void aFirstDayInThePastIsRefused() {
		assertThatThrownBy(() -> service.create(PRODUCT_ID, 219_000, vn("2026-11-04"), vn("2026-11-11"), ADMIN))
			.satisfies(ex -> assertThat(code(ex)).isEqualTo("INVALID_PERIOD"))
			.hasMessageContaining("quá khứ");
	}

	// ---- overlaps ---------------------------------------------------------------------------------------------------

	@Test
	void touchingPeriodsDoNotOverlap() {
		existing(229_000, vn("2026-12-01"), vn("2026-12-05"));
		PromotionRow next = service.create(PRODUCT_ID, 219_000, vn("2026-12-05"), vn("2026-12-10"), ADMIN);
		assertThat(next.startsAt()).isEqualTo(vn("2026-12-05"));
		// And the other way round: one ending exactly when an existing one starts
		PromotionRow before = service.create(PRODUCT_ID, 219_000, vn("2026-11-25"), vn("2026-12-01"), ADMIN);
		assertThat(before.endsAt()).isEqualTo(vn("2026-12-01"));

		assertThat(PromotionService.overlaps(vn("2026-12-01"), vn("2026-12-05"), vn("2026-12-05"), vn("2026-12-10"))).isFalse();
		assertThat(PromotionService.overlaps(vn("2026-12-05"), vn("2026-12-10"), vn("2026-12-01"), vn("2026-12-05"))).isFalse();
	}

	@Test
	void realOverlapsAreRefused() {
		existing(229_000, vn("2026-12-01"), vn("2026-12-05"));
		assertThatThrownBy(() -> service.create(PRODUCT_ID, 219_000, vn("2026-12-04"), vn("2026-12-10"), ADMIN))
			.satisfies(ex -> assertThat(code(ex)).isEqualTo("PROMOTION_OVERLAP"))
			.hasMessageContaining("229.000₫ (01/12/2026 – 04/12/2026)");
		// Inside it
		assertThatThrownBy(() -> service.create(PRODUCT_ID, 219_000, vn("2026-12-02"), vn("2026-12-03"), ADMIN))
			.satisfies(ex -> assertThat(code(ex)).isEqualTo("PROMOTION_OVERLAP"));
		assertThat(PromotionService.overlaps(vn("2026-12-01"), vn("2026-12-05"), vn("2026-12-04"), vn("2026-12-10"))).isTrue();
	}

	@Test
	void anUpcomingPromotionDoesNotOverlapItselfWhenEdited() {
		ProductPromotion upcoming = existing(229_000, vn("2026-12-01"), vn("2026-12-05"));
		PromotionRow row = service.update(upcoming.getId(), 219_000, vn("2026-12-02"), vn("2026-12-06"), ADMIN);
		assertThat(row.salePrice()).isEqualTo(219_000);
	}

	// ---- editing a running promotion ---------------------------------------------------------------------------------

	@Test
	void aRunningPromotionsPriceAndLastDayCanChange() {
		Instant start = Instant.parse("2026-11-03T07:31:38Z");
		ProductPromotion running = existing(229_000, start, vn("2026-11-10"));

		PromotionRow row = service.update(running.getId(), 199_000, start, vn("2026-11-15"), ADMIN);
		assertThat(row.status()).isEqualTo(Status.RUNNING);
		assertThat(row.salePrice()).isEqualTo(199_000);
		assertThat(row.startsAt()).isEqualTo(start);
		assertThat(row.endsAt()).isEqualTo(vn("2026-11-15"));

		// Audit: only what changed, old → new
		assertThat(auditRows()).singleElement().satisfies(r -> {
			assertThat(r[0]).isEqualTo("PROMOTION_UPDATED");
			assertThat(r[1]).contains("\"salePrice\":229000").contains("\"endsAt\":\"2026-11-09T17:00:00Z\"").doesNotContain("startsAt");
			assertThat(r[2]).contains("\"salePrice\":199000").contains("\"endsAt\":\"2026-11-14T17:00:00Z\"");
		});
	}

	@Test
	void aRunningPromotionKeepsTheSameRulesAsANewOne() {
		Instant start = Instant.parse("2026-11-03T07:31:38Z");
		ProductPromotion running = existing(229_000, start, vn("2026-11-10"));
		// 269.000₫ → 134.000₫ is 50.2% off
		assertThatThrownBy(() -> service.update(running.getId(), 134_000, start, vn("2026-11-10"), ADMIN))
			.satisfies(ex -> assertThat(code(ex)).isEqualTo("DISCOUNT_TOO_LARGE"));
		assertThatThrownBy(() -> service.update(running.getId(), 229_500, start, vn("2026-11-10"), ADMIN))
			.satisfies(ex -> assertThat(code(ex)).isEqualTo("INVALID_SALE_PRICE"));
		assertThatThrownBy(() -> service.update(running.getId(), 269_000, start, vn("2026-11-10"), ADMIN))
			.satisfies(ex -> assertThat(code(ex)).isEqualTo("INVALID_SALE_PRICE"));
		// Ending in the past (or right now)
		assertThatThrownBy(() -> service.update(running.getId(), 229_000, start, ENDED_AT.minusSeconds(60), ADMIN))
			.satisfies(ex -> assertThat(code(ex)).isEqualTo("INVALID_PERIOD"));
		assertThatThrownBy(() -> service.update(running.getId(), 229_000, start, ENDED_AT, ADMIN))
			.satisfies(ex -> assertThat(code(ex)).isEqualTo("INVALID_PERIOD"));
		// Running into the next promotion
		existing(219_000, vn("2026-11-20"), vn("2026-11-25"));
		assertThatThrownBy(() -> service.update(running.getId(), 229_000, start, vn("2026-11-21"), ADMIN))
			.satisfies(ex -> assertThat(code(ex)).isEqualTo("PROMOTION_OVERLAP"));
		assertThat(running.getSalePrice()).isEqualTo(229_000);
		assertThat(running.getEndsAt()).isEqualTo(vn("2026-11-10"));
	}

	@Test
	void aRunningPromotionsStartCannotChange() {
		Instant start = Instant.parse("2026-11-03T07:31:38Z");
		ProductPromotion running = existing(229_000, start, vn("2026-11-10"));
		for (Instant other : new Instant[] { vn("2026-11-03"), vn("2026-11-05"), vn("2026-11-06") }) {
			assertThatThrownBy(() -> service.update(running.getId(), 219_000, other, vn("2026-11-10"), ADMIN))
				.satisfies(ex -> assertThat(code(ex)).isEqualTo("PROMOTION_START_LOCKED"));
		}
		assertThat(running.getStartsAt()).isEqualTo(start);
		assertThat(running.getSalePrice()).isEqualTo(229_000);
	}

	@Test
	void aRunningPromotionCannotBeStretchedPastTheYearlyLimit() {
		// From 1/9, 120 days means the last day can be 29/12 at most
		Instant start = vn("2026-09-01");
		ProductPromotion running = existing(229_000, start, vn("2026-11-10"));
		assertThat(service.update(running.getId(), 229_000, start, vn("2026-12-30"), ADMIN).productDaysThisYear()).isEqualTo(120);
		assertThatThrownBy(() -> service.update(running.getId(), 229_000, start, vn("2026-12-31"), ADMIN))
			.satisfies(ex -> assertThat(code(ex)).isEqualTo("TOO_MANY_DAYS"))
			.hasMessageContaining("thêm 121 ngày");
	}

	@Test
	void endedAndCancelledPromotionsCannotBeEdited() {
		ProductPromotion ended = existing(229_000, vn("2026-10-01"), vn("2026-10-10"));
		ProductPromotion cancelled = existing(229_000, vn("2026-12-01"), vn("2026-12-05"));
		service.end(cancelled.getId(), ADMIN);
		for (ProductPromotion p : List.of(ended, cancelled)) {
			assertThatThrownBy(() -> service.update(p.getId(), 219_000, p.getStartsAt(), vn("2026-12-20"), ADMIN))
				.satisfies(ex -> assertThat(code(ex)).isEqualTo("PROMOTION_NOT_EDITABLE"));
		}
	}

	// ---- promotion days ---------------------------------------------------------------------------------------------

	@Test
	void daysOfAPromotionEndedEarlyStopWhenItReallyEnded() {
		ProductPromotion old = existing(229_000, Instant.parse("2026-11-03T07:31:38Z"), vn("2026-12-01"));
		assertThat(service.daysUsed(PRODUCT_ID, 2026, null)).isEqualTo(28);

		PromotionRow ended = service.end(old.getId(), ADMIN);
		// 03, 04, 05/11: not the 28 days first planned
		assertThat(ended.productDaysThisYear()).isEqualTo(3);
		assertThat(service.usage(2026).products()).singleElement().satisfies(p -> assertThat(p.daysUsed()).isEqualTo(3));

		// Starting again today: 05/11 is counted once, so 03 → 10/11 = 8 days
		clock.advance(60);
		PromotionRow next = service.create(PRODUCT_ID, 219_000, vn("2026-11-05"), vn("2026-11-11"), ADMIN);
		assertThat(next.productDaysThisYear()).isEqualTo(8);
		assertThat(service.list(null)).hasSize(2).allSatisfy(r -> assertThat(r.productDaysThisYear()).isEqualTo(8));
	}

	@Test
	void theYearlyLimitCountsASharedDayOnce() {
		// 03/11 → 05/11 16:25 (ended early) = 3 days; a new one 05/11 → 30/12 adds 55 days (06/11 → 30/12), not 56
		existing(229_000, Instant.parse("2026-11-03T07:31:38Z"), ENDED_AT);
		existing(229_000, vn("2026-03-01"), vn("2026-05-02")); // 62 days → 65 used
		clock.advance(60);
		// 65 + 55 = 120: up to 30/12 fits
		assertThat(service.create(PRODUCT_ID, 219_000, vn("2026-11-05"), vn("2026-12-31"), ADMIN).productDaysThisYear()).isEqualTo(120);
	}

	private static final class TestClock extends Clock {

		private Instant now;

		TestClock(Instant now) {
			this.now = now;
		}

		void set(Instant instant) {
			now = instant;
		}

		void advance(long seconds) {
			now = now.plusSeconds(seconds);
		}

		@Override
		public Instant instant() {
			return now;
		}

		@Override
		public ZoneId getZone() {
			return ZoneOffset.UTC;
		}

		@Override
		public Clock withZone(ZoneId zone) {
			return this;
		}
	}
}
