package com.nutshop.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties(prefix = "app.jwt")
public record JwtProperties(String secret, Duration accessTokenTtl, Duration refreshTokenTtl) {

	public JwtProperties {
		if (secret == null || secret.length() < 32) {
			throw new IllegalArgumentException("JWT_SECRET must be set and at least 32 characters long");
		}
	}
}
