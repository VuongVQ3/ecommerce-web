package com.nutshop.product;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "products")
public class Product {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "category_id")
	private Category category;

	@Column(nullable = false)
	private String name;

	@Column(nullable = false, unique = true)
	private String slug;

	@Column(nullable = false, length = 2000)
	private String description;

	private String origin;

	/** Price in VND. */
	@Column(nullable = false)
	private Long price;

	@Column(name = "weight_grams", nullable = false)
	private Integer weightGrams;

	/** Units physically in stock. */
	@Column(name = "on_hand", nullable = false)
	private Integer onHand;

	/** Units held by orders not yet shipped. Adding to a cart never changes this. */
	@Column(nullable = false)
	private Integer reserved;

	/** False once discontinued: still visible on its page, but cannot be bought. */
	@Column(nullable = false)
	private boolean active;

	@Column(name = "image_url")
	private String imageUrl;

	// Nutrition facts per 100g
	@Column(nullable = false)
	private BigDecimal calories;

	@Column(nullable = false)
	private BigDecimal protein;

	@Column(nullable = false)
	private BigDecimal fat;

	@Column(nullable = false)
	private BigDecimal carbs;

	@Column(nullable = false)
	private BigDecimal fiber;

	@Column(name = "created_at", nullable = false, insertable = false, updatable = false)
	private Instant createdAt;

	protected Product() {
	}

	public Long getId() {
		return id;
	}

	public Category getCategory() {
		return category;
	}

	public String getName() {
		return name;
	}

	public String getSlug() {
		return slug;
	}

	public String getDescription() {
		return description;
	}

	public String getOrigin() {
		return origin;
	}

	public Long getPrice() {
		return price;
	}

	public Integer getWeightGrams() {
		return weightGrams;
	}

	public Integer getOnHand() {
		return onHand;
	}

	public Integer getReserved() {
		return reserved;
	}

	public boolean isActive() {
		return active;
	}

	/** Units a shopper can still buy: on hand minus reserved, never negative. */
	public int availableQuantity() {
		return Math.max(0, onHand - reserved);
	}

	public String getImageUrl() {
		return imageUrl;
	}

	public BigDecimal getCalories() {
		return calories;
	}

	public BigDecimal getProtein() {
		return protein;
	}

	public BigDecimal getFat() {
		return fat;
	}

	public BigDecimal getCarbs() {
		return carbs;
	}

	public BigDecimal getFiber() {
		return fiber;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}
}
