package com.nutshop.notify;

import com.nutshop.order.Order;
import com.nutshop.order.OrderCancelledByCustomerEvent;
import com.nutshop.order.OrderItem;
import com.nutshop.order.OrderPlacedEvent;
import com.nutshop.order.OrderRepository;
import com.nutshop.site.SiteProperties;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.List;
import java.util.Locale;

import static com.nutshop.notify.TelegramNotifier.escape;

/**
 * Telegram alerts to the shop: a new order, and an order the customer cancelled. Sent after the transaction commits,
 * off the request thread; the order is read again by id, with its lines.
 * <p>
 * No personal data goes to Telegram (privacy policy B.5): only the order code, the products and quantities, the total
 * and the admin link, where staff sign in to see the rest. No name, phone, email, address, customer note, phone flag
 * or free-text cancel note. Product names are the snapshot taken when the order was placed.
 */
@Component
public class OrderTelegramAlerts {

	/** Product lines listed in full; the rest are counted on one line. */
	static final int MAX_LINES = 10;

	/** Longer product names are cut, so a message stays far below Telegram's 4096 characters. */
	static final int MAX_NAME = 80;

	private final TelegramNotifier telegram;
	private final OrderRepository orders;
	private final SiteProperties site;

	public OrderTelegramAlerts(TelegramNotifier telegram, OrderRepository orders, SiteProperties site) {
		this.telegram = telegram;
		this.orders = orders;
		this.site = site;
	}

	@Async
	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	@Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
	public void onPlaced(OrderPlacedEvent event) {
		if (telegram.enabled()) {
			orders.findWithItemsById(event.orderId()).ifPresent(order -> telegram.send(placedMessage(order)));
		}
	}

	@Async
	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	@Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
	public void onCancelledByCustomer(OrderCancelledByCustomerEvent event) {
		if (telegram.enabled()) {
			orders.findWithItemsById(event.orderId()).ifPresent(order -> telegram.send(cancelledMessage(order)));
		}
	}

	/** Code, products, number of packs, total, admin link. */
	String placedMessage(Order order) {
		return "🛒 <b>Đơn mới #" + escape(order.getCode()) + "</b>\n"
				+ products(order.getItems())
				+ "💰 <b>" + price(order.getTotal()) + "</b>\n"
				+ "🔗 " + escape(adminLink(order));
	}

	/** Code, the fixed reason label (never the customer's own note), products, number of packs, total, admin link. */
	String cancelledMessage(Order order) {
		String reason = order.getCancelReason() == null ? "không rõ" : escape(order.getCancelReason().label());
		return "❌ <b>Khách huỷ đơn #" + escape(order.getCode()) + "</b> – lý do: " + reason + "\n"
				+ products(order.getItems())
				+ "💰 " + price(order.getTotal()) + "\n"
				+ "🔗 " + escape(adminLink(order));
	}

	/** "• name × qty" per line in the order's own order (as on the admin order page), then "📦 N gói". */
	private static String products(List<OrderItem> items) {
		StringBuilder text = new StringBuilder();
		items.stream()
			.limit(MAX_LINES)
			.forEach(i -> text.append("• ").append(escape(shorten(i.getProductName()))).append(" × ")
				.append(i.getQuantity()).append('\n'));
		if (items.size() > MAX_LINES) {
			text.append("• … và ").append(items.size() - MAX_LINES).append(" sản phẩm khác\n");
		}
		int packs = items.stream().mapToInt(OrderItem::getQuantity).sum();
		return text.append("📦 ").append(packs).append(" gói\n").toString();
	}

	/** Cut by code points (an emoji is never split) and before escaping (nor is an entity). */
	private static String shorten(String name) {
		return name.codePointCount(0, name.length()) > MAX_NAME
				? name.substring(0, name.offsetByCodePoints(0, MAX_NAME)) + "…" : name;
	}

	private String adminLink(Order order) {
		return site.absolute("/admin/don-hang/" + order.getCode());
	}

	/** 219.000₫ */
	static String price(long amount) {
		return String.format(Locale.ROOT, "%,d", amount).replace(',', '.') + "₫";
	}
}
