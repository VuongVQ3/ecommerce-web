package com.nutshop.notify;

import com.nutshop.order.Order;
import com.nutshop.order.OrderCancelledByCustomerEvent;
import com.nutshop.order.OrderPlacedEvent;
import com.nutshop.order.OrderRepository;
import com.nutshop.site.SiteProperties;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.Locale;

import static com.nutshop.notify.TelegramNotifier.escape;

/**
 * Telegram alerts to the shop: a new order, and an order the customer cancelled. Sent after the transaction commits,
 * off the request thread; the order is read again by id.
 * <p>
 * No personal data goes to Telegram (privacy policy B.5): only the order code, the total and the admin link, where
 * staff sign in to see the rest. No name, phone, address, products, phone flag or free-text cancel note.
 */
@Component
public class OrderTelegramAlerts {

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
			orders.findById(event.orderId()).ifPresent(order -> telegram.send(placedMessage(order)));
		}
	}

	@Async
	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	@Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
	public void onCancelledByCustomer(OrderCancelledByCustomerEvent event) {
		if (telegram.enabled()) {
			orders.findById(event.orderId()).ifPresent(order -> telegram.send(cancelledMessage(order)));
		}
	}

	/** Code, total, admin link. */
	String placedMessage(Order order) {
		return "🛒 <b>Đơn mới #" + escape(order.getCode()) + "</b>\n"
				+ "💰 <b>" + price(order.getTotal()) + "</b>\n"
				+ "🔗 " + escape(adminLink(order));
	}

	/** Code, total, the fixed reason label (never the customer's own note), admin link. */
	String cancelledMessage(Order order) {
		String reason = order.getCancelReason() == null ? "không rõ" : escape(order.getCancelReason().label());
		return "❌ <b>Khách huỷ đơn #" + escape(order.getCode()) + "</b> – lý do: " + reason + "\n"
				+ "💰 " + price(order.getTotal()) + "\n"
				+ "🔗 " + escape(adminLink(order));
	}

	private String adminLink(Order order) {
		return site.absolute("/admin/don-hang/" + order.getCode());
	}

	/** 219.000₫ */
	static String price(long amount) {
		return String.format(Locale.ROOT, "%,d", amount).replace(',', '.') + "₫";
	}
}
