package com.nutshop.notify;

import com.nutshop.order.Order;
import com.nutshop.order.OrderCancelledByCustomerEvent;
import com.nutshop.order.OrderItem;
import com.nutshop.order.OrderPlacedEvent;
import com.nutshop.order.OrderRepository;
import com.nutshop.order.PhoneFlag;
import com.nutshop.order.PhoneFlagService;
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
 * off the request thread; the order is read again by id.
 */
@Component
public class OrderTelegramAlerts {

	private static final int MAX_LINES = 5;

	private final TelegramNotifier telegram;
	private final OrderRepository orders;
	private final PhoneFlagService phoneFlags;
	private final SiteProperties site;

	public OrderTelegramAlerts(TelegramNotifier telegram, OrderRepository orders, PhoneFlagService phoneFlags,
			SiteProperties site) {
		this.telegram = telegram;
		this.orders = orders;
		this.phoneFlags = phoneFlags;
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

	/** Customer, short address, up to 5 lines (then "+N món khác"), total, admin link; ⚠️ for a flagged phone. */
	String placedMessage(Order order) {
		StringBuilder text = new StringBuilder();
		text.append("🛒 <b>Đơn mới #").append(escape(order.getCode())).append("</b>\n");
		text.append("👤 ").append(escape(order.getCustomerName())).append(" – ").append(escape(order.getPhone()));
		PhoneFlag flag = phoneFlags.findAll(List.of(order.getPhone())).get(order.getPhone());
		if (flag != null) {
			text.append(" ⚠️ ").append(flag.getLevel().name());
		}
		text.append('\n');
		text.append("📍 ").append(escape(order.getWard())).append(", ").append(escape(order.getProvince())).append('\n');
		List<OrderItem> items = order.getItems();
		for (OrderItem item : items.subList(0, Math.min(MAX_LINES, items.size()))) {
			text.append("- ").append(escape(item.getProductName())).append(" x").append(item.getQuantity()).append('\n');
		}
		if (items.size() > MAX_LINES) {
			text.append('+').append(items.size() - MAX_LINES).append(" món khác\n");
		}
		text.append("💰 <b>").append(price(order.getTotal())).append("</b> – ").append(escape(order.getPaymentMethod()))
			.append('\n');
		text.append("🔗 ").append(escape(adminLink(order)));
		return text.toString();
	}

	/** Reason label, the customer's note if any, admin link. */
	String cancelledMessage(Order order) {
		StringBuilder text = new StringBuilder();
		text.append("❌ <b>Khách huỷ đơn #").append(escape(order.getCode())).append("</b> – lý do: ");
		text.append(order.getCancelReason() == null ? "không rõ" : escape(order.getCancelReason().label()));
		String note = order.getCancelReasonNote();
		if (note != null && !note.isBlank()) {
			text.append(" – ").append(escape(note.trim()));
		}
		text.append("\n🔗 ").append(escape(adminLink(order)));
		return text.toString();
	}

	private String adminLink(Order order) {
		return site.absolute("/admin/don-hang/" + order.getCode());
	}

	/** 219.000₫ */
	static String price(long amount) {
		return String.format(Locale.ROOT, "%,d", amount).replace(',', '.') + "₫";
	}
}
