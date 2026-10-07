package com.nutshop.auth;

import com.nutshop.IntegrationTest;
import com.nutshop.security.RateLimiter;
import com.nutshop.user.Role;
import com.nutshop.user.User;
import com.nutshop.user.UserRepository;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import testsupport.RegisterJson;
import testsupport.RolesProbeController;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
@Import(RolesProbeController.class)
class AuthFlowE2ETest {

	private static final String PASSWORD = "matkhau123";
	private static final String WRONG_CREDENTIALS = "Email hoặc mật khẩu không đúng";

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

	// ---- helpers --------------------------------------------------------------------------------------------

	private static MockHttpServletRequestBuilder ajax(MockHttpServletRequestBuilder request) {
		return request.header("X-Requested-With", "XMLHttpRequest");
	}

	private ResultActions postJson(String url, String json, Cookie... cookies) throws Exception {
		var request = ajax(post(url)).contentType(MediaType.APPLICATION_JSON).content(json);
		if (cookies.length > 0) {
			request.cookie(cookies);
		}
		return mvc.perform(request);
	}

	private ResultActions register(String email) throws Exception {
		return postJson("/api/auth/register", RegisterJson.of("Nguyễn Văn An", email, PASSWORD));
	}

	private ResultActions login(String email, String password) throws Exception {
		return postJson("/api/auth/login", "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}");
	}

	private ResultActions refresh(Cookie refreshCookie) throws Exception {
		var request = ajax(post("/api/auth/refresh"));
		if (refreshCookie != null) {
			request.cookie(refreshCookie);
		}
		return mvc.perform(request);
	}

	private static Cookie cookie(MvcResult result, String name) {
		Cookie cookie = result.getResponse().getCookie(name);
		assertThat(cookie).as("cookie %s", name).isNotNull();
		return cookie;
	}

	private static String uniqueEmail() {
		return "user-" + UUID.randomUUID() + "@example.com";
	}

	// ---- tests ----------------------------------------------------------------------------------------------

	@Test
	void registerThenMeThenRefreshThenLogout() throws Exception {
		String email = uniqueEmail();

		// Register: signed in straight away, tokens only in cookies
		MvcResult registered = register(email.toUpperCase())
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.email").value(email))
			.andExpect(jsonPath("$.role").value("CUSTOMER"))
			.andExpect(jsonPath("$.token").doesNotExist())
			.andExpect(jsonPath("$.passwordHash").doesNotExist())
			.andReturn();
		assertThat(registered.getResponse().getContentAsString()).doesNotContain(PASSWORD);

		Cookie access = cookie(registered, AuthCookies.ACCESS_COOKIE);
		Cookie refresh = cookie(registered, AuthCookies.REFRESH_COOKIE);
		assertThat(access.isHttpOnly()).isTrue();
		assertThat(access.getSecure()).isTrue();
		assertThat(access.getPath()).isEqualTo("/api");
		assertThat(access.getMaxAge()).isEqualTo(15 * 60);
		assertThat(refresh.isHttpOnly()).isTrue();
		assertThat(refresh.getPath()).isEqualTo("/api/auth");
		assertThat(refresh.getMaxAge()).isEqualTo(7 * 24 * 60 * 60);
		List<String> setCookies = registered.getResponse().getHeaders(HttpHeaders.SET_COOKIE);
		assertThat(setCookies).allSatisfy(c -> assertThat(c).contains("SameSite=Lax"));

		// Me
		mvc.perform(get("/api/auth/me").cookie(access))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.email").value(email))
			.andExpect(jsonPath("$.fullName").value("Nguyễn Văn An"));

		// Refresh: new pair, old refresh token rotated out
		MvcResult refreshed = refresh(refresh).andExpect(status().isOk())
			.andExpect(jsonPath("$.email").value(email))
			.andReturn();
		Cookie newAccess = cookie(refreshed, AuthCookies.ACCESS_COOKIE);
		Cookie newRefresh = cookie(refreshed, AuthCookies.REFRESH_COOKIE);
		assertThat(newRefresh.getValue()).isNotEqualTo(refresh.getValue());
		mvc.perform(get("/api/auth/me").cookie(newAccess)).andExpect(status().isOk());

		// Logout: both cookies cleared, refresh token no longer usable
		MvcResult loggedOut = mvc.perform(ajax(post("/api/auth/logout")).cookie(newRefresh))
			.andExpect(status().isNoContent())
			.andReturn();
		assertThat(cookie(loggedOut, AuthCookies.ACCESS_COOKIE).getMaxAge()).isZero();
		assertThat(cookie(loggedOut, AuthCookies.REFRESH_COOKIE).getMaxAge()).isZero();
		refresh(newRefresh).andExpect(status().isUnauthorized());

		// Without cookies
		mvc.perform(get("/api/auth/me"))
			.andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.detail").value("Vui lòng đăng nhập để tiếp tục"));
	}

