package com.nutshop.media;

import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.HashMap;
import java.util.Map;

/**
 * DAM files on Cloudinary, configured from the same CLOUDINARY_URL as {@link CloudinaryImageStorage} (normalized the
 * same way; the API key is masked wherever Cloudinary quotes it, the secret is never logged). PDFs are uploaded as
 * resource_type "image" too: Cloudinary then reports the page count and can render page 1 as a picture.
 */
public class CloudinaryAssetStorage implements AssetStorage {

	private static final Logger log = LoggerFactory.getLogger(CloudinaryAssetStorage.class);

	private final Cloudinary cloudinary;

	public CloudinaryAssetStorage(String cloudinaryUrl) {
		this(new Cloudinary(CloudinaryImageStorage.normalize(cloudinaryUrl)));
	}

	/** For tests: a Cloudinary whose uploader is a mock. */
	CloudinaryAssetStorage(Cloudinary cloudinary) {
		this.cloudinary = cloudinary;
		cloudinary.config.secure = true;
	}

	@Override
	public boolean isEnabled() {
		return true;
	}

	@Override
	public StoredAsset upload(byte[] bytes, AssetTypes.Kind kind) {
		return send(bytes, ObjectUtils.asMap("folder", FOLDER), "upload");
	}

	@Override
	public StoredAsset replace(String publicId, byte[] bytes, AssetTypes.Kind kind) {
		// Same public id: the file is overwritten and CDN copies invalidated; the version (and so the URL) changes
		return send(bytes, ObjectUtils.asMap("public_id", publicId, "overwrite", true, "invalidate", true), "replace");
	}

	private StoredAsset send(byte[] bytes, Map<String, Object> extra, String what) {
		Map<String, Object> options = new HashMap<>(extra);
		options.put("resource_type", "image");
		// return_error: an error comes back as {error: {http_code, message}} instead of a bare exception
		options.put("return_error", true);
		Map<?, ?> result;
		try {
			result = cloudinary.uploader().upload(bytes, options);
		}
		catch (Exception ex) {
			log.error("Cloudinary {} failed: {}: {}", what, ex.getClass().getSimpleName(),
					CloudinaryImageStorage.masked(cloudinary, ex.getMessage()));
			throw AssetStorageException.failed();
		}
		if (result != null && result.get("error") instanceof Map<?, ?> error) {
			int status = error.get("http_code") instanceof Number n ? n.intValue() : 0;
			log.error("Cloudinary {} refused: HTTP {} {}", what, status,
					CloudinaryImageStorage.masked(cloudinary, String.valueOf(error.get("message"))));
			throw status == 401 || status == 403 ? AssetStorageException.authFailed() : AssetStorageException.failed();
		}
		if (result == null || result.get("public_id") == null || result.get("secure_url") == null) {
			log.error("Unexpected Cloudinary {} response (keys {})", what, result == null ? "none" : result.keySet());
			throw AssetStorageException.failed();
		}
		return new StoredAsset((String) result.get("public_id"), (String) result.get("secure_url"),
				longValue(result.get("version")), intValue(result.get("width")), intValue(result.get("height")),
				intValue(result.get("pages")), longValue(result.get("bytes")));
	}

	@Override
	public void delete(String publicId) {
		try {
			Map<?, ?> result = cloudinary.uploader()
				.destroy(publicId, ObjectUtils.asMap("resource_type", "image", "invalidate", true));
			if (result != null && !"ok".equals(result.get("result")) && !"not found".equals(result.get("result"))) {
				log.warn("Cloudinary did not delete {}: {}", publicId, result.get("result"));
			}
		}
		catch (Exception ex) {
			// Best effort (see AssetStorage): an orphan file is harmless
			log.warn("Could not delete {} from Cloudinary: {}", publicId, ex.getMessage());
		}
	}

	private static Integer intValue(Object value) {
		return value instanceof Number n ? n.intValue() : null;
	}

	private static Long longValue(Object value) {
		return value instanceof Number n ? n.longValue() : null;
	}
}
