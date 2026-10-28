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

	/** Typed in the back office; null = derived from the description when shown (see ShortDescription). */
	@Column(name = "short_description", length = ShortDescription.MAX)
	private String shortDescription;

	private String origin;

	/** Price in VND. */
	@Column(nullable = false)
	private Long price;

	@Column(name = "weight_grams", nullable = false)
	private Integer weightGrams;

	/**
	 * Units physically in stock. Never written through this entity (updatable = false): stock only changes via the
	 * conditional UPDATEs in StockUpdateRepository, so saving an edited product can't overwrite a concurrent
	 * reservation with a stale value.
	 */
	@Column(name = "on_hand", nullable = false, updatable = false)
	private Integer onHand = 0;

	/** Units held by orders not yet shipped. Adding to a cart never changes this. Same rule as onHand. */
	@Column(nullable = false, updatable = false)
	private Integer reserved = 0;

	/** False once discontinued: still visible on its page, but cannot be bought. */
	@Column(nullable = false)
	private boolean active = true;

	/** Back office highlights the product when available stock is at or below this. */
	@Column(name = "low_stock_threshold", nullable = false)
	private int lowStockThreshold = 10;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt = Instant.now();

	@Column(name = "image_url")
	private String imageUrl;

	// Nutrition facts per 100g: all five, or none (not known yet)
	private BigDecimal calories;

	private BigDecimal protein;

	private BigDecimal fat;

	private BigDecimal carbs;

	private BigDecimal fiber;

	/** Default order on the storefront (then id) */
	@Column(name = "sort_order", nullable = false)
	private int sortOrder;

	@Column(name = "created_at", nullable = false, insertable = false, updatable = false)
	private Instant createdAt;

	protected Product() {
	}

	/**
	 * Editable fields of a product (stock is managed separately through inventory movements).
	 *
	 * @param shortDescription null = none typed (derived from the description when shown)
	 * @param price 0 = no price yet (the product cannot be shown until it has one)
	 * @param sortOrder null = keep the current one
	 */
	public record Details(String name, String shortDescription, String description, String origin, long price,
			int weightGrams,
			BigDecimal calories, BigDecimal protein, BigDecimal fat, BigDecimal carbs, BigDecimal fiber,
			int lowStockThreshold, Integer sortOrder) {
	}

	/** New products start with no stock; stock arrives through an inventory import. */
	public Product(Category category, String slug, Details details) {
		this.category = category;
		this.slug = slug;
		apply(details);
	}

	public void update(Category category, String slug, Details details) {
		this.category = category;
		this.slug = slug;
		apply(details);
	}

	private void apply(Details d) {
		this.name = d.name();
		this.shortDescription = d.shortDescription();
		this.description = d.description();
		this.origin = d.origin();
		this.price = d.price();
		this.weightGrams = d.weightGrams();
		this.calories = d.calories();
		this.protein = d.protein();
		this.fat = d.fat();
		this.carbs = d.carbs();
		this.fiber = d.fiber();
		this.lowStockThreshold = d.lowStockThreshold();
		if (d.sortOrder() != null) {
			this.sortOrder = d.sortOrder();
		}
		this.updatedAt = Instant.now();
	}

	public void setSortOrder(int sortOrder) {
		this.sortOrder = sortOrder;
	}

	public int getSortOrder() {
		return sortOrder;
	}

	/** On the storefront and purchasable: shown and priced (the database also forbids active without a price). */
	public boolean isOnSale() {
		return active && hasPrice();
	}

	/** Has a price: may be shown and sold. */
	public boolean hasPrice() {
		return price != null && price > 0;
	}

	/** Nutrition facts are filled in (all five). */
	public boolean hasNutrition() {
		return calories != null && protein != null && fat != null && carbs != null && fiber != null;
	}

	public void setActive(boolean active) {
		this.active = active;
		this.updatedAt = Instant.now();
	}

	/** URL of the primary image (null = emoji placeholder on the storefront). */
	public void setImageUrl(String imageUrl) {
		this.imageUrl = imageUrl;
		this.updatedAt = Instant.now();
	}

	public int getLowStockThreshold() {
		return lowStockThreshold;
	}

	public Instant getUpdatedAt() {
		return updatedAt;
	}

	/** At or below the back-office alert threshold. */
	public boolean isLowStock() {
		return availableQuantity() <= lowStockThreshold;
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

	public String getShortDescription() {
		return shortDescription;
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
