package com.nutshop.order;

/**
 * Order lifecycle. Allowed moves only:
 * PENDING → CONFIRMED → SHIPPING → COMPLETED, PENDING/CONFIRMED → CANCELLED, and SHIPPING → CANCELLED when the
 * parcel was refused at the door (CancelReason.REFUSED_DELIVERY only, checked by OrderService#transition).
 * The labels are the ones used everywhere (frontend lib/orderStatus.ts mirrors them, emails use these).
 */
public enum OrderStatus {

	PENDING("Chờ xác nhận"),
	CONFIRMED("Đã xác nhận"),
	SHIPPING("Đang giao"),
	COMPLETED("Hoàn tất"),
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
			case SHIPPING -> next == COMPLETED || next == CANCELLED;
			case COMPLETED, CANCELLED -> false;
		};
	}
}
