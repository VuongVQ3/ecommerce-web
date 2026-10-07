package com.nutshop.auth;

import com.nutshop.common.UnauthorizedException;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GoogleTokenVerifierTests {

	@Test
	void isDisabledWithoutClientId() {
		var verifier = new GoogleTokenVerifier("  ");

		assertThat(verifier.clientId()).isNull();
		assertThatThrownBy(() -> verifier.verify("anything")).isInstanceOf(ResponseStatusException.class);
	}

	@Test
	void rejectsMalformedToken() {
		var verifier = new GoogleTokenVerifier("client-123.apps.googleusercontent.com");

		assertThat(verifier.clientId()).isEqualTo("client-123.apps.googleusercontent.com");
		assertThatThrownBy(() -> verifier.verify("not-a-jwt")).isInstanceOf(UnauthorizedException.class);
	}
}
