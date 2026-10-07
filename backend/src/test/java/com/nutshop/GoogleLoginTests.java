package com.nutshop;

import com.nutshop.auth.AuthCookies;
import com.nutshop.auth.GoogleTokenVerifier;
import com.nutshop.auth.GoogleTokenVerifier.GoogleUser;
import com.nutshop.common.UnauthorizedException;
import com.nutshop.security.RateLimiter;
import com.nutshop.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import testsupport.RegisterJson;

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
	void linksGoogleToExistingPasswordAccountWithSameEmail() throws Exception {
		postJson("/api/auth/register", RegisterJson.of("Bình", "binh@gmail.com", "matkhau123"))
			.andExpect(status().isCreated());
		given(googleVerifier.verify("tok-binh")).willReturn(new GoogleUser("g-200", "binh@gmail.com", "Lê Bình"));

		googleLogin("tok-binh").andExpect(status().isOk()).andExpect(jsonPath("$.fullName").value("Bình"));

		assertThat(users.findByGoogleId("g-200")).get().satisfies(u -> assertThat(u.hasPassword()).isTrue());
		// Password login still works after linking
		postJson("/api/auth/login", "{\"email\":\"binh@gmail.com\",\"password\":\"matkhau123\"}")
			.andExpect(status().isOk());
	}

	@Test
	void rejectsInvalidGoogleToken() throws Exception {
		given(googleVerifier.verify("bad")).willThrow(new UnauthorizedException("Phiên đăng nhập Google không hợp lệ"));

		googleLogin("bad").andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.detail").value("Phiên đăng nhập Google không hợp lệ"));
	}
}
