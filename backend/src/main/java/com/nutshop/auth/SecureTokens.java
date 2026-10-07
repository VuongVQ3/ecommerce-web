package com.nutshop.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

/** Opaque one-time tokens (refresh, password reset): random value for the client, SHA-256 hash for the database. */
final class SecureTokens {

	private static final SecureRandom RANDOM = new SecureRandom();

	private SecureTokens() {
	}

	/** 32 random bytes, base64url without padding (43 characters, safe in URLs and cookies). */
	static String generate() {
		byte[] bytes = new byte[32];
		RANDOM.nextBytes(bytes);
		return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
	}

	static String hash(String rawToken) {
		try {
			byte[] digest = MessageDigest.getInstance("SHA-256").digest(rawToken.getBytes(StandardCharsets.UTF_8));
			return HexFormat.of().formatHex(digest);
		}
		catch (NoSuchAlgorithmException ex) {
			throw new IllegalStateException("SHA-256 not available", ex);
		}
	}
}
