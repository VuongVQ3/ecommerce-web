package com.nutshop.media;

import com.nutshop.common.ApiException;
import org.springframework.http.HttpStatus;

/**
 * The image store (Cloudinary) refused or failed an upload. 503 so the admin sees the Vietnamese message (the
 * frontend replaces other 5xx messages with a generic one).
 */
public class ImageStorageException extends ApiException {

	public static final String AUTH_FAILED = "IMAGE_STORAGE_AUTH_FAILED";
	public static final String FAILED = "IMAGE_STORAGE_FAILED";

	private ImageStorageException(String code, String message) {
		super(HttpStatus.SERVICE_UNAVAILABLE, code, message);
	}

	/** 401/403 from Cloudinary: API key, secret or cloud name do not match. */
	static ImageStorageException authFailed() {
		return new ImageStorageException(AUTH_FAILED, "Kho ảnh từ chối xác thực, kiểm tra cấu hình CLOUDINARY_URL");
	}

	static ImageStorageException failed() {
		return new ImageStorageException(FAILED, "Không tải được ảnh lên kho ảnh, vui lòng thử lại sau ít phút");
	}
}
