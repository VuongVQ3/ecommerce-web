package com.nutshop.auth;

import com.nutshop.common.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.Duration;
import java.util.Map;

/**
 * Server-side check of a Cloudflare Turnstile token (https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).
 * Fails closed: an invalid token is a 400, Cloudflare being unreachable is a 503; registration never skips the check.
 * In tests and local development, Cloudflare's test secret {@code 1x0000000000000000000000000000000AA} always passes.
 */
@Component
public class TurnstileVerifier {

	public static final String FAILED_CODE = "TURNSTILE_FAILED";
	static final String FAILED_MESSAGE = "Xác minh chống spam không thành công. Vui lòng thử lại.";
	static final String UNAVAILABLE_MESSAGE = "Không thể xác minh chống spam lúc này. Vui lòng thử lại sau ít phút.";

	private static final Logger log = LoggerFactory.getLogger(TurnstileVerifier.class);

	private final RestClient client;
	private final String secretKey;

	@Autowired
	public TurnstileVerifier(@Value("${app.turnstile.secret-key}") String secretKey) {
		this(RestClient.builder().requestFactory(timeouts()), secretKey);
	}

	/** For tests: the builder may be bound to a MockRestServiceServer. */
	TurnstileVerifier(RestClient.Builder builder, String secretKey) {
		if (!StringUtils.hasText(secretKey)) {
			throw new IllegalStateException("TURNSTILE_SECRET_KEY must be set (use Cloudflare's test key in development)");
		}
		this.client = builder.baseUrl("https://challenges.cloudflare.com").build();
		this.secretKey = secretKey.trim();
	}

	private static SimpleClientHttpRequestFactory timeouts() {
		var factory = new SimpleClientHttpRequestFactory();
		factory.setConnectTimeout(Duration.ofSeconds(5));
		factory.setReadTimeout(Duration.ofSeconds(5));
		return factory;
	}

	public void verify(String token, String remoteIp) {
		if (!StringUtils.hasText(token)) {
			throw new ApiException(HttpStatus.BAD_REQUEST, FAILED_CODE, FAILED_MESSAGE);
		}
		var form = new LinkedMultiValueMap<String, String>();
		form.add("secret", secretKey);
		form.add("response", token);
		if (remoteIp != null) {
			form.add("remoteip", remoteIp);
		}
		Map<?, ?> result;
		try {
			result = client.post()
				.uri("/turnstile/v0/siteverify")
				.contentType(MediaType.APPLICATION_FORM_URLENCODED)
				.body(form)
				.retrieve()
				.body(Map.class);
		}
		catch (RestClientException ex) {
			log.error("Turnstile siteverify call failed", ex);
			throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, FAILED_CODE, UNAVAILABLE_MESSAGE);
		}
		if (result == null || !Boolean.TRUE.equals(result.get("success"))) {
			log.info("Turnstile rejected a token: {}", result == null ? "empty response" : result.get("error-codes"));
			throw new ApiException(HttpStatus.BAD_REQUEST, FAILED_CODE, FAILED_MESSAGE);
		}
	}
}
