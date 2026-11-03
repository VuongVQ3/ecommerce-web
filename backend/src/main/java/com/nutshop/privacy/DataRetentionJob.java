package com.nutshop.privacy;

import com.nutshop.audit.AuditLog;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Applies the retention periods of the privacy policy (B.6) once a day:
 * <ul>
 * <li>login logs (refresh_tokens: IP address and browser) older than {@code app.retention.login-logs};</li>
 * <li>customer accounts not signed in to for {@code app.retention.inactive-accounts}: deleted. Their orders stay
 * (kept for accounting) and lose the link to the account (orders.user_id is ON DELETE SET NULL); sessions, cart and
 * tokens go with the account (ON DELETE CASCADE); audit rows about the account lose its name, email and changes.</li>
 * </ul>
 * Staff and admin accounts are never deleted here. Orders are never deleted.
 */
@Component
public class DataRetentionJob {

	private static final Logger log = LoggerFactory.getLogger(DataRetentionJob.class);
	static final String DELETED_LABEL = "Tài khoản đã xoá (không hoạt động)";

	private final RetentionProperties props;
	private final JdbcTemplate jdbc;
	private final AuditLog audit;
	private final Clock clock;

	public DataRetentionJob(RetentionProperties props, JdbcTemplate jdbc, AuditLog audit, Clock clock) {
		this.props = props;
		this.jdbc = jdbc;
		this.audit = audit;
		this.clock = clock;
	}

	@Scheduled(cron = "${app.retention.cron}", zone = "Asia/Ho_Chi_Minh")
	public void runDaily() {
		if (!props.enabled()) {
			return;
		}
		int logs = deleteOldLoginLogs();
		int accounts = deleteInactiveAccounts();
		log.info("Retention: {} login log rows and {} inactive accounts deleted", logs, accounts);
	}

	/** Login logs older than the period. A session token lives 7 days, so none of these is still usable. */
	@Transactional
	public int deleteOldLoginLogs() {
		Instant now = clock.instant();
		Timestamp cutoff = Timestamp.from(now.minus(props.loginLogs()));
		return jdbc.update("DELETE FROM refresh_tokens WHERE created_at < ? AND expires_at < ?", cutoff,
				Timestamp.from(now));
	}

	/** Customer accounts with no sign-in or session refresh within the period. */
	@Transactional
	public int deleteInactiveAccounts() {
		Timestamp cutoff = Timestamp.from(clock.instant().minus(props.inactiveAccounts()));
		List<UUID> stale = jdbc.queryForList(
				"SELECT id FROM users WHERE role = 'CUSTOMER' AND last_login_at < ? ORDER BY last_login_at LIMIT 500",
				UUID.class, cutoff);
		for (UUID id : stale) {
			// Earlier audit rows about this account carry its name and email (label) and changed fields
			jdbc.update("UPDATE audit_logs SET entity_label = ?, before = NULL, after = NULL "
					+ "WHERE entity_type = 'USER' AND entity_id = ?", DELETED_LABEL, id.toString());
			jdbc.update("DELETE FROM users WHERE id = ?", id);
			audit.entry("USER_DELETED_INACTIVE", "USER", id, DELETED_LABEL)
				.reason("Không đăng nhập trong " + props.inactiveAccounts().toDays() + " ngày")
				.record();
		}
		return stale.size();
	}
}
