package com.nutshop.auth;

import com.nutshop.config.JwtProperties;
import com.nutshop.user.User;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;

/** Issues short-lived access tokens. */
@Service
public class TokenService {

	public static final String ROLE_CLAIM = "role";

	private final JwtEncoder encoder;
	private final JwtProperties props;
	private final Clock clock;

	public TokenService(JwtEncoder encoder, JwtProperties props, Clock clock) {
		this.encoder = encoder;
		this.props = props;
		this.clock = clock;
	}

	/** Payload is deliberately minimal: sub (user id) and role, plus the standard iat/exp. */
	public String issueAccessToken(User user) {
		Instant now = clock.instant();
		var claims = JwtClaimsSet.builder()
			.subject(user.getId().toString())
			.claim(ROLE_CLAIM, user.getRole().name())
			.issuedAt(now)
			.expiresAt(now.plus(props.accessTokenTtl()))
			.build();
		var header = JwsHeader.with(MacAlgorithm.HS256).build();
		return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
	}
}
