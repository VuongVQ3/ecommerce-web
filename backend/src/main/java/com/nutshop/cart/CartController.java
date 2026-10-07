package com.nutshop.cart;

import com.nutshop.cart.CartDtos.AddItemRequest;
import com.nutshop.cart.CartDtos.CartMutationResponse;
import com.nutshop.cart.CartDtos.CartView;
import com.nutshop.cart.CartDtos.MergeRequest;
import com.nutshop.cart.CartDtos.MergeResponse;
import com.nutshop.cart.CartDtos.SetQuantityRequest;
import com.nutshop.cart.CartDtos.ValidateRequest;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/** Signed-in user's cart. Everything requires sign-in except POST /validate (guest carts). */
@RestController
@RequestMapping("/api/cart")
public class CartController {

	private final CartService cartService;

	public CartController(CartService cartService) {
		this.cartService = cartService;
	}

	@GetMapping({ "", "/" })
	public CartView get(@AuthenticationPrincipal Jwt jwt) {
		return cartService.get(userId(jwt));
	}

	@PostMapping("/items")
	public CartMutationResponse add(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody AddItemRequest req) {
		return cartService.add(userId(jwt), req.productId(), req.quantity());
	}

	@PatchMapping("/items/{productId}")
	public CartMutationResponse setQuantity(@AuthenticationPrincipal Jwt jwt, @PathVariable long productId,
			@Valid @RequestBody SetQuantityRequest req) {
		return cartService.setQuantity(userId(jwt), productId, req.quantity());
	}

	@DeleteMapping("/items/{productId}")
	public CartView remove(@AuthenticationPrincipal Jwt jwt, @PathVariable long productId) {
		return cartService.remove(userId(jwt), productId);
	}

	@DeleteMapping({ "", "/" })
	public CartView clear(@AuthenticationPrincipal Jwt jwt) {
		return cartService.clear(userId(jwt));
	}

	@PostMapping("/merge")
	public MergeResponse merge(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody MergeRequest req) {
		return cartService.merge(userId(jwt), req.mergeKey(), req.items());
	}

	/** Public and rate limited per IP (see SecurityConfig). */
	@PostMapping("/validate")
	public CartView validate(@Valid @RequestBody ValidateRequest req) {
		return cartService.validate(req.items());
	}

	private static UUID userId(Jwt jwt) {
		return UUID.fromString(jwt.getSubject());
	}
}
