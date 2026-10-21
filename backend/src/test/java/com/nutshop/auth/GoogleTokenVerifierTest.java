package com.nutshop.auth;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.nutshop.auth.GoogleTokenVerifier.GoogleUser;
import com.nutshop.common.UnauthorizedException;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.NoSuchAlgorithmException;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.Date;
import java.util.function.UnaryOperator;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The real checks on real signed tokens: a local RSA key stands in for Google's, everything else (issuer, audience,
 * expiry, email_verified) is what runs in production.
 */
class GoogleTokenVerifierTest {

	private static final String CLIENT_ID = "123-abc.apps.googleusercontent.com";

	private static KeyPair googleKey;
	private static KeyPair otherKey;

	private final GoogleTokenVerifier verifier = new GoogleTokenVerifier(CLIENT_ID,
			NimbusJwtDecoder.withPublicKey((RSAPublicKey) googleKey.getPublic()).build());

	@BeforeAll
	static void keys() throws NoSuchAlgorithmException {
		KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
		generator.initialize(2048);
		googleKey = generator.generateKeyPair();
		otherKey = generator.generateKeyPair();
	}

	/** What Google Identity Services sends, valid for an hour. */
	private static JWTClaimsSet.Builder claims() {
		Instant now = Instant.now();
		return new JWTClaimsSet.Builder().issuer("https://accounts.google.com")
			.audience(CLIENT_ID)
			.subject("1098765432101234567890")
			.issueTime(Date.from(now))
			.expirationTime(Date.from(now.plusSeconds(3600)))
			.claim("email", "Mai.Tran@Gmail.com")
			.claim("email_verified", true)
			.claim("name", "Trần Thị Mai");
	}

	private static String token(UnaryOperator<JWTClaimsSet.Builder> change, KeyPair key) throws JOSEException {
		SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID("k1").build(),
				change.apply(claims()).build());
		jwt.sign(new RSASSASigner((RSAPrivateKey) key.getPrivate()));
		return jwt.serialize();
	}

	private static String token(UnaryOperator<JWTClaimsSet.Builder> change) throws JOSEException {
		return token(change, googleKey);
	}

	private void assertRejected(String idToken) {
		assertThatThrownBy(() -> verifier.verify(idToken)).isInstanceOf(UnauthorizedException.class)
			.hasMessage(GoogleTokenVerifier.FAILED);
	}

	@ParameterizedTest
	@ValueSource(strings = { "accounts.google.com", "https://accounts.google.com" })
	void acceptsBothIssuersGoogleUses(String issuer) throws JOSEException {
		GoogleUser user = verifier.verify(token(c -> c.issuer(issuer)));

		assertThat(user).isEqualTo(new GoogleUser("1098765432101234567890", "Mai.Tran@Gmail.com", "Trần Thị Mai"));
	}

	@ParameterizedTest
	@ValueSource(strings = { "https://evil.example", "http://accounts.google.com", "accounts.google.com.evil.example" })
	void rejectsAnyOtherIssuer(String issuer) throws JOSEException {
		assertRejected(token(c -> c.issuer(issuer)));
	}

	@Test
	void rejectsATokenForAnotherClient() throws JOSEException {
		assertRejected(token(c -> c.audience("someone-else.apps.googleusercontent.com")));
	}

	@Test
	void rejectsAnExpiredToken() throws JOSEException {
		Instant twoHoursAgo = Instant.now().minusSeconds(7200);
		assertRejected(token(c -> c.issueTime(Date.from(twoHoursAgo)).expirationTime(Date.from(twoHoursAgo.plusSeconds(3600)))));
	}

	@Test
	void rejectsATokenNotSignedByGoogle() throws JOSEException {
		assertRejected(token(c -> c, otherKey));
	}

	@Test
	void rejectsSomethingThatIsNotAToken() {
		assertRejected("not-a-jwt");
	}

	@Test
	void rejectsAnEmailGoogleHasNotVerified() throws JOSEException {
		assertRejected(token(c -> c.claim("email_verified", false)));
		assertRejected(token(c -> c.claim("email_verified", null)));
	}

	@Test
	void rejectsATokenWithoutEmail() throws JOSEException {
		assertRejected(token(c -> c.claim("email", null)));
	}

	@Test
	void notConfiguredWithoutAClientId() {
		GoogleTokenVerifier off = new GoogleTokenVerifier(" ",
				NimbusJwtDecoder.withPublicKey((RSAPublicKey) googleKey.getPublic()).build());

		assertThat(off.clientId()).isNull();
		assertThatThrownBy(() -> off.verify("x")).hasMessageContaining("chưa được cấu hình");
	}
}
