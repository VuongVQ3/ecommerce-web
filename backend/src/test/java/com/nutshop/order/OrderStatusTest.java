package com.nutshop.order;

import org.junit.jupiter.api.Test;

import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

import static com.nutshop.order.OrderStatus.*;
import static org.assertj.core.api.Assertions.assertThat;

class OrderStatusTest {

	private static final Map<OrderStatus, Set<OrderStatus>> ALLOWED = Map.of(
			PENDING, EnumSet.of(CONFIRMED, CANCELLED),
			CONFIRMED, EnumSet.of(SHIPPING, CANCELLED),
			SHIPPING, EnumSet.of(COMPLETED),
			COMPLETED, EnumSet.noneOf(OrderStatus.class),
			CANCELLED, EnumSet.noneOf(OrderStatus.class));

	@Test
	void onlyTheDocumentedTransitionsAreAllowed() {
		for (OrderStatus from : OrderStatus.values()) {
			for (OrderStatus to : OrderStatus.values()) {
				assertThat(from.canTransitionTo(to)).as("%s -> %s", from, to).isEqualTo(ALLOWED.get(from).contains(to));
			}
		}
	}
}
