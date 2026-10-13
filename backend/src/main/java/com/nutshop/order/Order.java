package com.nutshop.order;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** A cash-on-delivery order. Amounts in VND; lines are snapshots taken at purchase time. */
@Entity
@Table(name = "orders")
public class Order {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(nullable = false, unique = true, updatable = false)
	private String code;

	@Column(name = "idempotency_key", nullable = false, unique = true, updatable = false)
	private String idempotencyKey;

	/** Null for guest orders. */
	@Column(name = "user_id", updatable = false)
	private UUID userId;

	@Column(name = "customer_name", nullable = false)
	private String customerName;

	@Column(nullable = false)
	private String phone;

	private String email;

	@Column(nullable = false)
	private String province;

	/** Unused since Vietnam's 2025 reform removed districts; kept for old-style addresses. */
	private String district;

	@Column(nullable = false)
	private String ward;

	@Column(name = "address_line", nullable = false)
	private String addressLine;

	private String note;

	@Column(nullable = false)
	private long subtotal;

	@Column(name = "shipping_fee", nullable = false)
	private long shippingFee;

	@Column(nullable = false)
	private long total;

	@Column(name = "payment_method", nullable = false)
	private String paymentMethod = "COD";

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private OrderStatus status = OrderStatus.PENDING;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt = Instant.now();

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt = Instant.now();

	@OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
	@OrderBy("productName")
	private List<OrderItem> items = new ArrayList<>();

	protected Order() {
	}

	public Order(String code, String idempotencyKey, UUID userId, Delivery delivery, String note) {
		this.code = code;
		this.idempotencyKey = idempotencyKey;
		this.userId = userId;
		this.customerName = delivery.customerName();
		this.phone = delivery.phone();
		this.email = delivery.email();
		this.province = delivery.province();
		this.ward = delivery.ward();
		this.addressLine = delivery.addressLine();
		this.note = note;
	}

	/** Who receives the parcel and where. */
	public record Delivery(String customerName, String phone, String email, String province, String ward,
			String addressLine) {
	}

	public void addItem(Long productId, String productName, long unitPrice, int weightGrams, int quantity) {
		items.add(new OrderItem(this, productId, productName, unitPrice, weightGrams, quantity));
	}

	/** Totals come only from the snapshotted lines plus the server-side shipping fee. */
	public void setTotals(long subtotal, long shippingFee) {
		this.subtotal = subtotal;
		this.shippingFee = shippingFee;
		this.total = subtotal + shippingFee;
	}

	/** Use OrderService#transition, which also enforces the allowed moves and records history and stock. */
	void changeStatus(OrderStatus next) {
		this.status = next;
		this.updatedAt = Instant.now();
	}

	public UUID getId() {
		return id;
	}

	public String getCode() {
		return code;
	}

	public String getIdempotencyKey() {
		return idempotencyKey;
	}

	public UUID getUserId() {
		return userId;
	}

	public String getCustomerName() {
		return customerName;
	}

	public String getPhone() {
		return phone;
	}

	public String getEmail() {
		return email;
	}

	public String getProvince() {
		return province;
	}

	public String getDistrict() {
		return district;
	}

	public String getWard() {
		return ward;
	}

	public String getAddressLine() {
		return addressLine;
	}

	public String getNote() {
		return note;
	}

	public long getSubtotal() {
		return subtotal;
	}

	public long getShippingFee() {
		return shippingFee;
	}

	public long getTotal() {
		return total;
	}

	public String getPaymentMethod() {
		return paymentMethod;
	}

	public OrderStatus getStatus() {
		return status;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public Instant getUpdatedAt() {
		return updatedAt;
	}

	public List<OrderItem> getItems() {
		return items;
	}
}
