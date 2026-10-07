package com.nutshop.cart;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param maxQtyPerItem most units of one product per cart (DB hard cap is 99)
 * @param freeShippingThreshold subtotal (VND) from which shipping is free
 * @param shippingFee flat shipping fee (VND) below the threshold
 */
@ConfigurationProperties(prefix = "cart")
public record CartProperties(int maxQtyPerItem, long freeShippingThreshold, long shippingFee) {

	public CartProperties {
		if (maxQtyPerItem < 1 || maxQtyPerItem > 99) {
			throw new IllegalArgumentException("cart.max-qty-per-item must be between 1 and 99");
		}
	}
}
