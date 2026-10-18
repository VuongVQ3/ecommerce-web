package com.nutshop.admin;

import com.nutshop.common.ApiException;
import com.nutshop.order.AdminOrderService;
import com.nutshop.order.CancelReason;
import com.nutshop.order.OrderRepository;
import com.nutshop.order.OrderStatus;
import com.nutshop.product.Product;
import com.nutshop.product.ProductRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Numbers for the back-office home page. Days are calendar days in Vietnam time (00:00–24:00 Asia/Ho_Chi_Minh), all
 * summed in the database.
 */
@Service
public class DashboardService {

	/** How far back the day view goes */
	public static final int MAX_DAYS_BACK = 365;
	private static final int TOP_PRODUCTS = 5;
	private static final int DAY_ORDERS = 20;
	private static final int LOW_STOCK_ROWS = 10;

	public record DailyRevenue(LocalDate date, long revenue, int orders) {
	}

	/** What needs doing now, whatever day is being looked at. */
	public record Now(long pendingCount, long pendingOver24h, long lowStockCount,
			List<AdminInventoryService.StockRow> lowStock) {
	}

	/**
	 * One day: orders created that day (ordersCreated; grossValue = their total, cancelled ones left out), revenue
	 * from orders completed that day (same rule as the chart), orders cancelled that day and their most common reason.
	 */
	public record DayTotals(long ordersCreated, long grossValue, long revenue, long cancelled, String topCancelReason) {
	}

	public record TopProduct(long productId, String name, long quantity, long amount) {
	}

	public record DayOrder(String code, Instant createdAt, String customerName, long total, OrderStatus status,
			String statusLabel) {
	}

	public record Day(LocalDate date, long ordersCreated, long grossValue, long revenue, long cancelled,
			String topCancelReason, DayTotals previous, List<TopProduct> topProducts, List<DayOrder> orders,
			List<DailyRevenue> last7Days) {
	}

	private final OrderRepository orders;
	private final ProductRepository products;
	private final JdbcTemplate jdbc;
	private final Clock clock;

	public DashboardService(OrderRepository orders, ProductRepository products, JdbcTemplate jdbc, Clock clock) {
		this.orders = orders;
		this.products = products;
		this.jdbc = jdbc;
		this.clock = clock;
	}

	public LocalDate today() {
		return LocalDate.now(clock.withZone(AdminOrderService.VIETNAM));
	}

	@Transactional(readOnly = true)
	public Now now() {
		Instant dayAgo = clock.instant().minus(Duration.ofHours(24));
		Long over24h = jdbc.queryForObject("SELECT COUNT(*) FROM orders WHERE status = 'PENDING' AND created_at < ?",
				Long.class, Timestamp.from(dayAgo));

		Specification<Product> low = (root, query, cb) -> cb.and(cb.isTrue(root.get("active")),
				cb.le(cb.diff(root.<Integer>get("onHand"), root.<Integer>get("reserved")),
						root.<Integer>get("lowStockThreshold")));
		var page = products.findAll(low, PageRequest.of(0, LOW_STOCK_ROWS, Sort.by("onHand", "name")));
		return new Now(orders.countByStatus(OrderStatus.PENDING), over24h == null ? 0 : over24h,
				page.getTotalElements(), page.map(AdminInventoryService.StockRow::from).getContent());
	}

