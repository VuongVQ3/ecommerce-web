package com.nutshop.cart;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Shipping is a server setting (application.properties, or the CART_SHIPPING_FEE / CART_FREE_SHIPPING_THRESHOLD
 * environment variables), never an admin screen. Since 16/11/2026 standard shipping costs 30.000đ below a 199.000đ
 * subtotal and is free from it. Pages read both numbers from /api/site.
 *
 * @param maxQtyPerItem most units of one product per cart (DB hard cap is 99)
 * @param freeShippingThreshold subtotal (VND) from which shipping is free; 0 = no threshold: with a fee above 0, every
 * order pays it
 * @param shippingFee flat shipping fee (VND) below the threshold; 0 = free shipping on every order, whatever the
 * threshold
 */
@ConfigurationProperties(prefix = "cart")
public record CartProperties(int maxQtyPerItem, long freeShippingThreshold, long shippingFee) {

	public CartProperties {
		if (maxQtyPerItem < 1 || maxQtyPerItem > 99) {
			throw new IllegalArgumentException("cart.max-qty-per-item must be between 1 and 99");
		}
		if (shippingFee < 0) {
			throw new IllegalArgumentException("cart.shipping-fee must not be negative");
		}
		if (freeShippingThreshold < 0) {
			throw new IllegalArgumentException("cart.free-shipping-threshold must not be negative");
		}
	}

	/** No shipping fee at all (fee 0): carts then say "Miễn phí giao hàng toàn quốc" instead of a progress bar. */
	public boolean freeShippingForAll() {
		return shippingFee == 0;
	}

	/**
	 * The one shipping rule, shared by carts and orders: free for an empty cart, when there is no fee, or from the
	 * threshold (when there is one).
	 */
	public long shippingFeeFor(long subtotal) {
		if (subtotal == 0 || freeShippingForAll()) {
			return 0;
		}
		return freeShippingThreshold > 0 && subtotal >= freeShippingThreshold ? 0 : shippingFee;
	}

	/** How much more to spend for free shipping: 0 when already free, or when no amount makes it free. */
	public long amountToFreeShipping(long subtotal) {
		return shippingFeeFor(subtotal) == 0 || freeShippingThreshold == 0 ? 0 : freeShippingThreshold - subtotal;
	}
}
