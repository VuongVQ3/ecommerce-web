package com.nutshop.product;

import com.nutshop.audit.AuditLog;
import com.nutshop.common.ApiException;
import com.nutshop.product.ProductPromotion.Status;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.text.NumberFormat;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Admin side of sale prices. Every promotion must:
 * <ul>
 * <li>be strictly cheaper than the product's CURRENT regular price, in whole thousands of đồng, and at most
 * {@code promotion.max-discount-percent} off (the percentage is always derived from real prices, never typed);</li>
 * <li>have a start and an end (end after start, end in the future, start not before today). The admin picks days:
 * {@link #startOf} turns the first day into the real start (today = right now, a later day = its midnight in Vietnam),
 * for every way in (create, bulk, update);</li>
 * <li>not overlap another active promotion of the same product, both periods being half-open [startsAt, endsAt):
 * one ending at 16:25 and the next starting at 16:25 do not overlap (also enforced by the database);</li>
 * <li>keep the product's promotion days per calendar year (Vietnam time) within {@code promotion.max-days-per-year}:
 * every calendar day a promotion touches counts once (a day shared by a promotion ended early and the next one is
 * one day), up to the real end of a promotion ended early, and a promotion spanning New Year counts in both years.</li>
 * </ul>
 * Upcoming promotions can be edited or cancelled; running ones can have their price and last day changed (not their
 * start) or be ended early; ended ones are history.
 */
@Service
public class PromotionService {

	private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM/yyyy");
	private static final NumberFormat VND = NumberFormat.getIntegerInstance(Locale.forLanguageTag("vi-VN"));

	public record PromotionRow(UUID id, Long productId, String productName, String productSlug, long regularPrice,
			long salePrice, int discountPercent, Instant startsAt, Instant endsAt, Status status,
			int productDaysThisYear) {
	}

	/** For the admin form: current price and how many promotion days the product already has this year. */
	public record ProductUsage(Long id, String name, long price, boolean active, int daysUsed, Long runningSalePrice) {
	}

	public record UsageResponse(int year, int maxDaysPerYear, int maxDiscountPercent, List<ProductUsage> products) {
	}

	public record BulkResult(Long productId, String productName, boolean ok, Long salePrice, UUID promotionId,
			String code, String message) {
	}

	private record AuditView(Long productId, long salePrice, Instant startsAt, Instant endsAt, boolean active) {

		static AuditView of(ProductPromotion p) {
			return new AuditView(p.getProductId(), p.getSalePrice(), p.getStartsAt(), p.getEndsAt(), p.isActive());
		}
	}

	private final ProductPromotionRepository promotions;
	private final ProductRepository products;
	private final PromotionProperties limits;
	private final PricingService pricing;
	private final AuditLog audit;
	private final TransactionTemplate tx;

	public PromotionService(ProductPromotionRepository promotions, ProductRepository products,
			PromotionProperties limits, PricingService pricing, AuditLog audit, PlatformTransactionManager txManager) {
		this.promotions = promotions;
		this.products = products;
		this.limits = limits;
		this.pricing = pricing;
		this.audit = audit;
		this.tx = new TransactionTemplate(txManager);
	}

	// ---- reading ------------------------------------------------------------------------------------------------

	@Transactional(readOnly = true)
	public List<PromotionRow> list(Status status) {
		Instant now = pricing.now();
		int year = LocalDate.ofInstant(now, PricingService.VIETNAM).getYear();
		List<ProductPromotion> all = promotions.findAllByOrderByStartsAtDesc();
		Map<Long, Product> byId = products.findByIdIn(all.stream().map(ProductPromotion::getProductId).collect(Collectors.toSet()))
			.stream()
			.collect(Collectors.toMap(Product::getId, Function.identity()));
		Map<Long, Integer> daysByProduct = new LinkedHashMap<>();
		List<PromotionRow> rows = new ArrayList<>();
		for (ProductPromotion p : all) {
			Status s = p.status(now);
			if (status != null && s != status) {
				continue;
			}
			Product product = byId.get(p.getProductId());
			int days = daysByProduct.computeIfAbsent(p.getProductId(), id -> daysUsed(id, year, null));
			rows.add(new PromotionRow(p.getId(), p.getProductId(), product.getName(), product.getSlug(), product.getPrice(),
					p.getSalePrice(), PricingService.discountPercent(product.getPrice(), p.getSalePrice()), p.getStartsAt(),
					p.getEndsAt(), s, days));
		}
		// Running, then upcoming (soonest first), then ended and cancelled (most recent first)
		Map<Status, Integer> rank = Map.of(Status.RUNNING, 0, Status.UPCOMING, 1, Status.ENDED, 2, Status.CANCELLED, 3);
		Comparator<PromotionRow> byStart = Comparator.comparing(PromotionRow::startsAt);
		rows.sort(Comparator.comparing((PromotionRow r) -> rank.get(r.status()))
			.thenComparing((a, b) -> a.status() == Status.UPCOMING ? byStart.compare(a, b) : byStart.compare(b, a)));
		return rows;
	}

	@Transactional(readOnly = true)
	public UsageResponse usage(Integer requestedYear) {
		int year = requestedYear != null ? requestedYear : LocalDate.ofInstant(pricing.now(), PricingService.VIETNAM).getYear();
		List<Product> all = products.findAll(Sort.by("name"));
		Map<Long, PricingService.Price> prices = pricing.pricesOf(all);
		List<ProductUsage> rows = all.stream()
			.map(p -> new ProductUsage(p.getId(), p.getName(), p.getPrice(), p.isActive(), daysUsed(p.getId(), year, null),
					prices.get(p.getId()).discounted() ? prices.get(p.getId()).price() : null))
			.toList();
		return new UsageResponse(year, limits.maxDaysPerYear(), limits.maxDiscountPercent(), rows);
	}

	// ---- changes ------------------------------------------------------------------------------------------------

	@Transactional
	public PromotionRow create(long productId, long salePrice, Instant startsAt, Instant endsAt, UUID actorId) {
		// Row lock: two admins creating promotions for the same product are checked one after the other
		Product product = products.lockById(productId).orElseThrow(PromotionService::productNotFound);
		Instant now = storedNow();
		Instant start = startOf(startsAt, now);
		validate(product, salePrice, start, endsAt, null, now);
		ProductPromotion promotion = promotions.saveAndFlush(
				new ProductPromotion(productId, salePrice, start, endsAt, actorId, now));
		audit.entry("PROMOTION_CREATED", "PRODUCT", productId, product.getName())
			.by(actorId)
			.changes(null, AuditView.of(promotion))
			.record();
		return row(promotion, product);
	}

	/**
	 * Upcoming: price and both days. Running: price and last day, the start stays (it already happened); the new
	 * price applies at once to the shop and to carts (prices are always read live, PricingService). Ended or
	 * cancelled: refused.
	 */
	@Transactional
	public PromotionRow update(UUID id, long salePrice, Instant startsAt, Instant endsAt, UUID actorId) {
		ProductPromotion promotion = promotions.findById(id).orElseThrow(PromotionService::notFound);
		Product product = products.lockById(promotion.getProductId()).orElseThrow(PromotionService::productNotFound);
		Instant now = storedNow();
		Instant start = switch (promotion.status(now)) {
			case UPCOMING -> startOf(startsAt, now);
			case RUNNING -> {
				if (startsAt != null && !micros(startsAt).equals(micros(promotion.getStartsAt()))) {
					throw bad("PROMOTION_START_LOCKED", "Khuyến mại đã bắt đầu nên không đổi được ngày bắt đầu");
				}
				yield promotion.getStartsAt();
			}
			default -> throw new ApiException(HttpStatus.CONFLICT, "PROMOTION_NOT_EDITABLE",
					"Khuyến mại đã kết thúc hoặc đã huỷ nên không sửa được");
		};
		validate(product, salePrice, start, endsAt, id, now);
		AuditView before = AuditView.of(promotion);
		promotion.reschedule(salePrice, start, endsAt, now);
		promotions.flush();
		audit.entry("PROMOTION_UPDATED", "PRODUCT", product.getId(), product.getName())
			.by(actorId)
			.changes(before, AuditView.of(promotion))
			.record();
		return row(promotion, product);
	}

	/** Running: ends now. Upcoming: cancelled (never takes effect). */
	@Transactional
	public PromotionRow end(UUID id, UUID actorId) {
		ProductPromotion promotion = promotions.findById(id).orElseThrow(PromotionService::notFound);
		Product product = products.lockById(promotion.getProductId()).orElseThrow(PromotionService::productNotFound);
		Instant now = storedNow();
		AuditView before = AuditView.of(promotion);
		String action = switch (promotion.status(now)) {
			case RUNNING -> {
				promotion.endAt(now);
				yield "PROMOTION_ENDED";
			}
			case UPCOMING -> {
				promotion.cancel(now);
				yield "PROMOTION_CANCELLED";
			}
			default -> throw new ApiException(HttpStatus.CONFLICT, "PROMOTION_ALREADY_ENDED", "Khuyến mại này đã kết thúc");
		};
		audit.entry(action, "PRODUCT", product.getId(), product.getName())
			.by(actorId)
			.changes(before, AuditView.of(promotion))
			.record();
		return row(promotion, product);
	}

	/**
	 * The same % off for several products and the same period. Each product is checked and saved on its own, so
	 * one failure does not stop the others; the result says what happened to each.
	 */
	public List<BulkResult> createBulk(List<Long> productIds, int percentOff, Instant startsAt, Instant endsAt,
			UUID actorId) {
		if (percentOff < 1 || percentOff > 99) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PERCENT", "Mức giảm phải từ 1% đến 99%");
		}
		List<BulkResult> results = new ArrayList<>();
		for (Long productId : productIds.stream().distinct().toList()) {
			try {
				results.add(tx.execute(status -> {
					Product product = products.lockById(productId).orElseThrow(PromotionService::productNotFound);
					long salePrice = PricingService.salePriceFor(product.getPrice(), percentOff);
					PromotionRow row = create(productId, salePrice, startsAt, endsAt, actorId);
					return new BulkResult(productId, product.getName(), true, salePrice, row.id(), null, null);
				}));
			}
			catch (ApiException ex) {
				results.add(new BulkResult(productId, nameOf(productId), false, null, null, ex.getCode(), ex.getMessage()));
			}
			catch (DataIntegrityViolationException ex) {
				results.add(new BulkResult(productId, nameOf(productId), false, null, null, "PROMOTION_OVERLAP",
						"Trùng thời gian với khuyến mại khác của sản phẩm này"));
			}
		}
		return results;
	}

	/**
	 * Called when an admin changes a regular price. While a promotion is running or upcoming the regular price is
	 * frozen (in either direction): the discount % and the max-discount rule were checked against the old price.
	 */
	@Transactional(readOnly = true)
	public void checkNewRegularPrice(long productId) {
		if (!promotions.findCurrentOrUpcoming(productId, pricing.now()).isEmpty()) {
			throw new ApiException(HttpStatus.CONFLICT, "PROMOTION_CONFLICT",
					"Sản phẩm đang có khuyến mại. Hãy kết thúc khuyến mại trước khi đổi giá gốc.");
		}
	}

	/** End of the last running or upcoming promotion of a product (the regular price is frozen until then). */
	@Transactional(readOnly = true)
	public Instant priceLockedUntil(long productId) {
		return promotions.findCurrentOrUpcoming(productId, pricing.now())
			.stream()
			.map(ProductPromotion::getEndsAt)
			.max(Comparator.naturalOrder())
			.orElse(null);
	}

	// ---- rules --------------------------------------------------------------------------------------------------

	/**
	 * The real start of a promotion whose first day is the (Vietnam) day of {@code requested}: today → {@code now},
	 * so it starts at once and can follow one ended early a moment ago; a later day → its midnight in Vietnam; an
	 * earlier day → refused. The one place that decides it, for create, bulk and update.
	 */
	static Instant startOf(Instant requested, Instant now) {
		if (requested == null) {
			throw bad("INVALID_PERIOD", "Vui lòng chọn ngày bắt đầu và ngày kết thúc");
		}
		LocalDate day = LocalDate.ofInstant(requested, PricingService.VIETNAM);
		LocalDate today = LocalDate.ofInstant(now, PricingService.VIETNAM);
		if (day.isBefore(today)) {
			throw bad("INVALID_PERIOD", "Ngày bắt đầu không được ở trong quá khứ");
		}
		return day.equals(today) ? now : day.atStartOfDay(PricingService.VIETNAM).toInstant();
	}

	/**
	 * Now, at the precision the database keeps (microseconds): a start or end set to "now" reads back exactly as it
	 * was returned, so a client can send a running promotion's start back unchanged, and a promotion started right
	 * after one ended early never lands a fraction before that end.
	 */
	private Instant storedNow() {
		return micros(pricing.now());
	}

	private static Instant micros(Instant instant) {
		return instant.truncatedTo(ChronoUnit.MICROS);
	}

	/** Two half-open periods [start, end) overlap; touching ends (a.end == b.start) do not. */
	static boolean overlaps(Instant aStart, Instant aEnd, Instant bStart, Instant bEnd) {
		return aStart.isBefore(bEnd) && bStart.isBefore(aEnd);
	}

	/** {@code startsAt} is already the real start ({@link #startOf}, or the kept start of a running promotion). */
	private void validate(Product product, long salePrice, Instant startsAt, Instant endsAt, UUID excludeId, Instant now) {
		if (endsAt == null) {
			throw bad("INVALID_PERIOD", "Vui lòng chọn ngày bắt đầu và ngày kết thúc");
		}
		if (!endsAt.isAfter(startsAt)) {
			throw bad("INVALID_PERIOD", "Ngày kết thúc phải sau ngày bắt đầu");
		}
		if (!endsAt.isAfter(now)) {
			throw bad("INVALID_PERIOD", "Khuyến mại phải kết thúc sau thời điểm hiện tại");
		}

		long regular = product.getPrice();
		if (salePrice <= 0 || salePrice % 1000 != 0) {
			throw bad("INVALID_SALE_PRICE", "Giá khuyến mại phải lớn hơn 0 và là bội số của 1.000₫");
		}
		if (salePrice >= regular) {
			throw bad("INVALID_SALE_PRICE", "Giá khuyến mại phải thấp hơn giá gốc hiện tại (" + money(regular) + ")");
		}
		if ((regular - salePrice) * 100 > (long) limits.maxDiscountPercent() * regular) {
			long lowest = (regular * (100 - limits.maxDiscountPercent()) + 99_999) / 100_000 * 1000;
			throw bad("DISCOUNT_TOO_LARGE", "Mức giảm tối đa là " + limits.maxDiscountPercent() + "% giá gốc: giá khuyến mại "
					+ "của sản phẩm này không được thấp hơn " + money(lowest) + " (đang giảm "
					+ PricingService.discountPercent(regular, salePrice) + "%)");
		}

		promotions.findActiveBetween(product.getId(), startsAt, endsAt)
			.stream()
			.filter(p -> !p.getId().equals(excludeId))
			.filter(p -> overlaps(startsAt, endsAt, p.getStartsAt(), p.getEndsAt()))
			.findFirst()
			.ifPresent(p -> {
				throw new ApiException(HttpStatus.CONFLICT, "PROMOTION_OVERLAP", "Trùng thời gian với khuyến mại "
						+ money(p.getSalePrice()) + " (" + period(p.getStartsAt(), p.getEndsAt()) + ") của sản phẩm này");
			});

		LocalDate first = LocalDate.ofInstant(startsAt, PricingService.VIETNAM);
		LocalDate last = lastDay(endsAt);
		for (int year = first.getYear(); year <= last.getYear(); year++) {
			Set<LocalDate> days = promotionDays(product.getId(), year, excludeId);
			int used = days.size();
			days.addAll(daysOf(startsAt, endsAt, year));
			// Only the days not already counted (today, when following a promotion ended early today)
			int adding = days.size() - used;
			if (used + adding > limits.maxDaysPerYear()) {
				throw bad("TOO_MANY_DAYS", "Sản phẩm \"" + product.getName() + "\" đã có " + used + " ngày khuyến mại trong năm "
						+ year + "; thêm " + adding + " ngày sẽ vượt giới hạn " + limits.maxDaysPerYear()
						+ " ngày/năm (còn " + Math.max(0, limits.maxDaysPerYear() - used) + " ngày)");
			}
		}
	}

	/**
	 * Promotion days of a product in a calendar year (Vietnam time), cancelled ones excluded. A promotion ended early
	 * counts up to the day it really ended (its endsAt is moved then); a day two promotions share counts once.
	 */
	int daysUsed(Long productId, int year, UUID excludeId) {
		return promotionDays(productId, year, excludeId).size();
	}

	private Set<LocalDate> promotionDays(Long productId, int year, UUID excludeId) {
		Instant from = LocalDate.of(year, 1, 1).atStartOfDay(PricingService.VIETNAM).toInstant();
		Instant to = LocalDate.of(year + 1, 1, 1).atStartOfDay(PricingService.VIETNAM).toInstant();
		Set<LocalDate> days = new HashSet<>();
		promotions.findActiveBetween(productId, from, to)
			.stream()
			.filter(p -> !p.getId().equals(excludeId))
			.forEach(p -> days.addAll(daysOf(p.getStartsAt(), p.getEndsAt(), year)));
		return days;
	}

	/** Calendar days (Vietnam time) of [start, end) that fall in {@code year}; a partly covered day counts. */
	static int daysIn(Instant start, Instant end, int year) {
		return daysOf(start, end, year).size();
	}

	private static List<LocalDate> daysOf(Instant start, Instant end, int year) {
		LocalDate first = LocalDate.ofInstant(start, PricingService.VIETNAM);
		LocalDate last = lastDay(end);
		LocalDate from = first.getYear() < year ? LocalDate.of(year, 1, 1) : first;
		LocalDate to = last.getYear() > year ? LocalDate.of(year, 12, 31) : last;
		return to.isBefore(from) ? List.of() : from.datesUntil(to.plusDays(1)).toList();
	}

	/** The end is exclusive: a promotion ending at midnight does not touch the next day. */
	private static LocalDate lastDay(Instant endExclusive) {
		return LocalDate.ofInstant(endExclusive.minusNanos(1), PricingService.VIETNAM);
	}

	private PromotionRow row(ProductPromotion p, Product product) {
		int year = LocalDate.ofInstant(pricing.now(), PricingService.VIETNAM).getYear();
		return new PromotionRow(p.getId(), product.getId(), product.getName(), product.getSlug(), product.getPrice(),
				p.getSalePrice(), PricingService.discountPercent(product.getPrice(), p.getSalePrice()), p.getStartsAt(),
				p.getEndsAt(), p.status(pricing.now()), daysUsed(product.getId(), year, null));
	}

	private String nameOf(Long productId) {
		return products.findById(productId).map(Product::getName).orElse("#" + productId);
	}

	private static String period(Instant start, Instant end) {
		return DAY.format(start.atZone(PricingService.VIETNAM)) + " – " + DAY.format(lastDay(end));
	}

	private static String money(long vnd) {
		return VND.format(vnd) + "₫";
	}

	private static ApiException bad(String code, String message) {
		return new ApiException(HttpStatus.BAD_REQUEST, code, message);
	}

	private static ApiException notFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "PROMOTION_NOT_FOUND", "Không tìm thấy khuyến mại");
	}

	private static ApiException productNotFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm");
	}
}
