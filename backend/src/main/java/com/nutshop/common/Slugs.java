package com.nutshop.common;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

/** URL slugs from Vietnamese text: "Hạt điều rang muối" → "hat-dieu-rang-muoi". */
public final class Slugs {

	public static final Pattern VALID = Pattern.compile("^[a-z0-9]+(?:-[a-z0-9]+)*$");
	private static final Pattern MARKS = Pattern.compile("\\p{M}+");
	private static final Pattern NON_ALNUM = Pattern.compile("[^a-z0-9]+");

	private Slugs() {
	}

	public static String from(String text) {
		// đ/Đ are separate letters, not d + accent, so NFD does not decompose them
		String base = text.replace('đ', 'd').replace('Đ', 'D');
		String plain = MARKS.matcher(Normalizer.normalize(base, Normalizer.Form.NFD)).replaceAll("");
		String slug = NON_ALNUM.matcher(plain.toLowerCase(Locale.ROOT)).replaceAll("-").replaceAll("^-+|-+$", "");
		return slug.length() > 180 ? slug.substring(0, 180).replaceAll("-+$", "") : slug;
	}

	public static boolean isValid(String slug) {
		return slug != null && slug.length() <= 200 && VALID.matcher(slug).matches();
	}
}
