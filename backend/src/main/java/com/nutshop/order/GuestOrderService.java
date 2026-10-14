package com.nutshop.order;

import com.nutshop.common.ApiException;
import com.nutshop.order.OrderDtos.OrderItemResponse;
import com.nutshop.order.OrderDtos.StatusChange;
import com.nutshop.order.TrackingDtos.TrackedOrder;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/**
 * The guest tracking page: the order code plus the secret token of its tracking link. A wrong token, an expired
 * one, an unknown code or an order that now belongs to an account all give the same 404, so nothing can be learned
 * by guessing.
 */
@Service
public class GuestOrderService {

	private final OrderRepository orders;
	private final OrderStatusHistoryRepository history;
	private final OrderAccessTokens accessTokens;
	private final OrderService orderService;

	public GuestOrderService(OrderRepository orders, OrderStatusHistoryRepository history,
			OrderAccessTokens accessTokens, OrderService orderService) {
		this.orders = orders;
		this.history = history;
		this.accessTokens = accessTokens;
		this.orderService = orderService;
	}

	@Transactional(readOnly = true)
	public TrackedOrder track(String code, String token) {
		return view(find(code, token, false));
	}

	/** Same rules as a signed-in buyer cancelling: only while PENDING; reserved stock goes back to the shelf. */
	@Transactional
	public TrackedOrder cancel(String code, String token, String reason) {
		Order order = find(code, token, true);
		if (order.getStatus() != OrderStatus.PENDING) {
			throw new ApiException(HttpStatus.CONFLICT, OrderService.ORDER_NOT_CANCELLABLE,
					"Đơn hàng đã được xác nhận nên không thể tự huỷ. Vui lòng liên hệ cửa hàng.");
		}
		orderService.transition(order, OrderStatus.CANCELLED, null, "Khách huỷ đơn: " + reason.trim(),
				CancelReason.CUSTOMER_REQUEST);
		return view(orders.findByCode(order.getCode()).orElseThrow());
	}

	/** @param lock row lock for changes (a concurrent admin action waits) */
	Order find(String code, String token, boolean lock) {
		if (code == null || code.length() > 30) {
			throw notFound();
		}
		String normalized = code.trim().toUpperCase();
		Optional<Order> order = lock ? orders.findWithLockByCode(normalized) : orders.findByCode(normalized);
		return order.filter(o -> accessTokens.matches(o, token)).orElseThrow(GuestOrderService::notFound);
	}

	private TrackedOrder view(Order o) {
		List<StatusChange> changes = history.findByOrderIdOrderByCreatedAtAsc(o.getId())
			.stream()
			.map(h -> new StatusChange(h.getToStatus().name(), h.getToStatus().label(), h.getCreatedAt(), h.getReason()))
			.toList();
		return new TrackedOrder(o.getCode(), o.getStatus().name(), o.getStatus().label(), o.getCreatedAt(),
				o.getCustomerName(), maskPhone(o.getPhone()), maskEmail(o.getEmail()), o.getEmail() != null,
				o.getProvince(), o.getWard(), o.getAddressLine(), o.getPaymentMethod(),
				o.getItems().stream().map(OrderItemResponse::from).toList(), o.getSubtotal(), o.getShippingFee(),
				o.getTotal(), o.getCarrier(), o.getTrackingNumber(), changes, o.getStatus() == OrderStatus.PENDING,
				o.getUserId() == null);
	}

	/** 0912345678 → 09******78 */
	static String maskPhone(String phone) {
		if (phone == null || phone.length() < 6) {
			return "******";
		}
		return phone.substring(0, 2) + "*".repeat(phone.length() - 4) + phone.substring(phone.length() - 2);
	}

	/** nguyenvan@gmail.com → ng***@gmail.com */
	static String maskEmail(String email) {
		if (email == null) {
			return null;
		}
		int at = email.indexOf('@');
		if (at <= 0) {
			return "***";
		}
		String local = email.substring(0, at);
		String visible = local.length() <= 2 ? local.substring(0, 1) : local.substring(0, 2);
		// Fixed number of stars: the length of the hidden part is not revealed either
		return visible + "***" + email.substring(at);
	}

	static ApiException notFound() {
		return new ApiException(HttpStatus.NOT_FOUND, OrderService.ORDER_NOT_FOUND,
				"Link theo dõi không hợp lệ hoặc đã hết hạn. Bạn có thể tra cứu đơn bằng mã đơn và số điện thoại.");
	}
}
