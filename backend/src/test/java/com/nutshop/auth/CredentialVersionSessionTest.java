package com.nutshop.auth;

import com.nutshop.IntegrationTest;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import testsupport.RegisterJson;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Regression for run-2 lead 4: a credential change must invalidate access tokens issued before it, not let them live
 * out their TTL. The access token carries the account's credential version; changing the password bumps it, so the
 * pre-change session is rejected at once. (This is the same check that stops a pre-takeover session after the Google
 * takeover clears the password.)
 */
@IntegrationTest
class CredentialVersionSessionTest {

	@Autowired
	MockMvc mvc;

	@Test
	void changingPasswordInvalidatesTokensIssuedBeforeIt() throws Exception {
		String email = "cv-" + UUID.randomUUID() + "@example.com";
		mvc.perform(post("/api/auth/register").header("X-Requested-With", "x").contentType(MediaType.APPLICATION_JSON)
				.content(RegisterJson.of("Người Dùng", email, "matkhau123"))).andExpect(status().isCreated());

		MvcResult login = mvc.perform(post("/api/auth/login").header("X-Requested-With", "x")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"" + email + "\",\"password\":\"matkhau123\"}")).andExpect(status().isOk())
				.andReturn();
		Cookie staleAccess = login.getResponse().getCookie(AuthCookies.ACCESS_COOKIE);

		// A session established before the credential change still works until the change happens.
		mvc.perform(get("/api/auth/me").cookie(staleAccess)).andExpect(status().isOk());

		MvcResult change = mvc.perform(post("/api/auth/change-password").header("X-Requested-With", "x")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"currentPassword\":\"matkhau123\",\"newPassword\":\"matkhaumoi456\"}").cookie(staleAccess))
				.andExpect(status().isOk()).andReturn();
		Cookie freshAccess = change.getResponse().getCookie(AuthCookies.ACCESS_COOKIE);

		// The token that existed before the password change is now rejected...
		mvc.perform(get("/api/auth/me").cookie(staleAccess)).andExpect(status().isUnauthorized());
		// ...while the session returned by the change keeps working.
		mvc.perform(get("/api/auth/me").cookie(freshAccess)).andExpect(status().isOk());
	}
}
