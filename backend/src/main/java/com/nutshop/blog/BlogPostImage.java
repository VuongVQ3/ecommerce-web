package com.nutshop.blog;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

/** An image uploaded for a post (cover or inside the content), stored on Cloudinary. */
@Entity
@Table(name = "blog_post_images")
public class BlogPostImage {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "post_id", nullable = false, updatable = false)
	private Long postId;

	@Column(name = "public_id", nullable = false, unique = true, updatable = false)
	private String publicId;

	@Column(nullable = false, updatable = false)
	private String url;

	private Integer width;

	private Integer height;

	@Column(length = 200)
	private String alt;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt = Instant.now();

	protected BlogPostImage() {
	}

	public BlogPostImage(Long postId, String publicId, String url, Integer width, Integer height, String alt) {
		this.postId = postId;
		this.publicId = publicId;
		this.url = url;
		this.width = width;
		this.height = height;
		this.alt = alt;
	}

	public UUID getId() {
		return id;
	}

	public Long getPostId() {
		return postId;
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

	public String getAlt() {
		return alt;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}
}
