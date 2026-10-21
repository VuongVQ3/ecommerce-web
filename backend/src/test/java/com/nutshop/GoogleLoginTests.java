package com.nutshop;

import com.nutshop.auth.AuthCookies;
import com.nutshop.auth.GoogleTokenVerifier;
import com.nutshop.auth.GoogleTokenVerifier.GoogleUser;
import com.nutshop.common.UnauthorizedException;
import com.nutshop.security.RateLimiter;
import com.nutshop.user.UserRepository;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import testsupport.RegisterJson;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
class GoogleLoginTests {

	@Autowired
	MockMvc mvc;

	@Autowired
	UserRepository users;

	@Autowired
	RateLimiter authRateLimiter;

	@Autowired
	JdbcTemplate jdbc;

	@MockitoBean
	GoogleTokenVerifier googleVerifier;

	@BeforeEach
	void resetRateLimits() {
		authRateLimiter.reset();
	}

	private ResultActions postJson(String url, String json) throws Exception {
		return mvc.perform(post(url).header("X-Requested-With", "XMLHttpRequest")
			.contentType(MediaType.APPLICATION_JSON)
			.content(json));
	}

	private ResultActions googleLogin(String credential) throws Exception {
		return postJson("/api/auth/google", "{\"credential\":\"" + credential + "\"}");
	}

	@Test
	void createsAccountOnFirstGoogleLoginAndReusesItAfterwards() throws Exception {
		given(googleVerifier.verify("tok-new")).willReturn(new GoogleUser("g-100", "Mai@Gmail.com", "Trần Thị Mai"));

		googleLogin("tok-new").andExpect(status().isOk())
			.andExpect(cookie().httpOnly(AuthCookies.ACCESS_COOKIE, true))
			.andExpect(cookie().httpOnly(AuthCookies.REFRESH_COOKIE, true))
			.andExpect(jsonPath("$.token").doesNotExist())
			.andExpect(jsonPath("$.email").value("mai@gmail.com"))
			.andExpect(jsonPath("$.fullName").value("Trần Thị Mai"));
		googleLogin("tok-new").andExpect(status().isOk());

		assertThat(users.findByGoogleId("g-100")).get().satisfies(u -> assertThat(u.hasPassword()).isFalse());
		assertThat(users.findAll()).filteredOn(u -> u.getEmail().equals("mai@gmail.com")).hasSize(1);

		// A Google-only account cannot be used with the password form
		postJson("/api/auth/login", "{\"email\":\"mai@gmail.com\",\"password\":\"anything1\"}")
			.andExpect(status().isUnauthorized());
	}

	@Test
	void linksGoogleToExistingVerifiedAccountWithSameEmail() throws Exception {
		postJson("/api/auth/register", RegisterJson.of("Bình", "binh@gmail.com", "matkhau123"))
			.andExpect(status().isCreated());
		verifyEmail("binh@gmail.com");
		given(googleVerifier.verify("tok-binh")).willReturn(new GoogleUser("g-200", "binh@gmail.com", "Lê Bình"));

		googleLogin("tok-binh").andExpect(status().isOk()).andExpect(jsonPath("$.fullName").value("Bình"));

		assertThat(users.findByGoogleId("g-200")).get().satisfies(u -> assertThat(u.hasPassword()).isTrue());
		// Password login still works after linking
		postJson("/api/auth/login", "{\"email\":\"binh@gmail.com\",\"password\":\"matkhau123\"}")
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.hasPassword").value(true));
	}

	/**
	 * Someone registered with the victim's address (never verified) and stayed signed in. When the real owner signs in
	 * with Google, that person's password, phone and sessions are gone.
	 */
	@Test
	void takesOverAnUnverifiedAccountWithSameEmailWithoutTheOldPasswordPhoneOrSessions() throws Exception {
		String phone = "09" + String.format("%08d", Math.floorMod(UUID.randomUUID().getLeastSignificantBits(), 100_000_000L));
		Cookie squatterSession = postJson("/api/auth/register",
				RegisterJson.of("Kẻ Giả", "nan.nhan@gmail.com", "matkhau123").replace("}", ",\"phone\":\"" + phone + "\"}"))
			.andExpect(status().isCreated())
			.andReturn()
			.getResponse()
			.getCookie(AuthCookies.REFRESH_COOKIE);
		given(googleVerifier.verify("tok-owner")).willReturn(new GoogleUser("g-300", "Nan.Nhan@gmail.com", "Chủ Thật"));

		googleLogin("tok-owner").andExpect(status().isOk())
			.andExpect(jsonPath("$.email").value("nan.nhan@gmail.com"))
			.andExpect(jsonPath("$.emailVerified").value(true))
			.andExpect(jsonPath("$.hasPassword").value(false))
			.andExpect(jsonPath("$.phone").doesNotExist());

		assertThat(users.findByGoogleId("g-300")).get().satisfies(u -> {
			assertThat(u.hasPassword()).isFalse();
			assertThat(u.getPhone()).isNull();
			assertThat(u.isEmailVerified()).isTrue();
		});
		// The old password no longer signs in (same answer as a wrong password), the old session cannot be renewed
		postJson("/api/auth/login", "{\"email\":\"nan.nhan@gmail.com\",\"password\":\"matkhau123\"}")
			.andExpect(status().isUnauthorized());
		mvc.perform(post("/api/auth/refresh").header("X-Requested-With", "XMLHttpRequest").cookie(squatterSession))
			.andExpect(status().isUnauthorized());
		// The phone number is free again
		assertThat(users.existsByPhone(phone)).isFalse();
		assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_logs WHERE action = 'USER_GOOGLE_TAKEOVER' AND entity_id = ?",
				Long.class, users.findByGoogleId("g-300").orElseThrow().getId().toString())).isEqualTo(1);
	}

	@Test
	void googleLoginIsRateLimitedLikePasswordLogin() throws Exception {
		given(googleVerifier.verify("bad")).willThrow(new UnauthorizedException("x"));
		int status;
		int attempts = 0;
		do {
			status = googleLogin("bad").andReturn().getResponse().getStatus();
			attempts++;
		}
		while (status == 401 && attempts < 100);

		assertThat(status).isEqualTo(429);
	}

	private void verifyEmail(String email) {
		jdbc.update("UPDATE users SET email_verified_at = now() WHERE email = ?", email);
	}

	@Test
	void rejectsInvalidGoogleToken() throws Exception {
		given(googleVerifier.verify("bad")).willThrow(new UnauthorizedException("Đăng nhập Google không thành công. Vui lòng thử lại."));

		googleLogin("bad").andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.detail").value("Đăng nhập Google không thành công. Vui lòng thử lại."));
	}
}
