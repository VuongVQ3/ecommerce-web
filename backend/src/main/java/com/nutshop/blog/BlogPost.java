package com.nutshop.blog;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

/** A blog post. Content is Markdown (see BlogMarkdown); the database refuses a published post without excerpt or cover. */
@Entity
@Table(name = "blog_posts")
public class BlogPost {

	public enum Status {
		DRAFT, PUBLISHED
	}

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false, length = 150)
	private String title;

	@Column(nullable = false, unique = true, length = 200)
	private String slug;

	@Column(length = 300)
	private String excerpt;

	@Column(nullable = false, columnDefinition = "text")
	private String content = "";

	@Column(name = "cover_image_url")
	private String coverImageUrl;

	@Column(name = "cover_image_public_id")
	private String coverImagePublicId;

	@Column(name = "cover_image_alt", length = 200)
	private String coverImageAlt;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 16)
	private Status status = Status.DRAFT;

	@Column(name = "published_at")
	private Instant publishedAt;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt = Instant.now();

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt = Instant.now();

	@Column(name = "created_by", updatable = false)
	private UUID createdBy;

	@Column(name = "updated_by")
	private UUID updatedBy;

	protected BlogPost() {
	}

	public BlogPost(String title, String slug, UUID createdBy) {
		this.title = title;
		this.slug = slug;
		this.createdBy = createdBy;
		this.updatedBy = createdBy;
	}

	/** Every change goes through here so updated_at (sitemap lastmod, dateModified) and updated_by stay right. */
	void touch(UUID actorId) {
		this.updatedAt = Instant.now();
		this.updatedBy = actorId;
	}

	public boolean isPublished() {
		return status == Status.PUBLISHED;
	}

	public Long getId() {
		return id;
	}

	public String getTitle() {
		return title;
	}

	void setTitle(String title) {
		this.title = title;
	}

	public String getSlug() {
		return slug;
	}

	void setSlug(String slug) {
		this.slug = slug;
	}

	public String getExcerpt() {
		return excerpt;
	}

	void setExcerpt(String excerpt) {
		this.excerpt = excerpt;
	}

	public String getContent() {
		return content;
	}

	void setContent(String content) {
		this.content = content;
	}

	public String getCoverImageUrl() {
		return coverImageUrl;
	}

	public String getCoverImagePublicId() {
		return coverImagePublicId;
	}

	public String getCoverImageAlt() {
		return coverImageAlt;
	}

	void setCover(String url, String publicId, String alt) {
		this.coverImageUrl = url;
		this.coverImagePublicId = publicId;
		this.coverImageAlt = alt;
	}

	public Status getStatus() {
		return status;
	}

	void setStatus(Status status) {
		this.status = status;
	}

	public Instant getPublishedAt() {
		return publishedAt;
	}

	void setPublishedAt(Instant publishedAt) {
		this.publishedAt = publishedAt;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public Instant getUpdatedAt() {
		return updatedAt;
	}
}
