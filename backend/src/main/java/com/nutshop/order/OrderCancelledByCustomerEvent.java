package com.nutshop.order;

import java.util.UUID;

/** The customer cancelled their own order; published inside the cancelling transaction. */
public record OrderCancelledByCustomerEvent(UUID orderId) {
}
