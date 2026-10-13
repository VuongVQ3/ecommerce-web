package com.nutshop.order;

import com.nutshop.common.PageResponse;
import com.nutshop.order.OrderDtos.OrderResponse;
import com.nutshop.order.OrderDtos.OrderSummary;
import com.nutshop.order.OrderDtos.PlaceOrderRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * POST / and GET /lookup are public (rate limited, see SecurityConfig); a signed-in buyer's order is linked to their
 * account. /me/** requires sign-in.
 */
@RestController
@RequestMapping("/api/orders")
public class OrderController {

	private final OrderService orderService;

	public OrderController(OrderService orderService) {
		this.orderService = orderService;
	}

	/** 201 for a new order, 200 when the same idempotencyKey was already used (the existing order is returned). */
	@PostMapping
	public ResponseEntity<OrderResponse> place(@Valid @RequestBody PlaceOrderRequest req,
			@AuthenticationPrincipal Jwt jwt) {
		var result = orderService.place(req, jwt == null ? null : UUID.fromString(jwt.getSubject()));
		return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK).body(result.order());
	}

	@GetMapping("/me")
	public PageResponse<OrderSummary> mine(@AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "10") int size) {
		return orderService.myOrders(userId(jwt), page, size);
	}

	@GetMapping("/me/{code}")
	public OrderResponse mineDetail(@AuthenticationPrincipal Jwt jwt, @PathVariable String code) {
		return orderService.myOrder(userId(jwt), code);
	}

	@PostMapping("/me/{code}/cancel")
	public OrderResponse cancel(@AuthenticationPrincipal Jwt jwt, @PathVariable String code) {
		return orderService.cancelMine(userId(jwt), code);
	}

	@GetMapping("/lookup")
	public OrderResponse lookup(@RequestParam(defaultValue = "") String code, @RequestParam(defaultValue = "") String phone) {
		return orderService.lookup(code, phone);
	}

	private static UUID userId(Jwt jwt) {
		return UUID.fromString(jwt.getSubject());
	}
}
