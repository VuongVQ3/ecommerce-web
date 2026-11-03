package com.nutshop.privacy;

import com.nutshop.IntegrationTest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import testsupport.RegisterJson;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The privacy policy's retention periods (B.6), one rule per test; app.retention.* as in application.properties. */
@IntegrationTest
class DataRetentionJobTest {

	@Autowired
	DataRetentionJob job;

	@Autowired
	JdbcTemplate jdbc;

	@Autowired
	MockMvc mvc;

	@Autowired
	com.nutshop.security.RateLimiter authRateLimiter;

	private final List<UUID> users = new ArrayList<>();

	@AfterEach
	void cleanUp() {
		for (UUID id : users) {
			jdbc.update("DELETE FROM orders WHERE user_id = ? OR idempotency_key = ?", id, "ret-" + id);
			jdbc.update("DELETE FROM users WHERE id = ?", id);
		}
	}

	private UUID user(String role, String lastLogin) {
		UUID id = jdbc.queryForObject("""
				INSERT INTO users (email, full_name, role, terms_accepted_at, last_login_at)
				VALUES (?, 'Người Lưu Trữ', ?, now(), now() - CAST(? AS interval)) RETURNING id""", UUID.class,
				"ret-" + UUID.randomUUID() + "@example.com", role, lastLogin);
		users.add(id);
		return id;
	}

	private void loginLog(UUID userId, String age) {
		jdbc.update("""
				INSERT INTO refresh_tokens (user_id, token_hash, created_at, expires_at, user_agent, ip)
				VALUES (?, ?, now() - CAST(? AS interval), now() - CAST(? AS interval) + interval '7 days', 'JUnit', '10.0.0.1')""",
				userId, UUID.randomUUID().toString().replace("-", ""), age, age);
	}

	private int loginLogs(UUID userId) {
		return jdbc.queryForObject("SELECT COUNT(*) FROM refresh_tokens WHERE user_id = ?", Integer.class, userId);
	}

	private boolean exists(UUID userId) {
		return jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE id = ?", Integer.class, userId) == 1;
	}

	@Test
	void loginLogsOlderThan90DaysAreDeletedNewerOnesKept() {
		UUID id = user("CUSTOMER", "1 day");
		loginLog(id, "91 days");
		loginLog(id, "200 days");
		loginLog(id, "89 days");
		loginLog(id, "1 hour");

		job.deleteOldLoginLogs();

		assertThat(loginLogs(id)).isEqualTo(2);
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM refresh_tokens WHERE user_id = ? AND created_at < now() - interval '90 days'",
				Integer.class, id)).isZero();
	}

	@Test
	void aCustomerNotSignedInFor24MonthsIsDeletedAndTheirOrdersStayUnlinked() {
		UUID stale = user("CUSTOMER", "731 days");
		UUID active = user("CUSTOMER", "729 days");
		loginLog(stale, "731 days");
		String code = "HLRET" + Integer.toString(Math.floorMod(stale.hashCode(), 100_000));
		jdbc.update("""
				INSERT INTO orders (code, idempotency_key, user_id, customer_name, phone, province, ward, address_line,
				                    subtotal, shipping_fee, total, status)
				VALUES (?, ?, ?, 'Người Lưu Trữ', '0912345678', 'Hà Nội', 'Ba Đình', '1 Phố Test', 100000, 0, 100000, 'COMPLETED')""",
				code, "ret-" + stale, stale);
		jdbc.update("""
				INSERT INTO audit_logs (action, entity_type, entity_id, entity_label, before, after)
				VALUES ('USER_UPDATED', 'USER', ?, 'Người Lưu Trữ (ret@example.com)', '{"phone":"0912345678"}', '{"phone":null}')""",
				stale.toString());

		job.deleteInactiveAccounts();

		assertThat(exists(stale)).isFalse();
		assertThat(exists(active)).isTrue();
		assertThat(loginLogs(stale)).isZero();
		// The order is never deleted: it stays, without the account
		assertThat(jdbc.queryForList("SELECT user_id FROM orders WHERE code = ?", UUID.class, code)).containsExactly((UUID) null);
		// What the audit log knew about the account is gone; the deletion itself is recorded without personal data
		assertThat(jdbc.queryForList("SELECT entity_label || '|' || COALESCE(before::text, '') || COALESCE(after::text, '') "
				+ "FROM audit_logs WHERE entity_type = 'USER' AND entity_id = ?", String.class, stale.toString()))
			.hasSize(2)
			.allSatisfy(row -> assertThat(row).isEqualTo(DataRetentionJob.DELETED_LABEL + "|"))
			.noneMatch(row -> row.contains("ret@example.com") || row.contains("0912345678"));
	}

	@Test
	void staffAndAdminAccountsAreNeverDeletedForInactivity() {
		UUID staff = user("STAFF", "1000 days");
		UUID admin = user("ADMIN", "1000 days");

		job.deleteInactiveAccounts();

		assertThat(exists(staff)).isTrue();
		assertThat(exists(admin)).isTrue();
	}

	@Test
	void signingInMarksTheAccountAsInUse() throws Exception {
		authRateLimiter.reset();
		String email = "ret-" + UUID.randomUUID() + "@example.com";
		mvc.perform(post("/api/auth/register").header("X-Requested-With", "XMLHttpRequest")
				.contentType(MediaType.APPLICATION_JSON)
				.content(RegisterJson.of("Người Mới", email, "matkhau123")))
			.andExpect(status().isCreated());
		UUID id = jdbc.queryForObject("SELECT id FROM users WHERE email = ?", UUID.class, email);
		users.add(id);
		jdbc.update("UPDATE users SET last_login_at = now() - interval '800 days' WHERE id = ?", id);

		mvc.perform(post("/api/auth/login").header("X-Requested-With", "XMLHttpRequest")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"" + email + "\",\"password\":\"matkhau123\"}"))
			.andExpect(status().isOk());
		job.deleteInactiveAccounts();

		assertThat(exists(id)).isTrue();
		assertThat(jdbc.queryForObject("SELECT last_login_at > now() - interval '1 minute' FROM users WHERE id = ?",
				Boolean.class, id)).isTrue();
	}
}
