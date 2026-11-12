package com.nutshop.content;

import com.nutshop.IntegrationTest;
import com.nutshop.auth.AuthCookies;
import com.nutshop.auth.TokenService;
import com.nutshop.user.UserRepository;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import testsupport.RegisterJson;

import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The CMS Author environment shell: who gets in, what the session says, and that /author is never indexed. */
@IntegrationTest
class AuthorE2ETest {

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcTemplate jdbc;

	@Autowired
	UserRepository users;

	@Autowired
	TokenService tokens;

	@Autowired
	com.nutshop.security.RateLimiter authRateLimiter;

	@Autowired
	com.nutshop.site.SiteController siteController;

	@Test
	void sessionNeedsSignIn() throws Exception {
		mvc.perform(get("/api/author/session").header("X-Requested-With", "XMLHttpRequest"))
			.andExpect(status().isUnauthorized());
	}

	@Test
	void customersAreForbidden() throws Exception {
		call("/api/author/session", as("CUSTOMER")).andExpect(status().isForbidden());
	}

	@Test
	void staffMayAuthorButNotPublish() throws Exception {
		call("/api/author/session", as("STAFF")).andExpect(status().isOk())
			.andExpect(jsonPath("$.role").value("STAFF"))
			.andExpect(jsonPath("$.canPublish").value(false))
			.andExpect(jsonPath("$.canDelete").value(false))
			.andExpect(jsonPath("$.canManageModels").value(false))
			.andExpect(jsonPath("$.modules", contains("sites", "assets", "fragments")));
	}

	@Test
	void adminMayDoEverything() throws Exception {
		call("/api/author/session", as("ADMIN")).andExpect(status().isOk())
			.andExpect(jsonPath("$.role").value("ADMIN"))
			.andExpect(jsonPath("$.canPublish").value(true))
			.andExpect(jsonPath("$.canDelete").value(true))
			.andExpect(jsonPath("$.canManageModels").value(true));
	}

	@Test
	void unknownAuthorPathIs404NotAnError() throws Exception {
		call("/api/author/khong-ton-tai", as("STAFF")).andExpect(status().isNotFound());
	}

	@Test
	void authorPagesAreServedButNeverIndexed() throws Exception {
		for (String path : new String[] { "/author", "/author/assets" }) {
			mvc.perform(get(path))
				.andExpect(status().isOk())
				.andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
				.andExpect(content().string(containsString("<meta name=\"robots\" content=\"noindex")));
		}
	}

	@Test
	void robotsDisallowsAuthorAndTheSitemapLeavesItOut() throws Exception {
		mvc.perform(get("/robots.txt")).andExpect(content().string(containsString("Disallow: /author")));
		siteController.clearSitemapCache();
		mvc.perform(get("/sitemap.xml"))
			.andExpect(status().isOk())
			.andExpect(content().string(not(containsString("/author"))));
	}

	/** Registers a fresh account with the given role and returns its access cookie. */
	private Cookie as(String role) throws Exception {
		authRateLimiter.reset();
		String email = "author-" + role.toLowerCase() + "-" + UUID.randomUUID() + "@example.com";
		mvc.perform(post("/api/auth/register").header("X-Requested-With", "XMLHttpRequest")
			.contentType(MediaType.APPLICATION_JSON)
			.content(RegisterJson.of("Tác Giả " + role, email, "matkhau123"))).andExpect(status().isCreated());
		jdbc.update("UPDATE users SET role = ? WHERE email = ?", role, email);
		var user = users.findByEmail(email).orElseThrow();
		return new Cookie(AuthCookies.ACCESS_COOKIE, tokens.issueAccessToken(user));
	}

	private ResultActions call(String path, Cookie cookie) throws Exception {
		return mvc.perform(get(path).header("X-Requested-With", "XMLHttpRequest").cookie(cookie));
	}
}
