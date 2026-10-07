package com.nutshop.auth;

import com.nutshop.common.UnauthorizedException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import java.util.Set;

/**
 * Verifies Google ID tokens produced by Google Identity Services: signature (Google's public keys), expiry,
 * issuer and audience (our client ID). Deliberately not a bean of type JwtDecoder, so it does not replace the
 * decoder that validates our own access tokens.
 */
@Component
public class GoogleTokenVerifier {

	private static final String GOOGLE_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";
	private static final Set<String> GOOGLE_ISSUERS = Set.of("https://accounts.google.com", "accounts.google.com");

	public record GoogleUser(String googleId, String email, String name) {
	}

	private final String clientId;
	private final JwtDecoder decoder;

	public GoogleTokenVerifier(@Value("${app.google.client-id:}") String clientId) {
		this.clientId = StringUtils.hasText(clientId) ? clientId.trim() : null;
		this.decoder = this.clientId == null ? null : buildDecoder(this.clientId);
	}

	/** Null when Google sign-in is not configured. */
	public String clientId() {
		return clientId;
	}

	public GoogleUser verify(String idToken) {
		if (decoder == null) {
			throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Đăng nhập Google chưa được cấu hình");
		}
		Jwt jwt;
		try {
			jwt = decoder.decode(idToken);
		}
		catch (JwtException ex) {
			throw new UnauthorizedException("Phiên đăng nhập Google không hợp lệ, vui lòng thử lại");
		}
		String email = jwt.getClaimAsString("email");
		if (!StringUtils.hasText(email) || !Boolean.TRUE.equals(jwt.getClaimAsBoolean("email_verified"))) {
			throw new UnauthorizedException("Email Google chưa được xác minh");
		}
		return new GoogleUser(jwt.getSubject(), email, jwt.getClaimAsString("name"));
	}

	private static JwtDecoder buildDecoder(String clientId) {
		NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(GOOGLE_JWKS_URI).build();
		OAuth2TokenValidator<Jwt> issuer = jwt -> check(GOOGLE_ISSUERS.contains(jwt.getClaimAsString("iss")),
				"Unexpected issuer");
		OAuth2TokenValidator<Jwt> audience = jwt -> check(jwt.getAudience() != null
				&& jwt.getAudience().contains(clientId), "Token was not issued for this client");
		decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefault(), issuer, audience));
		return decoder;
	}

	private static OAuth2TokenValidatorResult check(boolean ok, String description) {
		return ok ? OAuth2TokenValidatorResult.success()
				: OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", description, null));
	}
}
