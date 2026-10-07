package com.nutshop.auth;

import com.nutshop.common.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/** Cloudflare's answers are simulated here; the E2E tests hit the real siteverify with the test secret. */
class TurnstileVerifierTest {

	private static final String URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

	MockRestServiceServer cloudflare;
	TurnstileVerifier verifier;

	@BeforeEach
	void setUp() {
		RestClient.Builder builder = RestClient.builder();
		cloudflare = MockRestServiceServer.bindTo(builder).build();
		verifier = new TurnstileVerifier(builder, "secret-123");
	}

	@Test
	void acceptsSuccessfulVerificationAndSendsSecretTokenAndIp() {
		cloudflare.expect(requestTo(URL))
			.andExpect(method(org.springframework.http.HttpMethod.POST))
			.andExpect(content().formDataContains(java.util.Map.of("secret", "secret-123", "response", "tok", "remoteip", "1.2.3.4")))
			.andRespond(withSuccess("{\"success\":true,\"error-codes\":[]}", MediaType.APPLICATION_JSON));

		assertThatCode(() -> verifier.verify("tok", "1.2.3.4")).doesNotThrowAnyException();
		cloudflare.verify();
	}

	@Test
	void rejectsFailedVerificationWith400() {
		cloudflare.expect(requestTo(URL))
			.andRespond(withSuccess("{\"success\":false,\"error-codes\":[\"invalid-input-response\"]}",
					MediaType.APPLICATION_JSON));

		assertThatThrownBy(() -> verifier.verify("tok", null)).isInstanceOfSatisfying(ApiException.class, ex -> {
			org.assertj.core.api.Assertions.assertThat(ex.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
			org.assertj.core.api.Assertions.assertThat(ex.getCode()).isEqualTo(TurnstileVerifier.FAILED_CODE);
		});
	}

	@Test
	void cloudflareOutageFailsClosedWith503() {
		cloudflare.expect(requestTo(URL)).andRespond(withServerError());

		assertThatThrownBy(() -> verifier.verify("tok", null)).isInstanceOfSatisfying(ApiException.class,
				ex -> org.assertj.core.api.Assertions.assertThat(ex.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
	}

	@Test
	void missingTokenIsRejectedWithoutCallingCloudflare() {
		assertThatThrownBy(() -> verifier.verify(" ", null)).isInstanceOf(ApiException.class);
		cloudflare.verify();
	}
}
