package com.nutshop.media;

import java.util.Optional;

/**
 * Detects the real image type from the first bytes (magic numbers), ignoring the file name and the browser's
 * Content-Type: a PDF or script renamed to .jpg is rejected.
 */
public final class ImageTypes {

	public enum ImageType {
		JPEG("image/jpeg"), PNG("image/png"), WEBP("image/webp");

		private final String mime;

		ImageType(String mime) {
			this.mime = mime;
		}

		public String mime() {
			return mime;
		}
	}

	private static final byte[] PNG = { (byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n' };

	private ImageTypes() {
	}

	public static Optional<ImageType> detect(byte[] bytes) {
		if (bytes == null) {
			return Optional.empty();
		}
		if (bytes.length >= 3 && (bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xFF) == 0xD8 && (bytes[2] & 0xFF) == 0xFF) {
			return Optional.of(ImageType.JPEG);
		}
		if (startsWith(bytes, PNG, 0)) {
			return Optional.of(ImageType.PNG);
		}
		// RIFF....WEBP
		if (startsWith(bytes, "RIFF".getBytes(), 0) && startsWith(bytes, "WEBP".getBytes(), 8)) {
			return Optional.of(ImageType.WEBP);
		}
		return Optional.empty();
	}

	private static boolean startsWith(byte[] bytes, byte[] prefix, int offset) {
		if (bytes.length < offset + prefix.length) {
			return false;
		}
		for (int i = 0; i < prefix.length; i++) {
			if (bytes[offset + i] != prefix[i]) {
				return false;
			}
		}
		return true;
	}
}
