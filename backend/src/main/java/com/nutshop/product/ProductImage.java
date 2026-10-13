package com.nutshop.product;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

/** An image stored on Cloudinary. At most 5 per product; at most one primary (unique partial index). */
@Entity
@Table(name = "product_images")
public class ProductImage {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "product_id", nullable = false, updatable = false)
	private Long productId;

	@Column(name = "public_id", nullable = false, unique = true, updatable = false)
	private String publicId;

	@Column(nullable = false, updatable = false)
	private String url;

	private Integer width;

	private Integer height;

	@Column(name = "is_primary", nullable = false)
	private boolean primary;

	@Column(nullable = false)
	private int position;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt = Instant.now();

	protected ProductImage() {
	}

	public ProductImage(Long productId, String publicId, String url, Integer width, Integer height, int position) {
		this.productId = productId;
		this.publicId = publicId;
		this.url = url;
		this.width = width;
		this.height = height;
		this.position = position;
	}

	public void setPrimary(boolean primary) {
		this.primary = primary;
	}

	public UUID getId() {
		return id;
	}

	public Long getProductId() {
		return productId;
	}

	public String getPublicId() {
		return publicId;
	}

	public String getUrl() {
		return url;
	}

	public Integer getWidth() {
		return width;
	}

	public Integer getHeight() {
		return height;
	}

	public boolean isPrimary() {
		return primary;
	}

	public int getPosition() {
		return position;
	}
}
