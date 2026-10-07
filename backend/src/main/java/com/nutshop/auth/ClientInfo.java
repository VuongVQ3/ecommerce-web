package com.nutshop.auth;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;

/** Where a login came from; stored with each refresh token for auditing. */
public record ClientInfo(String userAgent, String ip) {

	public static ClientInfo from(HttpServletRequest request) {
		return new ClientInfo(truncate(request.getHeader(HttpHeaders.USER_AGENT), 512),
				truncate(request.getRemoteAddr(), 64));
	}

	private static String truncate(String value, int max) {
		return value == null || value.length() <= max ? value : value.substring(0, max);
	}
}
