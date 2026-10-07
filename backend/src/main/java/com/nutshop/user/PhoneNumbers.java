package com.nutshop.user;

import java.util.regex.Pattern;

/**
 * Vietnamese phone numbers. Users type them in many shapes ("0912 345 678", "0912.345.678", "+84 912 345 678",
 * "84912345678"); we store one canonical form: 10 digits starting with 0. Keep in sync with frontend lib/phone.ts.
 */
public final class PhoneNumbers {

	private static final Pattern SEPARATORS = Pattern.compile("[\\s\\u00A0.\\-]");
	private static final Pattern CANONICAL = Pattern.compile("0\\d{9}");

	private PhoneNumbers() {
	}

	/**
	 * Removes spaces, dots and dashes and turns the +84 / 84 country code into a leading 0. Returns null for blank
	 * input. The result is not guaranteed valid; check it with {@link #isValid}.
	 */
	public static String normalize(String raw) {
		if (raw == null) {
			return null;
		}
		String digits = SEPARATORS.matcher(raw).replaceAll("");
		if (digits.isEmpty()) {
			return null;
		}
		if (digits.startsWith("+84")) {
			return "0" + digits.substring(3);
		}
		// Without "+", only treat 84 as a country code when the rest is a 9-digit subscriber number
		if (digits.startsWith("84") && digits.length() == 11) {
			return "0" + digits.substring(2);
		}
		return digits;
	}

	public static boolean isValid(String normalized) {
		return normalized != null && CANONICAL.matcher(normalized).matches();
	}
}
