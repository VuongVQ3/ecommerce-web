package com.nutshop.security;

import com.nutshop.TestcontainersConfiguration;
import com.nutshop.auth.StubTurnstileConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.client.RestTemplate;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static testsupport.RegisterJson.of;

/**
 * Regression for run-2 leads 1 and 2: three security filters used to match on the raw, undecoded request URI while
 * Spring Security and MVC route on the decoded path, so a percent-encoded spelling slipped past them. A real servlet
 * container is used on purpose — MockMvc does not reproduce Tomcat's raw-URI handling. Before the fix the encoded
 * requests below bypassed the filters; after it they are treated exactly like the plain spelling.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Import({ TestcontainersConfiguration.class, StubTurnstileConfig.class })
class EncodedPathFilterBypassTest {

	private static final String PASSWORD = "MatKhauManh123";

	@LocalServerPort
	int port;

	@Autowired
	JdbcTemplate jdbc;

	private final RestTemplate http = buildHttp();

	private static RestTemplate buildHttp() {
		RestTemplate template = new RestTemplate(new org.springframework.http.client.SimpleClientHttpRequestFactory());
		template.setErrorHandler(new org.springframework.web.client.ResponseErrorHandler() {
			@Override
			public boolean hasError(org.springframework.http.client.ClientHttpResponse response) {
				return false; // read 4xx/5xx status codes instead of throwing
			}
		});
		return template;
	}

	private URI url(String rawPath) {
		return URI.create("http://localhost:" + port + rawPath);
	}

	private ResponseEntity<String> send(HttpMethod method, String rawPath, HttpHeaders headers, String body) {
		return http.exchange(url(rawPath), method, new HttpEntity<>(body, headers), String.class);
	}

	private HttpHeaders xrw() {
		HttpHeaders h = new HttpHeaders();
		h.add("X-Requested-With", "XMLHttpRequest");
		h.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);
		return h;
	}

	// UserStatusFilter: a STAFF session flagged "must change password" is blocked on /api/admin/**; the encoded
	// spelling must be blocked the same way (before the fix it returned 200 with back-office data).
	@Test
	void encodedAdminPathStillHitsBackOfficeGate() {
		String email = "staff-" + UUID.randomUUID() + "@example.com";
		send(HttpMethod.POST, "/api/auth/register", xrw(), of("Staff", email, PASSWORD)).getStatusCode();
		jdbc.update("UPDATE users SET role = 'STAFF', password_change_required = true WHERE email = ?", email);

		ResponseEntity<String> login = send(HttpMethod.POST, "/api/auth/login", xrw(),
				"{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\"}");
		assertThat(login.getStatusCode().value()).isEqualTo(200);
		String accessCookie = accessCookie(login);

		HttpHeaders authed = new HttpHeaders();
		authed.add(HttpHeaders.COOKIE, accessCookie);

		int plain = send(HttpMethod.GET, "/api/admin/dashboard/now", authed, null).getStatusCode().value();
		int encoded = send(HttpMethod.GET, "/api/%61dmin/dashboard/now", authed, null).getStatusCode().value();

		assertThat(plain).isEqualTo(403);
		assertThat(encoded).as("encoded /api/%61dmin must hit the same back-office gate").isEqualTo(403);
	}

	// RateLimitFilter: the per-IP auth limit (5/min) must apply to the encoded spelling too. Distinct emails avoid the
	// separate per-email reset limiter, so only the per-IP filter can produce a 429.
	@Test
	void encodedAuthPathIsRateLimited() {
		int limited = 0;
		for (int i = 0; i < 7; i++) {
			int status = send(HttpMethod.POST, "/api/auth/forgot-p%61ssword", xrw(),
					"{\"email\":\"rl-" + i + "-" + UUID.randomUUID() + "@example.com\"}").getStatusCode().value();
			if (status == 429) {
				limited++;
			}
		}
		assertThat(limited).as("encoded /api/auth/forgot-p%61ssword must be rate limited").isGreaterThan(0);
	}

	// RequestedWithHeaderFilter: an unsafe request to an encoded /api path must still require X-Requested-With.
	@Test
	void encodedApiPathStillRequiresCsrfHeader() {
		HttpHeaders noHeader = new HttpHeaders();
		noHeader.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);
		int status = send(HttpMethod.POST, "/%61pi/auth/logout", noHeader, "").getStatusCode().value();
		assertThat(status).as("encoded /%61pi/** POST without X-Requested-With must be rejected").isEqualTo(403);
	}

	private static String accessCookie(ResponseEntity<String> response) {
		List<String> cookies = response.getHeaders().get(HttpHeaders.SET_COOKIE);
		assertThat(cookies).isNotNull();
		return cookies.stream().map(c -> c.split(";", 2)[0]).filter(c -> c.startsWith("access_token=")).findFirst()
				.orElseThrow(() -> new AssertionError("no access_token cookie in login response"));
	}
}
