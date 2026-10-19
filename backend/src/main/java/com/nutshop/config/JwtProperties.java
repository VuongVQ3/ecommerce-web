package com.nutshop.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * @param refreshReuseGrace a refresh token presented again this soon after it was rotated is the same browser racing
 *     itself (two tabs refreshing at once), not a theft: it is refused without revoking the other sessions
 */
@ConfigurationProperties(prefix = "app.jwt")
public record JwtProperties(String secret, Duration accessTokenTtl, Duration refreshTokenTtl, Duration refreshReuseGrace) {

	public JwtProperties {
		if (secret == null || secret.length() < 32) {
			throw new IllegalArgumentException("JWT_SECRET must be set and at least 32 characters long");
		}
		refreshReuseGrace = refreshReuseGrace == null ? Duration.ofSeconds(30) : refreshReuseGrace;
	}
}
