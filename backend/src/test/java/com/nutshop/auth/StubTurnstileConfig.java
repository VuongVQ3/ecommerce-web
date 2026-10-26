package com.nutshop.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.http.client.MockClientHttpResponse;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;

/**
 * Integration tests must not reach out to Cloudflare. This stubs the Turnstile {@code /siteverify} call so it returns
 * {@code success:true} for any non-blank token, exactly as Cloudflare's always-pass test secret does, while the real
 * {@link TurnstileVerifier} still rejects a blank token before any call. No network is used.
 */
@TestConfiguration(proxyBeanMethods = false)
public class StubTurnstileConfig {

	@Bean
	@Primary
	TurnstileVerifier stubTurnstileVerifier(@Value("${app.turnstile.secret-key}") String secretKey) {
		RestClient.Builder builder = RestClient.builder().requestInterceptor((request, body, execution) -> {
			MockClientHttpResponse response = new MockClientHttpResponse(
					"{\"success\":true}".getBytes(StandardCharsets.UTF_8), HttpStatus.OK);
			response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
			return response;
		});
		return new TurnstileVerifier(builder, secretKey);
	}
}
