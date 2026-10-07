package com.nutshop.auth;

import com.nutshop.IntegrationTest;
import com.nutshop.security.RateLimiter;
import com.nutshop.user.User;
import com.nutshop.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import testsupport.RegisterJson;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * POST /api/auth/register: consent, phone normalization, error codes, honeypot and Turnstile. Turnstile is verified
 * for real against Cloudflare with its always-pass test secret (see application-test.properties): needs internet.
 */
@IntegrationTest
class RegistrationE2ETest {

	private static final String PASSWORD = "matkhau123";

	@Autowired
	MockMvc mvc;

	@Autowired
	UserRepository users;

	@Autowired
	RateLimiter authRateLimiter;

	@BeforeEach
	void resetRateLimits() {
		authRateLimiter.reset();
	}

	private ResultActions register(String json) throws Exception {
		return mvc.perform(post("/api/auth/register").header("X-Requested-With", "XMLHttpRequest")
			.contentType(MediaType.APPLICATION_JSON)
			.content(json));
	}

	private static String uniqueEmail() {
		return "reg-" + UUID.randomUUID() + "@example.com";
	}

	/** Unique, valid phone (10 digits starting with 09). */
	private static String uniquePhone() {
		return "09" + String.format("%08d", Math.floorMod(UUID.randomUUID().getLeastSignificantBits(), 100_000_000L));
	}

	@Test
	void registersWithConsentAndNormalizedPhone() throws Exception {
		String email = uniqueEmail();
		String phone = uniquePhone();
		String typed = "+84 " + phone.substring(1, 4) + "." + phone.substring(4, 7) + "." + phone.substring(7);

		register("{\"fullName\":\"Phạm Hạt\",\"email\":\"" + email + "\",\"password\":\"" + PASSWORD
				+ "\",\"phone\":\"" + typed + "\",\"acceptTerms\":true,\"marketingConsent\":true,\"turnstileToken\":\""
				+ RegisterJson.TURNSTILE_TEST_TOKEN + "\",\"website\":\"\"}")
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.phone").value(phone));

		User user = users.findByEmail(email).orElseThrow();
		assertThat(user.getTermsAcceptedAt()).isNotNull();
		assertThat(user.hasMarketingConsent()).isTrue();
		assertThat(user.getMarketingConsentAt()).isNotNull();
	}

	@Test
	void unknownFieldsSuchAsConfirmPasswordAreIgnored() throws Exception {
		String email = uniqueEmail();
		String json = RegisterJson.of("An", email, PASSWORD)
			.replace("}", ",\"confirmPassword\":\"khac-han-123\",\"price\":1}");

		register(json).andExpect(status().isCreated()).andExpect(jsonPath("$.confirmPassword").doesNotExist());
		assertThat(users.findByEmail(email)).isPresent();
	}

	@Test
	void marketingConsentDefaultsToOff() throws Exception {
		String email = uniqueEmail();
		register(RegisterJson.of("An", email, PASSWORD)).andExpect(status().isCreated());

		User user = users.findByEmail(email).orElseThrow();
		assertThat(user.hasMarketingConsent()).isFalse();
		assertThat(user.getMarketingConsentAt()).isNull();
	}

	@Test
	void missingOrFalseAcceptTermsIsRejected() throws Exception {
		String base = "{\"fullName\":\"An\",\"email\":\"" + uniqueEmail() + "\",\"password\":\"" + PASSWORD
				+ "\",\"turnstileToken\":\"" + RegisterJson.TURNSTILE_TEST_TOKEN + "\"";

		register(base + "}").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors.acceptTerms").value(AuthDtos.RegisterRequest.TERMS_REQUIRED));
		register(base + ",\"acceptTerms\":false}").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors.acceptTerms").value(AuthDtos.RegisterRequest.TERMS_REQUIRED));
	}

	@Test
	void filledHoneypotLooksSuccessfulButCreatesNothing() throws Exception {
		String email = uniqueEmail();
		String json = RegisterJson.of("Bot", email, PASSWORD).replace("}", ",\"website\":\"http://spam.example\"}");

		MvcResult result = register(json).andExpect(status().isCreated())
			.andExpect(jsonPath("$.email").value(email))
			.andReturn();

		assertThat(users.findByEmail(email)).isEmpty();
		assertThat(result.getResponse().getCookie(AuthCookies.ACCESS_COOKIE)).isNull();
		assertThat(result.getResponse().getCookie(AuthCookies.REFRESH_COOKIE)).isNull();
	}

	@Test
	void duplicateEmailReturns409WithEmailExistsCode() throws Exception {
		String email = uniqueEmail();
		register(RegisterJson.of("An", email, PASSWORD)).andExpect(status().isCreated());

		register(RegisterJson.of("An 2", email.toUpperCase(), PASSWORD)).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value(AuthService.EMAIL_EXISTS))
			.andExpect(jsonPath("$.detail").value("Email này đã có tài khoản"));
	}

	@Test
	void duplicatePhoneInAnotherFormatReturns409WithPhoneExistsCode() throws Exception {
		String phone = uniquePhone();
		register(RegisterJson.of("An", uniqueEmail(), PASSWORD, phone)).andExpect(status().isCreated());

		register(RegisterJson.of("Bình", uniqueEmail(), PASSWORD, "+84" + phone.substring(1)))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value(AuthService.PHONE_EXISTS));
	}

	@Test
	void missingTurnstileTokenIsRejected() throws Exception {
		String email = uniqueEmail();
		register(RegisterJson.of("An", email, PASSWORD).replace(RegisterJson.TURNSTILE_TEST_TOKEN, ""))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value(TurnstileVerifier.FAILED_CODE));
		assertThat(users.findByEmail(email)).isEmpty();
	}

	@Test
	void validatesFieldsWithVietnameseMessages() throws Exception {
		register("{\"fullName\":\"\",\"email\":\"khong-phai-email\",\"password\":\"chiconchu\",\"phone\":\"12345\","
				+ "\"acceptTerms\":true,\"turnstileToken\":\"x\"}")
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors.fullName").value("Vui lòng nhập họ tên"))
			.andExpect(jsonPath("$.errors.email").value("Email không hợp lệ"))
			.andExpect(jsonPath("$.errors.password").value("Mật khẩu phải có cả chữ và số"))
			.andExpect(jsonPath("$.errors.phone").value("Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0"));
	}
}
