package com.nutshop.order;

/**
 * Why an order was cancelled (orders.cancel_reason_code). Customers cancelling themselves pick from their own list;
 * staff pick from theirs. The free-text note goes to orders.cancel_reason and the status history.
 */
public enum CancelReason {
	// ---- chosen by the customer -----------------------------------------------------------------------------------
	CHANGED_MIND("Không muốn mua nữa", true, false),
	CHANGE_ITEMS("Muốn đổi sản phẩm hoặc số lượng", true, false),
	CHANGE_ADDRESS("Muốn đổi địa chỉ giao hàng", true, false),
	DUPLICATE_ORDER("Đặt trùng đơn", true, false),
	BETTER_PRICE("Tìm được giá tốt hơn", true, false),
	// ---- chosen by staff ------------------------------------------------------------------------------------------
	/** The customer asked the shop. */
	CUSTOMER_REQUEST("Khách yêu cầu huỷ", false, true),
	OUT_OF_STOCK("Hết hàng", false, true),
	/** The parcel was refused at the door: the only reason allowed once an order is SHIPPING (stock comes back). */
	REFUSED_DELIVERY("Khách không nhận hàng", false, true),
	UNREACHABLE("Không liên lạc được khách", false, true),
	/** Both lists; a customer must then write a note. */
	OTHER("Lý do khác", true, true);

	private final String label;
	private final boolean customer;
	private final boolean staff;

	CancelReason(String label, boolean customer, boolean staff) {
		this.label = label;
		this.customer = customer;
		this.staff = staff;
	}

	public String label() {
		return label;
	}

	public boolean forCustomer() {
		return customer;
	}

	public boolean forStaff() {
		return staff;
	}

	/** Who cancelled (orders.cancelled_by_type). */
	public enum By {
		STAFF, CUSTOMER
	}
}
