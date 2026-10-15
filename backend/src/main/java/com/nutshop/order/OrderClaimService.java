package com.nutshop.order;

import com.nutshop.audit.AuditLog;
import com.nutshop.auth.AuthService;
import com.nutshop.auth.AuthService.AuthResult;
import com.nutshop.auth.ClientInfo;
import com.nutshop.auth.VerifiedEmailHook;
import com.nutshop.common.ApiException;
import com.nutshop.order.TrackingDtos.ClaimAccountRequest;
import com.nutshop.order.TrackingDtos.ClaimItem;
import com.nutshop.order.TrackingDtos.ClaimResult;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Attaching guest orders to an account. Three ways, each with proof of ownership:
 * <ul>
 * <li>creating an account from the order's tracking page (the token proves this person placed the order) — only
 * that order;</li>
 * <li>signing in with the browser's recent-orders list (code + token for each);</li>
 * <li>verifying the account's email — every guest order placed with that email.</li>
 * </ul>
 * Never by phone number (phones are not verified). Once attached, the order's tracking links stop working.
 */
@Service
public class OrderClaimService implements VerifiedEmailHook {

	public static final int MAX_CLAIM_ITEMS = 20;

	private final OrderRepository orders;
	private final OrderAccessTokens accessTokens;
	private final GuestOrderService guestOrders;
	private final AuthService auth;
	private final AuditLog audit;

	public OrderClaimService(OrderRepository orders, OrderAccessTokens accessTokens, GuestOrderService guestOrders,
			AuthService auth, AuditLog audit) {
		this.orders = orders;
		this.accessTokens = accessTokens;
		this.guestOrders = guestOrders;
		this.auth = auth;
		this.audit = audit;
	}

	/**
	 * "Lưu đơn hàng vào tài khoản": creates the account from the order's name, email and phone, attaches this order
	 * and signs the buyer in. Email or phone already used by an account → 409 ACCOUNT_EXISTS and nothing changes.
	 */
	@Transactional
	public AuthResult claimWithNewAccount(String code, String token, ClaimAccountRequest req, ClientInfo client) {
		Order order = guestOrders.find(code, token, true);
		String email = order.getEmail() != null ? order.getEmail() : req.email();
		if (!StringUtils.hasText(email)) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "EMAIL_REQUIRED", "Vui lòng nhập email để tạo tài khoản");
		}
		AuthResult result = auth.createAccountForOrder(email, order.getCustomerName(), order.getPhone(), req.password(),
				req.wantsMarketing(), client);
		attach(order, result.user().id(), "NEW_ACCOUNT");
		return result;
	}

	/**
	 * After signing in: the browser sends its recent guest orders. Valid ones not yet owned by anyone are attached
	 * to the signed-in user; the rest are reported as skipped (wrong token, expired, someone else's).
	 */
	@Transactional
	public ClaimResult claim(UUID userId, List<ClaimItem> items) {
		if (items.size() > MAX_CLAIM_ITEMS) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "TOO_MANY_ITEMS", "Tối đa " + MAX_CLAIM_ITEMS + " đơn mỗi lần");
		}
		List<String> claimed = new ArrayList<>();
		List<String> skipped = new ArrayList<>();
		for (ClaimItem item : items) {
			if (item == null || !StringUtils.hasText(item.code()) || !StringUtils.hasText(item.token())) {
				continue;
			}
			String code = item.code().trim().toUpperCase();
			var order = orders.findWithLockByCode(code).filter(o -> accessTokens.matches(o, item.token()));
			if (order.isPresent()) {
				attach(order.get(), userId, "TRACKING_TOKEN");
				claimed.add(code);
			}
			else {
				skipped.add(code);
			}
		}
		return new ClaimResult(claimed, skipped);
	}

	/** The account proved it owns {@code email}: its guest orders placed with that email join the account. */
	@Override
	@Transactional
	public int onEmailVerified(UUID userId, String email) {
		List<Order> found = orders.findGuestOrdersByEmailForUpdate(email);
		found.forEach(order -> attach(order, userId, "EMAIL_VERIFIED"));
		return found.size();
	}

	private void attach(Order order, UUID userId, String method) {
		order.assignTo(userId);
		accessTokens.revokeAll(order);
		audit.entry("ORDER_CLAIMED", "ORDER", order.getCode(), order.getCode())
			.byCustomer(userId)
			.changes(null, Map.of("method", method))
			.record();
	}
}
