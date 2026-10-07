package com.nutshop.auth;

import com.nutshop.config.JwtProperties;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import java.time.Duration;

/** Writes and clears the httpOnly auth cookies. */
@Component
public class AuthCookies {

	public static final String ACCESS_COOKIE = "access_token";
	public static final String REFRESH_COOKIE = "refresh_token";

	/** The access token is needed by every API call. */
	static final String ACCESS_PATH = "/api";
	/** The refresh token is only sent to /api/auth/* (refresh, logout), never to the rest of the API. */
	static final String REFRESH_PATH = "/api/auth";

	private final JwtProperties jwt;
	private final String sameSite;
	private final boolean secure;

	public AuthCookies(JwtProperties jwt, @Value("${app.cookie.same-site}") String sameSite,
			@Value("${app.cookie.secure}") boolean secure) {
		if ("None".equalsIgnoreCase(sameSite) && !secure) {
			throw new IllegalStateException("COOKIE_SAME_SITE=None requires COOKIE_SECURE=true");
		}
		this.jwt = jwt;
		this.sameSite = sameSite;
		this.secure = secure;
	}

	public void write(HttpServletResponse response, IssuedTokens tokens) {
		add(response, ACCESS_COOKIE, tokens.accessToken(), ACCESS_PATH, jwt.accessTokenTtl());
		add(response, REFRESH_COOKIE, tokens.refreshToken(), REFRESH_PATH, jwt.refreshTokenTtl());
	}

	public void clear(HttpServletResponse response) {
		add(response, ACCESS_COOKIE, "", ACCESS_PATH, Duration.ZERO);
		add(response, REFRESH_COOKIE, "", REFRESH_PATH, Duration.ZERO);
	}

	private void add(HttpServletResponse response, String name, String value, String path, Duration maxAge) {
		ResponseCookie cookie = ResponseCookie.from(name, value)
			.httpOnly(true)
			.secure(secure)
			.sameSite(sameSite)
			.path(path)
			.maxAge(maxAge)
			.build();
		response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
	}
}
