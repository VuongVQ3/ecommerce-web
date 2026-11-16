package com.nutshop.cart;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The shipping rule, under the current setting (30.000đ below 199.000đ) and the other ones it supports. */
class CartPropertiesTest {

	@Test
	void freeShippingOnEveryOrderWhenThereIsNoFee() {
		var props = new CartProperties(10, 0, 0);
		assertThat(props.freeShippingForAll()).isTrue();
		assertThat(props.shippingFeeFor(10_000)).isZero();
		assertThat(props.shippingFeeFor(5_000_000)).isZero();
		assertThat(props.amountToFreeShipping(10_000)).isZero();
		// A threshold left over does not bring a fee back
		assertThat(new CartProperties(10, 500_000, 0).shippingFeeFor(10_000)).isZero();
	}

	/** The rule since 16/11/2026: cart.shipping-fee=30000, cart.free-shipping-threshold=199000 */
	@Test
	void aFlatFeeBelowTheThreshold() {
		var props = new CartProperties(10, 199_000, 30_000);
		assertThat(props.freeShippingForAll()).isFalse();
		assertThat(props.shippingFeeFor(120_000)).isEqualTo(30_000);
		assertThat(props.amountToFreeShipping(120_000)).isEqualTo(79_000);
		assertThat(props.shippingFeeFor(198_000)).isEqualTo(30_000);
		assertThat(props.amountToFreeShipping(198_000)).isEqualTo(1_000);
		assertThat(props.shippingFeeFor(199_000)).isZero();
		assertThat(props.amountToFreeShipping(199_000)).isZero();
		assertThat(props.amountToFreeShipping(600_000)).isZero();
		// An empty cart pays nothing
		assertThat(props.shippingFeeFor(0)).isZero();
		assertThat(props.amountToFreeShipping(0)).isZero();
	}

	@Test
	void aFeeWithoutThresholdIsAlwaysCharged() {
		var props = new CartProperties(10, 0, 30_000);
		assertThat(props.shippingFeeFor(10_000)).isEqualTo(30_000);
		assertThat(props.shippingFeeFor(5_000_000)).isEqualTo(30_000);
		// Nothing to reach
		assertThat(props.amountToFreeShipping(10_000)).isZero();
	}

	@Test
	void negativeAmountsAreRefused() {
		assertThatThrownBy(() -> new CartProperties(10, 0, -1)).hasMessageContaining("cart.shipping-fee");
		assertThatThrownBy(() -> new CartProperties(10, -1, 0)).hasMessageContaining("cart.free-shipping-threshold");
	}
}
