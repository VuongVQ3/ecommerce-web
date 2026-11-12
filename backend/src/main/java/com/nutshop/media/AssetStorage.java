package com.nutshop.media;

/**
 * Where DAM files (images and PDFs) live: Cloudinary in production, all in one folder ({@link #FOLDER}). DAM folders
 * exist only in the database, so renaming or moving one never calls the store. Separate from {@link ImageStorage}
 * (product and blog images), which is unchanged.
 */
public interface AssetStorage {

	String FOLDER = "hat-lanh/dam";

	/**
	 * @param version Cloudinary's version number (changes on every replace)
	 * @param pages number of pages of a PDF, null for an image
	 * @param bytes size as stored
	 */
	record StoredAsset(String publicId, String url, Long version, Integer width, Integer height, Integer pages,
			Long bytes) {
	}

	/** False when not configured (no CLOUDINARY_URL): uploads are refused with a clear message. */
	boolean isEnabled();

	StoredAsset upload(byte[] bytes, AssetTypes.Kind kind);

	/** Overwrites the file under the same public id (CDN caches invalidated); returns the new version. */
	StoredAsset replace(String publicId, byte[] bytes, AssetTypes.Kind kind);

	/** Best effort: a failed delete only leaves an orphan file behind. */
	void delete(String publicId);
}
