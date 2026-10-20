package com.nutshop.common;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Vietnamese text compared without case or accents: "Hạt Điều" and "hat dieu" fold to the same "hat dieu". The
 * database does the same with {@code lower(translate(name, ACCENTED, PLAIN))}: translate() needs no extension
 * (unlike unaccent), and folding the accented capitals itself also works where lower() only knows ASCII.
 */
public final class TextFold {

	private static final Pattern MARKS = Pattern.compile("\\p{M}+");

	/** Every Vietnamese letter with a diacritic, small and capital (plus đ/Đ) */
	public static final String ACCENTED;
	/** ACCENTED, character for character, as plain small letters */
	public static final String PLAIN;

	static {
		String small = "àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ";
		String all = small + small.toUpperCase(Locale.ROOT);
		StringBuilder plain = new StringBuilder(all.length());
		for (int i = 0; i < all.length(); i++) {
			plain.append(fold(String.valueOf(all.charAt(i))));
		}
		ACCENTED = all;
		PLAIN = plain.toString();
		if (ACCENTED.length() != PLAIN.length()) {
			throw new IllegalStateException("Every accented letter must fold to one letter");
		}
	}

	private TextFold() {
	}

	/** Small letters without accents; đ → d. */
	public static String fold(String text) {
		if (text == null) {
			return "";
		}
		// đ/Đ are separate letters, not d + accent, so NFD does not decompose them
		String base = text.replace('đ', 'd').replace('Đ', 'D');
		return MARKS.matcher(Normalizer.normalize(base, Normalizer.Form.NFD)).replaceAll("").toLowerCase(Locale.ROOT);
	}

	/** For LIKE ... ESCAPE '\': a search term matched literally. */
	public static String escapeLike(String text) {
		return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
	}
}