	/** 400 for a day in the future or more than MAX_DAYS_BACK days ago. */
	@Transactional(readOnly = true)
	public Day day(LocalDate date) {
		LocalDate today = today();
		if (date.isAfter(today) || date.isBefore(today.minusDays(MAX_DAYS_BACK))) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_DATE",
					"Chỉ xem được từ hôm nay trở về trước tối đa " + MAX_DAYS_BACK + " ngày");
		}
		DayTotals totals = totals(date);
		return new Day(date, totals.ordersCreated(), totals.grossValue(), totals.revenue(), totals.cancelled(),
				totals.topCancelReason(), totals(date.minusDays(1)), topProducts(date), dayOrders(date),
				revenueByDay(date.minusDays(6), date));
	}

	private static Timestamp start(LocalDate day) {
		return Timestamp.from(day.atStartOfDay(AdminOrderService.VIETNAM).toInstant());
	}

	private DayTotals totals(LocalDate day) {
		Timestamp from = start(day);
		Timestamp to = start(day.plusDays(1));
		long[] v = jdbc.queryForObject("""
				SELECT
				  (SELECT COUNT(*) FROM orders WHERE created_at >= ? AND created_at < ?),
				  (SELECT COALESCE(SUM(total), 0) FROM orders
				   WHERE created_at >= ? AND created_at < ? AND status <> 'CANCELLED'),
				  (SELECT COALESCE(SUM(o.total), 0) FROM order_status_history h JOIN orders o ON o.id = h.order_id
				   WHERE h.to_status = 'COMPLETED' AND h.created_at >= ? AND h.created_at < ?),
				  (SELECT COUNT(*) FROM order_status_history
				   WHERE to_status = 'CANCELLED' AND created_at >= ? AND created_at < ?)""",
				(rs, n) -> new long[] { rs.getLong(1), rs.getLong(2), rs.getLong(3), rs.getLong(4) }, from, to, from,
				to, from, to, from, to);
		List<String> reason = jdbc.queryForList("""
				SELECT o.cancel_reason_code FROM order_status_history h JOIN orders o ON o.id = h.order_id
				WHERE h.to_status = 'CANCELLED' AND h.created_at >= ? AND h.created_at < ?
				  AND o.cancel_reason_code IS NOT NULL
				GROUP BY 1 ORDER BY COUNT(*) DESC, 1 LIMIT 1""", String.class, from, to);
		String label = reason.isEmpty() ? null : CancelReason.valueOf(reason.get(0)).label();
		return new DayTotals(v[0], v[1], v[2], v[3], label);
	}

	/** By quantity, in orders created that day that were not cancelled. */
	private List<TopProduct> topProducts(LocalDate day) {
		return jdbc.query("""
				SELECT i.product_id, MAX(i.product_name) AS name, SUM(i.quantity) AS quantity, SUM(i.line_total) AS amount
				FROM order_items i JOIN orders o ON o.id = i.order_id
				WHERE o.created_at >= ? AND o.created_at < ? AND o.status <> 'CANCELLED'
				GROUP BY i.product_id ORDER BY quantity DESC, amount DESC, name LIMIT ?""",
				(rs, n) -> new TopProduct(rs.getLong("product_id"), rs.getString("name"), rs.getLong("quantity"),
						rs.getLong("amount")),
				start(day), start(day.plusDays(1)), TOP_PRODUCTS);
	}

	/** Newest first; the page links to the order list for the rest. */
	private List<DayOrder> dayOrders(LocalDate day) {
		return jdbc.query("""
				SELECT code, created_at, customer_name, total, status FROM orders
				WHERE created_at >= ? AND created_at < ? ORDER BY created_at DESC LIMIT ?""", (rs, n) -> {
			OrderStatus status = OrderStatus.valueOf(rs.getString("status"));
			return new DayOrder(rs.getString("code"), rs.getTimestamp("created_at").toInstant(),
					rs.getString("customer_name"), rs.getLong("total"), status, status.label());
		}, start(day), start(day.plusDays(1)), DAY_ORDERS);
	}

	/** Revenue counts only delivered orders, on the day they were completed. */
	private List<DailyRevenue> revenueByDay(LocalDate first, LocalDate last) {
		Map<LocalDate, long[]> byDay = new HashMap<>();
		jdbc.query("""
				SELECT (h.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day, SUM(o.total) AS revenue,
				       COUNT(*) AS orders
				FROM order_status_history h JOIN orders o ON o.id = h.order_id
				WHERE h.to_status = 'COMPLETED' AND h.created_at >= ? AND h.created_at < ?
				GROUP BY 1""", rs -> {
			byDay.put(rs.getObject("day", LocalDate.class),
					new long[] { rs.getLong("revenue"), rs.getLong("orders") });
		}, start(first), start(last.plusDays(1)));
		List<DailyRevenue> days = new ArrayList<>();
		for (LocalDate d = first; !d.isAfter(last); d = d.plusDays(1)) {
			long[] v = byDay.getOrDefault(d, new long[2]);
			days.add(new DailyRevenue(d, v[0], (int) v[1]));
		}
		return days;
	}
}
