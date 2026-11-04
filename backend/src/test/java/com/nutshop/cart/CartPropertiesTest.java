package com.nutshop.cart;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The shipping rule, under the current setting (free for all) and the ones it can be switched back to. */
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

	/** The rule before 11/2026: CART_SHIPPING_FEE=30000, CART_FREE_SHIPPING_THRESHOLD=500000 */
	@Test
	void aFlatFeeBelowTheThreshold() {
		var props = new CartProperties(10, 500_000, 30_000);
		assertThat(props.freeShippingForAll()).isFalse();
		assertThat(props.shippingFeeFor(240_000)).isEqualTo(30_000);
		assertThat(props.amountToFreeShipping(240_000)).isEqualTo(260_000);
		assertThat(props.shippingFeeFor(499_999)).isEqualTo(30_000);
		assertThat(props.shippingFeeFor(500_000)).isZero();
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
