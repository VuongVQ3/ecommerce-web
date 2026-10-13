package com.nutshop.order;

import jakarta.persistence.*;

import java.util.UUID;

/** Snapshot of a product line at purchase time: later price or name changes do not affect the order. */
@Entity
@Table(name = "order_items")
public class OrderItem {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "order_id")
	private Order order;

	@Column(name = "product_id", nullable = false)
	private Long productId;

	@Column(name = "product_name", nullable = false)
	private String productName;

	@Column(name = "unit_price", nullable = false)
	private long unitPrice;

	@Column(name = "weight_grams", nullable = false)
	private int weightGrams;

	@Column(nullable = false)
	private int quantity;

	@Column(name = "line_total", nullable = false)
	private long lineTotal;

	protected OrderItem() {
	}

	OrderItem(Order order, Long productId, String productName, long unitPrice, int weightGrams, int quantity) {
		this.order = order;
		this.productId = productId;
		this.productName = productName;
		this.unitPrice = unitPrice;
		this.weightGrams = weightGrams;
		this.quantity = quantity;
		this.lineTotal = Math.multiplyExact(unitPrice, (long) quantity);
	}

	public Long getProductId() {
		return productId;
	}

	public String getProductName() {
		return productName;
	}

	public long getUnitPrice() {
		return unitPrice;
	}

	public int getWeightGrams() {
		return weightGrams;
	}

	public int getQuantity() {
		return quantity;
	}

	public long getLineTotal() {
		return lineTotal;
	}
}
