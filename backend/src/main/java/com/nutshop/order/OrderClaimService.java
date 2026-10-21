package com.nutshop.order;

import com.nutshop.user.PersonName;
import com.nutshop.audit.AuditLog;
import com.nutshop.auth.AuthService;
import com.nutshop.auth.AuthService.AuthResult;
import com.nutshop.auth.ClientInfo;
import com.nutshop.auth.VerifiedEmailHook;
import com.nutshop.common.ApiException;
import com.nutshop.order.TrackingDtos.ClaimAccountRequest;
import com.nutshop.order.TrackingDtos.ClaimItem;
import com.nutshop.order.TrackingDtos.ClaimResult;
import com.nutshop.user.Role;
import com.nutshop.user.User;
import com.nutshop.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Attaching guest orders to an account. Three ways, each with proof of ownership:
 * <ul>
 * <li>creating an account from the order's tracking page (the token proves this person placed the order) — only
 * that order;</li>
 * <li>signing in with the browser's recent-orders list (code + token for each), and only orders that match the
 * account: the account's verified email, or its phone number, is the one on the order — a link that was forwarded or
 * opened by staff helping the buyer does not move the order to someone else's account. Never for staff/admin
 * accounts;</li>
 * <li>verifying the account's email — every guest order placed with that email.</li>
 * </ul>
 * Never by phone number alone (phones are not verified). Once attached, the order's tracking links stop working.
 */
@Service
public class OrderClaimService implements VerifiedEmailHook {

	public static final int MAX_CLAIM_ITEMS = 20;

	private final OrderRepository orders;
	private final OrderAccessTokens accessTokens;
	private final GuestOrderService guestOrders;
	private final AuthService auth;
	private final AuditLog audit;
	private final UserRepository users;

	public OrderClaimService(OrderRepository orders, OrderAccessTokens accessTokens, GuestOrderService guestOrders,
			AuthService auth, AuditLog audit, UserRepository users) {
		this.users = users;
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
		String fullName = StringUtils.hasText(req.fullName()) ? req.fullName().strip() : order.getCustomerName();
		// Orders placed before names were checked may carry one that is not a name
		if (!PersonName.Validator.valid(fullName)) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_NAME", PersonName.MESSAGE);
		}
		AuthResult result = auth.createAccountForOrder(email, fullName, order.getPhone(), req.password(), client);
		attach(order, result.user().id(), "NEW_ACCOUNT");
		return result;
	}

	/**
	 * After signing in: the browser sends its recent guest orders. Valid ones not yet owned by anyone and matching
	 * the account (verified email or phone, see the class comment) are attached to the signed-in user; the rest are
	 * reported as skipped (wrong token, expired, someone else's, not this account's) and keep their tracking links.
	 * Staff and admin accounts never claim: everything is skipped.
	 */
	@Transactional
	public ClaimResult claim(UUID userId, List<ClaimItem> items) {
		if (items.size() > MAX_CLAIM_ITEMS) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "TOO_MANY_ITEMS", "Tối đa " + MAX_CLAIM_ITEMS + " đơn mỗi lần");
		}
		User user = users.findById(userId).filter(u -> u.getRole() == Role.CUSTOMER).orElse(null);
		List<String> claimed = new ArrayList<>();
		List<String> skipped = new ArrayList<>();
		for (ClaimItem item : items) {
			if (item == null || !StringUtils.hasText(item.code()) || !StringUtils.hasText(item.token())) {
				continue;
			}
			String code = item.code().trim().toUpperCase();
			var order = user == null ? Optional.<Order>empty()
					: orders.findWithLockByCode(code)
						.filter(o -> accessTokens.matches(o, item.token()))
						.filter(o -> belongsTo(o, user));
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

	/** The order was placed with this account's verified email or with its phone number. */
	private static boolean belongsTo(Order order, User user) {
		boolean sameEmail = order.getEmail() != null && user.isEmailVerified()
				&& order.getEmail().equalsIgnoreCase(user.getEmail());
		boolean samePhone = user.getPhone() != null && user.getPhone().equals(order.getPhone());
		return sameEmail || samePhone;
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
