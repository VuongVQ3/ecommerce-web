package com.nutshop.media;

import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.util.Map;

/**
 * Product images on Cloudinary through the official SDK (it signs the requests and reads Cloudinary's error
 * messages, which the old hand-made client lost on a 401). Configured from
 * CLOUDINARY_URL = cloudinary://API_KEY:API_SECRET@CLOUD_NAME; the key and secret never leave the server and are
 * never logged.
 */
public class CloudinaryImageStorage implements ImageStorage {

	private static final Logger log = LoggerFactory.getLogger(CloudinaryImageStorage.class);

	static final String FOLDER = "hat-lanh/products";

	private final Cloudinary cloudinary;

	public CloudinaryImageStorage(String cloudinaryUrl) {
		this(new Cloudinary(normalize(cloudinaryUrl)));
	}

	/** For tests: a Cloudinary whose uploader is a mock. */
	CloudinaryImageStorage(Cloudinary cloudinary) {
		this.cloudinary = cloudinary;
		cloudinary.config.secure = true;
		log.info("Cloudinary configured: cloud_name={}", cloudinary.config.cloudName);
	}

	/**
	 * The value as pasted from the Cloudinary console or a .env line: surrounding spaces/quotes and a leading
	 * "CLOUDINARY_URL=" are dropped. Must then be cloudinary://API_KEY:API_SECRET@CLOUD_NAME (the secret may be
	 * percent-encoded; the SDK decodes it).
	 */
	static String normalize(String raw) {
		String url = raw == null ? "" : raw.strip();
		if (url.startsWith("CLOUDINARY_URL=")) {
			url = url.substring("CLOUDINARY_URL=".length()).strip();
		}
		if (url.length() >= 2 && (url.startsWith("\"") && url.endsWith("\"") || url.startsWith("'") && url.endsWith("'"))) {
			url = url.substring(1, url.length() - 1).strip();
		}
		URI uri;
		try {
			uri = URI.create(url);
		}
		catch (IllegalArgumentException ex) {
			throw malformed();
		}
		String userInfo = uri.getRawUserInfo();
		if (!"cloudinary".equals(uri.getScheme()) || uri.getHost() == null || userInfo == null
				|| userInfo.indexOf(':') <= 0 || userInfo.endsWith(":")) {
			throw malformed();
		}
		return url;
	}

	private static IllegalStateException malformed() {
		// Never echo the value: it holds the secret
		return new IllegalStateException("CLOUDINARY_URL must look like cloudinary://API_KEY:API_SECRET@CLOUD_NAME");
	}

	@Override
	public boolean isEnabled() {
		return true;
	}

	@Override
	public StoredImage upload(byte[] bytes, ImageTypes.ImageType type) {
		Map<?, ?> result;
		try {
			// return_error: an error comes back as {error: {http_code, message}} instead of a bare exception
			result = cloudinary.uploader()
				.upload(bytes, ObjectUtils.asMap("folder", FOLDER, "resource_type", "image", "return_error", true));
		}
		catch (Exception ex) {
			log.error("Cloudinary upload failed: {}: {}", ex.getClass().getSimpleName(), masked(ex.getMessage()));
			throw ImageStorageException.failed();
		}
		if (result != null && result.get("error") instanceof Map<?, ?> error) {
			int status = error.get("http_code") instanceof Number n ? n.intValue() : 0;
			// Cloudinary's message ("Invalid Signature…", "Invalid api_key 1234…") names the problem; the key it may
			// quote is masked, the secret is never in it
			log.error("Cloudinary upload refused: HTTP {} {}", status, masked(String.valueOf(error.get("message"))));
			throw status == 401 || status == 403 ? ImageStorageException.authFailed() : ImageStorageException.failed();
		}
		if (result == null || result.get("public_id") == null || result.get("secure_url") == null) {
			log.error("Unexpected Cloudinary upload response (keys {})", result == null ? "none" : result.keySet());
			throw ImageStorageException.failed();
		}
		return new StoredImage((String) result.get("public_id"), (String) result.get("secure_url"),
				number(result.get("width")), number(result.get("height")));
	}

	@Override
	public void delete(String publicId) {
		try {
			Map<?, ?> result = cloudinary.uploader().destroy(publicId, ObjectUtils.asMap("resource_type", "image"));
			if (result != null && !"ok".equals(result.get("result")) && !"not found".equals(result.get("result"))) {
				log.warn("Cloudinary did not delete {}: {}", publicId, result.get("result"));
			}
		}
		catch (Exception ex) {
			// Best effort (see ImageStorage): an orphan file is harmless
			log.warn("Could not delete {} from Cloudinary: {}", publicId, ex.getMessage());
		}
	}

	/** The API key as ****1234 wherever Cloudinary quotes it */
	private String masked(String message) {
		String key = cloudinary.config.apiKey;
		if (message == null || key == null || key.isEmpty()) {
			return message;
		}
		return message.replace(key, "****" + key.substring(Math.max(0, key.length() - 4)));
	}

	private static Integer number(Object value) {
		return value instanceof Number n ? n.intValue() : null;
	}
}
