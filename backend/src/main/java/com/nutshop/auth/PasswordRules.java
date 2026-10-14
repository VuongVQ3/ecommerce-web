package com.nutshop.auth;

/** The password rules of registration (AuthDtos.PASSWORD_PATTERN), as a check on a raw password. */
public final class PasswordRules {

	private PasswordRules() {
	}

	public static boolean meets(String raw) {
		return raw != null && raw.length() >= 8 && raw.length() <= 72 && raw.matches(AuthDtos.PASSWORD_PATTERN);
	}
}
