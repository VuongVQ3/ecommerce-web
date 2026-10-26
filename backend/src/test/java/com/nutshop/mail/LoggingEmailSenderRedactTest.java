package com.nutshop.mail;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** Regression for run-2 lead 7: the log-only sender must not write usable bearer tokens to the logs. */
class LoggingEmailSenderRedactTest {

	@Test
	void redactsResetToken() {
		String redacted = LoggingEmailSender
				.redactTokens("Reset here: http://localhost:5173/dat-lai-mat-khau?token=UfeVS7secretValue123 thanks");
		assertThat(redacted).doesNotContain("UfeVS7secretValue123").contains("token=[redacted]");
	}

	@Test
	void redactsGuestTrackingToken() {
		String redacted = LoggingEmailSender.redactTokens("Track: http://localhost:5173/don-hang/HL123?t=TrackSecret99end");
		assertThat(redacted).doesNotContain("TrackSecret99end").contains("t=[redacted]");
	}
}
