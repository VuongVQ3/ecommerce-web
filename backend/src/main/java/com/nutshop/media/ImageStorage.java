package com.nutshop.media;

/** Where product images live (Cloudinary in production). */
public interface ImageStorage {

	record StoredImage(String publicId, String url, Integer width, Integer height) {
	}

	/** False when not configured (no CLOUDINARY_URL): uploads are refused with a clear message. */
	boolean isEnabled();

	StoredImage upload(byte[] bytes, ImageTypes.ImageType type);

	/** Best effort: a failed delete only leaves an orphan file behind. */
	void delete(String publicId);
}
