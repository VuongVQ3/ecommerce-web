package com.nutshop.admin;

import com.nutshop.order.AdminOrderService;
import com.nutshop.order.OrderRepository;
import com.nutshop.order.OrderStatus;
import com.nutshop.product.Product;
import com.nutshop.product.ProductRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Numbers for the back-office home page. Days are calendar days in Vietnam time. */
@Service
public class DashboardService {

	public record DailyRevenue(LocalDate date, long revenue, int orders) {
	}

	public record Dashboard(long ordersToday, long pendingCount, long revenue7Days, List<DailyRevenue> revenueByDay,
			List<AdminInventoryService.StockRow> lowStock) {
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

	@Transactional(readOnly = true)
	public Dashboard get() {
		LocalDate today = LocalDate.now(clock.withZone(AdminOrderService.VIETNAM));
		long ordersToday = orders
			.countByCreatedAtGreaterThanEqual(today.atStartOfDay(AdminOrderService.VIETNAM).toInstant());

		// Revenue counts only delivered orders, on the day they were completed
		LocalDate first = today.minusDays(6);
		Map<LocalDate, long[]> byDay = new HashMap<>();
		jdbc.query("""
				SELECT (h.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day, SUM(o.total) AS revenue,
				       COUNT(*) AS orders
				FROM order_status_history h JOIN orders o ON o.id = h.order_id
				WHERE h.to_status = 'COMPLETED' AND h.created_at >= ?
				GROUP BY 1""", rs -> {
			byDay.put(rs.getObject("day", LocalDate.class),
					new long[] { rs.getLong("revenue"), rs.getLong("orders") });
		}, Timestamp.from(first.atStartOfDay(AdminOrderService.VIETNAM).toInstant()));
		List<DailyRevenue> days = new ArrayList<>();
		long total = 0;
		for (LocalDate d = first; !d.isAfter(today); d = d.plusDays(1)) {
			long[] v = byDay.getOrDefault(d, new long[2]);
			days.add(new DailyRevenue(d, v[0], (int) v[1]));
			total += v[0];
		}

		Specification<Product> low = (root, query, cb) -> cb.and(cb.isTrue(root.get("active")),
				cb.le(cb.diff(root.<Integer>get("onHand"), root.<Integer>get("reserved")),
						root.<Integer>get("lowStockThreshold")));
		var lowStock = products.findAll(low, PageRequest.of(0, 10, Sort.by("onHand", "name")))
			.map(AdminInventoryService.StockRow::from)
			.getContent();

		return new Dashboard(ordersToday, orders.countByStatus(OrderStatus.PENDING), total, days, lowStock);
	}
}
