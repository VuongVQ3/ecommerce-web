package com.nutshop.order;

import java.util.UUID;

/** A new order was created (guest or signed in); published inside the placing transaction. */
public record OrderPlacedEvent(UUID orderId) {
}
