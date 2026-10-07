package com.nutshop.auth;

import com.nutshop.IntegrationTest;
import com.nutshop.mail.EmailMessage;
import com.nutshop.security.RateLimiter;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import testsupport.CapturingEmailSender;
import testsupport.RegisterJson;

import java.time.Duration;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
@Import(CapturingEmailSender.Config.class)
class PasswordResetE2ETest {

	private static final String OLD_PASSWORD = "matkhau123";
	private static final String NEW_PASSWORD = "matkhaumoi456";
	private static final Pattern LINK = Pattern.compile("http://localhost:5173/dat-lai-mat-khau\\?token=([A-Za-z0-9_-]{43})");

	@Autowired
	MockMvc mvc;

	@Autowired
	CapturingEmailSender mailbox;

	@Autowired
	JdbcTemplate jdbc;

	@Autowired
	RateLimiter authRateLimiter;

	@Autowired
	RateLimiter passwordResetRateLimiter;

	@BeforeEach
	void reset() {
		mailbox.clear();
		authRateLimiter.reset();
		passwordResetRateLimiter.reset();
	}

	// ---- helpers --------------------------------------------------------------------------------------------

	private ResultActions postJson(String url, String json, Cookie... cookies) throws Exception {
		var request = post(url).header("X-Requested-With", "XMLHttpRequest").contentType(MediaType.APPLICATION_JSON).content(json);
		if (cookies.length > 0) {
			request.cookie(cookies);
		}
		return mvc.perform(request);
	}

	/** Registers a user and returns its refresh cookie (an existing session). */
	private Cookie register(String email) throws Exception {
		return postJson("/api/auth/register", RegisterJson.of("Trần Bình", email, OLD_PASSWORD))
			.andExpect(status().isCreated())
			.andReturn()
			.getResponse()
			.getCookie(AuthCookies.REFRESH_COOKIE);
	}

	private ResultActions forgot(String email) throws Exception {
		return postJson("/api/auth/forgot-password", "{\"email\":\"" + email + "\"}");
	}

	private ResultActions reset(String token, String newPassword) throws Exception {
		return postJson("/api/auth/reset-password", "{\"token\":\"" + token + "\",\"newPassword\":\"" + newPassword + "\"}");
	}

	private ResultActions login(String email, String password) throws Exception {
		return postJson("/api/auth/login", "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}");
	}

	/** Requests a reset link and returns the token from the emailed link. */
	private String requestToken(String email) throws Exception {
		forgot(email).andExpect(status().isAccepted());
		EmailMessage mail = mailbox.next(Duration.ofSeconds(5));
		assertThat(mail).as("reset email").isNotNull();
		assertThat(mail.to()).isEqualTo(email);
		Matcher m = LINK.matcher(mail.text());
		assertThat(m.find()).as("link in email text").isTrue();
		assertThat(mail.html()).contains(m.group(0));
		return m.group(1);
	}

	private static String uniqueEmail() {
		return "reset-" + UUID.randomUUID() + "@example.com";
	}

	// ---- tests ----------------------------------------------------------------------------------------------

	@Test
	void sameResponseForKnownAndUnknownEmail() throws Exception {
		String known = uniqueEmail();
		register(known);

		String forKnown = forgot(known).andExpect(status().isAccepted()).andReturn().getResponse().getContentAsString();
		String forUnknown = forgot(uniqueEmail()).andExpect(status().isAccepted())
			.andExpect(jsonPath("$.message").value(AuthController.FORGOT_PASSWORD_MESSAGE))
			.andReturn().getResponse().getContentAsString();

		assertThat(forKnown).isEqualTo(forUnknown);
		assertThat(mailbox.next(Duration.ofSeconds(5))).isNotNull(); // the known one
		assertThat(mailbox.next(Duration.ofMillis(500))).isNull(); // nothing for the unknown one
	}

	@Test
	void resetChangesPasswordAndSignsOutEveryOldSession() throws Exception {
		String email = uniqueEmail();
		Cookie oldSession = register(email);
		String token = requestToken(email);

		var result = reset(token, NEW_PASSWORD).andExpect(status().isNoContent()).andReturn();
		assertThat(result.getResponse().getCookie(AuthCookies.REFRESH_COOKIE).getMaxAge()).isZero();

		// The session that existed before the reset is gone
		mvc.perform(post("/api/auth/refresh").header("X-Requested-With", "XMLHttpRequest").cookie(oldSession))
			.andExpect(status().isUnauthorized());
		login(email, OLD_PASSWORD).andExpect(status().isUnauthorized());
		login(email, NEW_PASSWORD).andExpect(status().isOk());
	}

	@Test
	void linkCanOnlyBeUsedOnce() throws Exception {
		String email = uniqueEmail();
		register(email);
		String token = requestToken(email);

		reset(token, NEW_PASSWORD).andExpect(status().isNoContent());
		reset(token, "matkhaukhac789").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail").value(PasswordResetService.INVALID_LINK));
		login(email, NEW_PASSWORD).andExpect(status().isOk());
	}

	@Test
	void expiredLinkIsRejected() throws Exception {
		String email = uniqueEmail();
		register(email);
		String token = requestToken(email);
		jdbc.update("UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute' WHERE token_hash = ?",
				SecureTokens.hash(token));

		reset(token, NEW_PASSWORD).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail").value(PasswordResetService.INVALID_LINK));
		login(email, OLD_PASSWORD).andExpect(status().isOk());
	}

	@Test
	void requestingANewLinkInvalidatesThePreviousOne() throws Exception {
		String email = uniqueEmail();
		register(email);
		String first = requestToken(email);
		String second = requestToken(email);

		reset(first, NEW_PASSWORD).andExpect(status().isBadRequest());
		reset(second, NEW_PASSWORD).andExpect(status().isNoContent());
	}

	@Test
	void unknownTokenAndWeakPasswordAreRejected() throws Exception {
		reset("khong-ton-tai", NEW_PASSWORD).andExpect(status().isBadRequest());
		reset("abc", "12345678").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors.newPassword").value("Mật khẩu phải có cả chữ và số"));
	}

	@Test
	void forgotPasswordIsLimitedPerEmail() throws Exception {
		String email = uniqueEmail();
		for (int i = 0; i < 3; i++) {
			forgot(email).andExpect(status().isAccepted());
			authRateLimiter.reset(); // isolate the per-email limit from the per-IP one
		}
		forgot(email).andExpect(status().isTooManyRequests())
			.andExpect(jsonPath("$.detail").value(PasswordResetService.TOO_MANY_REQUESTS));
		// A different address is unaffected
		forgot(uniqueEmail()).andExpect(status().isAccepted());
	}
}
