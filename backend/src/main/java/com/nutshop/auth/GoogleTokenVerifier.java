package com.nutshop.auth;

import com.nutshop.common.UnauthorizedException;
import org.springframework.beans.factory.annotation.Autowired;
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
 * issuer and audience (our client ID), and that Google verified the email. Deliberately not a bean of type
 * JwtDecoder, so it does not replace the decoder that validates our own access tokens. Tokens are never logged.
 */
@Component
public class GoogleTokenVerifier {

	private static final String GOOGLE_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";
	/** Google issues both forms (see "Verify the Google ID token" in the Identity Services docs). */
	static final Set<String> GOOGLE_ISSUERS = Set.of("https://accounts.google.com", "accounts.google.com");
	/** Same answer whatever was wrong, so a caller learns nothing about the token. */
	static final String FAILED = "Đăng nhập Google không thành công. Vui lòng thử lại.";

	public record GoogleUser(String googleId, String email, String name) {
	}

	private final String clientId;
	private final JwtDecoder decoder;

	@Autowired
	public GoogleTokenVerifier(@Value("${app.google.client-id:}") String clientId) {
		this(clientId, NimbusJwtDecoder.withJwkSetUri(GOOGLE_JWKS_URI).build());
	}

	/** Tests: the same checks on top of a decoder that trusts a local key instead of Google's. */
	GoogleTokenVerifier(String clientId, NimbusJwtDecoder decoder) {
		this.clientId = StringUtils.hasText(clientId) ? clientId.trim() : null;
		if (this.clientId != null) {
			decoder.setJwtValidator(validator(this.clientId));
		}
		this.decoder = this.clientId == null ? null : decoder;
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
			throw new UnauthorizedException(FAILED);
		}
		String email = jwt.getClaimAsString("email");
		if (!StringUtils.hasText(jwt.getSubject()) || !StringUtils.hasText(email)
				|| !Boolean.TRUE.equals(jwt.getClaimAsBoolean("email_verified"))) {
			throw new UnauthorizedException(FAILED);
		}
		return new GoogleUser(jwt.getSubject(), email, jwt.getClaimAsString("name"));
	}

	/** Expiry and not-before (with the default clock skew), issuer, audience. */
	private static OAuth2TokenValidator<Jwt> validator(String clientId) {
		OAuth2TokenValidator<Jwt> issuer = jwt -> check(GOOGLE_ISSUERS.contains(jwt.getClaimAsString("iss")),
				"Unexpected issuer");
		OAuth2TokenValidator<Jwt> audience = jwt -> check(jwt.getAudience() != null
				&& jwt.getAudience().contains(clientId), "Token was not issued for this client");
		return new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefault(), issuer, audience);
	}

	private static OAuth2TokenValidatorResult check(boolean ok, String description) {
		return ok ? OAuth2TokenValidatorResult.success()
				: OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", description, null));
	}
}
