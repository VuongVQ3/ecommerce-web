package com.nutshop.media;

/** Where product and blog images live (Cloudinary in production). */
public interface ImageStorage {

	String PRODUCTS_FOLDER = "hat-lanh/products";
	String BLOG_FOLDER = "hat-lanh/blog";

	record StoredImage(String publicId, String url, Integer width, Integer height) {
	}

	/** False when not configured (no CLOUDINARY_URL): uploads are refused with a clear message. */
	boolean isEnabled();

	/** A product image. */
	default StoredImage upload(byte[] bytes, ImageTypes.ImageType type) {
		return upload(bytes, type, PRODUCTS_FOLDER);
	}

	StoredImage upload(byte[] bytes, ImageTypes.ImageType type, String folder);

	/** Best effort: a failed delete only leaves an orphan file behind. */
	void delete(String publicId);
}
