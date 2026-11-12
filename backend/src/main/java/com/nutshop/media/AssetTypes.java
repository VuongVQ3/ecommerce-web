package com.nutshop.media;

import java.util.Locale;
import java.util.Optional;
import java.util.Set;

/**
 * Detects what a DAM file really is from its first bytes (magic numbers): JPEG, PNG and WebP through
 * {@link ImageTypes}, PDF by its "%PDF-" header. {@link #check} also compares the file name's extension, so a PDF
 * renamed to .jpg or a program renamed to .pdf is refused.
 */
public final class AssetTypes {

	public enum Kind {
		IMAGE, PDF
	}

	public enum AssetType {
		IMAGE_JPEG(Kind.IMAGE, "image/jpeg", Set.of("jpg", "jpeg", "jfif")),
		IMAGE_PNG(Kind.IMAGE, "image/png", Set.of("png")),
		IMAGE_WEBP(Kind.IMAGE, "image/webp", Set.of("webp")),
		PDF(Kind.PDF, "application/pdf", Set.of("pdf"));

		private final Kind kind;
		private final String mime;
		private final Set<String> extensions;

		AssetType(Kind kind, String mime, Set<String> extensions) {
			this.kind = kind;
			this.mime = mime;
			this.extensions = extensions;
		}

		public Kind kind() {
			return kind;
		}

		public String mime() {
			return mime;
		}

		boolean allowsExtension(String extension) {
			return extensions.contains(extension);
		}
	}

	private static final byte[] PDF_HEADER = "%PDF-".getBytes();

	private AssetTypes() {
	}

	/** The type by content alone; empty for anything else (and for no bytes at all). */
	public static Optional<AssetType> detect(byte[] bytes) {
		if (bytes == null || bytes.length == 0) {
			return Optional.empty();
		}
		var image = ImageTypes.detect(bytes);
		if (image.isPresent()) {
			return Optional.of(switch (image.get()) {
				case JPEG -> AssetType.IMAGE_JPEG;
				case PNG -> AssetType.IMAGE_PNG;
				case WEBP -> AssetType.IMAGE_WEBP;
			});
		}
		if (bytes.length >= PDF_HEADER.length) {
			for (int i = 0; i < PDF_HEADER.length; i++) {
				if (bytes[i] != PDF_HEADER[i]) {
					return Optional.empty();
				}
			}
			return Optional.of(AssetType.PDF);
		}
		return Optional.empty();
	}

	/**
	 * The type by content, provided the file name's extension (when it has one) names the same type: "gia.pdf" that
	 * is really a JPEG, or "anh.jpg" that is really a PDF, is refused.
	 */
	public static Optional<AssetType> check(byte[] bytes, String fileName) {
		String extension = extension(fileName);
		return detect(bytes).filter(type -> extension.isEmpty() || type.allowsExtension(extension));
	}

	/** "Bảng giá.PDF" → "pdf"; "" without one. */
	public static String extension(String fileName) {
		if (fileName == null) {
			return "";
		}
		String name = fileName.substring(Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\')) + 1);
		int dot = name.lastIndexOf('.');
		return dot <= 0 || dot == name.length() - 1 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
	}
}
