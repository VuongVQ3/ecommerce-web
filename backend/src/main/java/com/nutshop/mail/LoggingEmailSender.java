package com.nutshop.mail;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Development fallback when RESEND_API_KEY is not set: the email (including any reset link) is written to the
 * log instead of being sent. Never run production like this — the log would then hold valid reset links.
 */
public class LoggingEmailSender implements EmailSender {

	private static final Logger log = LoggerFactory.getLogger(LoggingEmailSender.class);

	public LoggingEmailSender() {
		log.warn("RESEND_API_KEY is not set: emails will be LOGGED, not sent (development only)");
	}

	@Override
	public void send(EmailMessage message) {
		log.info("""

				===== EMAIL (not sent, RESEND_API_KEY is empty) =====
				To: {}
				Subject: {}

				{}
				=====================================================""", message.to(), message.subject(),
				message.text());
	}
}
