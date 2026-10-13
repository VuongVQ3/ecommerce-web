package com.nutshop.order;

/**
 * Order lifecycle. Allowed moves only:
 * PENDING → CONFIRMED → SHIPPING → COMPLETED, and PENDING/CONFIRMED → CANCELLED.
 */
public enum OrderStatus {

	PENDING("Chờ xác nhận"),
	CONFIRMED("Đã xác nhận"),
	SHIPPING("Đang giao"),
	COMPLETED("Hoàn thành"),
	CANCELLED("Đã huỷ");

	private final String label;

	OrderStatus(String label) {
		this.label = label;
	}

	public String label() {
		return label;
	}

	public boolean canTransitionTo(OrderStatus next) {
		return switch (this) {
			case PENDING -> next == CONFIRMED || next == CANCELLED;
			case CONFIRMED -> next == SHIPPING || next == CANCELLED;
			case SHIPPING -> next == COMPLETED;
			case COMPLETED, CANCELLED -> false;
		};
	}
}
