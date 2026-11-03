package com.nutshop.privacy;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * Retention periods promised in the privacy policy (B.6), applied by {@link DataRetentionJob}.
 *
 * @param enabled false = the daily job does nothing (the periods are still the policy's)
 * @param cron when the job runs, Vietnam time
 * @param loginLogs how long login logs (IP address, browser: the refresh_tokens rows) are kept
 * @param inactiveAccounts a customer account not signed in to for this long is deleted (its orders stay, unlinked)
 */
@ConfigurationProperties(prefix = "app.retention")
public record RetentionProperties(boolean enabled, String cron, Duration loginLogs, Duration inactiveAccounts) {

	public RetentionProperties {
		if (loginLogs == null || loginLogs.toDays() < 30) {
			throw new IllegalArgumentException("app.retention.login-logs must be at least 30 days");
		}
		if (inactiveAccounts == null || inactiveAccounts.toDays() < 180) {
			throw new IllegalArgumentException("app.retention.inactive-accounts must be at least 180 days");
		}
	}
}