	@Test
	void reusingARotatedRefreshTokenRevokesEverySessionOfThatUser() throws Exception {
		String email = uniqueEmail();
		Cookie deviceA = cookie(register(email).andReturn(), AuthCookies.REFRESH_COOKIE);
		Cookie deviceB = cookie(login(email, PASSWORD).andExpect(status().isOk()).andReturn(), AuthCookies.REFRESH_COOKIE);

		Cookie deviceANext = cookie(refresh(deviceA).andExpect(status().isOk()).andReturn(), AuthCookies.REFRESH_COOKIE);

		// An attacker replays the old token: rejected, cookies cleared...
		MvcResult replay = refresh(deviceA).andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.detail").value(RefreshTokenService.INVALID_SESSION))
			.andReturn();
		assertThat(cookie(replay, AuthCookies.REFRESH_COOKIE).getMaxAge()).isZero();

		// ...and every other session of the user is revoked too
		refresh(deviceANext).andExpect(status().isUnauthorized());
		refresh(deviceB).andExpect(status().isUnauthorized());
	}

	@Test
	void refreshWithoutOrWithUnknownCookieIsRejected() throws Exception {
		refresh(null).andExpect(status().isUnauthorized());
		refresh(new Cookie(AuthCookies.REFRESH_COOKIE, "not-a-real-token")).andExpect(status().isUnauthorized());
	}

	@Test
	void loginFailuresNeverRevealWhetherTheEmailExists() throws Exception {
		String email = uniqueEmail();
		register(email).andExpect(status().isCreated());

		login(email, "sai-mat-khau1").andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.detail").value(WRONG_CREDENTIALS));
		login(uniqueEmail(), PASSWORD).andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.detail").value(WRONG_CREDENTIALS));
	}

	@Test
	void deactivatedAccountCannotLogInOrRefresh() throws Exception {
		String email = uniqueEmail();
		Cookie refresh = cookie(register(email).andReturn(), AuthCookies.REFRESH_COOKIE);
		User user = users.findByEmail(email).orElseThrow();
		user.setActive(false);
		users.save(user);

		login(email, PASSWORD).andExpect(status().isForbidden())
			.andExpect(jsonPath("$.detail").value(AuthService.ACCOUNT_LOCKED));
		refresh(refresh).andExpect(status().isUnauthorized());
	}

	@Test
	void malformedJsonGetsAVietnameseProblemResponse() throws Exception {
		postJson("/api/auth/login", "{\"email\":")
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail").value("Dữ liệu gửi lên không đúng định dạng"));
	}

	@Test
	void stateChangingRequestsRequireTheXRequestedWithHeader() throws Exception {
		mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"a@b.c\",\"password\":\"x\"}"))
			.andExpect(status().isForbidden());
		mvc.perform(post("/api/auth/logout")).andExpect(status().isForbidden());
	}

	@Test
	void loginIsRateLimitedPerIp() throws Exception {
		for (int i = 0; i < 5; i++) {
			login("nobody@example.com", "sai-mat-khau1").andExpect(status().isUnauthorized());
		}
		login("nobody@example.com", "sai-mat-khau1")
			.andExpect(status().isTooManyRequests())
			.andExpect(header().exists(HttpHeaders.RETRY_AFTER));

		// Another IP is unaffected
		mvc.perform(ajax(post("/api/auth/login")).with(r -> {
			r.setRemoteAddr("10.1.2.3");
			return r;
		}).contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"nobody@example.com\",\"password\":\"x1\"}"))
			.andExpect(status().isUnauthorized());
	}

	@Test
	void rolesAnnotationRestrictsByRole() throws Exception {
		String email = uniqueEmail();
		Cookie customerAccess = cookie(register(email).andReturn(), AuthCookies.ACCESS_COOKIE);

		mvc.perform(get("/api/test/staff-only")).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/test/staff-only").cookie(customerAccess))
			.andExpect(status().isForbidden())
			.andExpect(jsonPath("$.detail").value("Bạn không có quyền truy cập chức năng này"));

		User user = users.findByEmail(email).orElseThrow();
		user.changeRole(Role.STAFF);
		users.save(user);
		Cookie staffAccess = cookie(login(email, PASSWORD).andReturn(), AuthCookies.ACCESS_COOKIE);

		mvc.perform(get("/api/test/staff-only").cookie(staffAccess)).andExpect(status().isOk());
	}
}
