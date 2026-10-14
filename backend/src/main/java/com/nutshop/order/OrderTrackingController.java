package com.nutshop.order;

import com.nutshop.auth.AuthCookies;
import com.nutshop.auth.AuthDtos.UserResponse;
import com.nutshop.auth.ClientInfo;
import com.nutshop.order.TrackingDtos.CancelRequest;
import com.nutshop.order.TrackingDtos.ClaimAccountRequest;
import com.nutshop.order.TrackingDtos.ClaimItem;
import com.nutshop.order.TrackingDtos.ClaimResult;
import com.nutshop.order.TrackingDtos.TrackedOrder;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Guest tracking links: /api/orders/track/** is public (rate limited per IP, see SecurityConfig); the token in
 * {@code t} is the proof. Responses are never cached and never send a Referer that could carry the token.
 * POST /api/orders/claim requires sign-in.
 */
@RestController
@RequestMapping("/api/orders")
public class OrderTrackingController {

	private final GuestOrderService guestOrders;
	private final OrderClaimService claims;
	private final AuthCookies cookies;

	public OrderTrackingController(GuestOrderService guestOrders, OrderClaimService claims, AuthCookies cookies) {
		this.guestOrders = guestOrders;
		this.claims = claims;
		this.cookies = cookies;
	}

	@GetMapping("/track/{code}")
	public ResponseEntity<TrackedOrder> track(@PathVariable String code, @RequestParam(defaultValue = "") String t) {
		return privately(guestOrders.track(code, t));
	}

	@PostMapping("/track/{code}/cancel")
	public ResponseEntity<TrackedOrder> cancel(@PathVariable String code, @RequestParam(defaultValue = "") String t,
			@Valid @RequestBody CancelRequest req) {
		return privately(guestOrders.cancel(code, t, req.reason()));
	}

	/** Creates the account from the order, attaches the order and signs in (same cookies as /api/auth/login). */
	@PostMapping("/track/{code}/claim-account")
	@ResponseStatus(HttpStatus.CREATED)
	public UserResponse claimAccount(@PathVariable String code, @RequestParam(defaultValue = "") String t,
			@Valid @RequestBody ClaimAccountRequest req, HttpServletRequest request, HttpServletResponse response) {
		var result = claims.claimWithNewAccount(code, t, req, ClientInfo.from(request));
		cookies.write(response, result.tokens());
		response.setHeader("Referrer-Policy", "no-referrer");
		response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
		return result.user();
	}

	/** Body: the browser's recent guest orders, [{code, token}, …]. */
	@PostMapping("/claim")
	public ClaimResult claim(@AuthenticationPrincipal Jwt jwt, @RequestBody List<ClaimItem> items) {
		return claims.claim(UUID.fromString(jwt.getSubject()), items);
	}

	private static <T> ResponseEntity<T> privately(T body) {
		return ResponseEntity.ok()
			.cacheControl(CacheControl.noStore())
			.header("Referrer-Policy", "no-referrer")
			.body(body);
	}
}
