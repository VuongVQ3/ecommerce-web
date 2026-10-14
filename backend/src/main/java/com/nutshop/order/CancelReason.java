package com.nutshop.order;

/** Why an order was cancelled (orders.cancel_reason_code); the free-text reason goes to the status history. */
public enum CancelReason {
	/** The customer asked (including self-service cancellations). */
	CUSTOMER_REQUEST("Khách yêu cầu huỷ"),
	OUT_OF_STOCK("Hết hàng"),
	/** The parcel was refused at the door: the only reason allowed once an order is SHIPPING (stock comes back). */
	REFUSED_DELIVERY("Khách không nhận hàng"),
	UNREACHABLE("Không liên lạc được khách"),
	OTHER("Lý do khác");

	private final String label;

	CancelReason(String label) {
		this.label = label;
	}

	public String label() {
		return label;
	}
}
