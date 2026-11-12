package com.nutshop.media;

import com.nutshop.common.ApiException;
import org.springframework.http.HttpStatus;

/**
 * The file store (Cloudinary) refused or failed a DAM upload. 503 so the author sees the Vietnamese message (the
 * frontend replaces other 5xx messages with a generic one).
 */
public class AssetStorageException extends ApiException {

	public static final String AUTH_FAILED = "ASSET_STORAGE_AUTH_FAILED";
	public static final String FAILED = "ASSET_STORAGE_FAILED";
	public static final String DISABLED = "ASSET_UPLOAD_DISABLED";

	private AssetStorageException(String code, String message) {
		super(HttpStatus.SERVICE_UNAVAILABLE, code, message);
	}

	static AssetStorageException authFailed() {
		return new AssetStorageException(AUTH_FAILED, "Kho file từ chối xác thực, kiểm tra cấu hình CLOUDINARY_URL");
	}

	static AssetStorageException failed() {
		return new AssetStorageException(FAILED, "Không tải được file lên kho, vui lòng thử lại sau ít phút");
	}

	static AssetStorageException disabled() {
		return new AssetStorageException(DISABLED,
				"Chưa cấu hình nơi lưu file (CLOUDINARY_URL). Liên hệ quản trị kỹ thuật.");
	}
}
