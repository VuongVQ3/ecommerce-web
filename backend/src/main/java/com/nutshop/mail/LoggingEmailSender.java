package com.nutshop.mail;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.regex.Pattern;

/**
 * Local-development fallback when RESEND_API_KEY is not set (allowed only with app.mail.allow-logging-sender=true):
 * the email is written to the log instead of being sent. Bearer tokens in the body ({@code ?token=…}, {@code ?t=…})
 * are redacted so the log never holds a usable reset, invite, verification or tracking link.
 */
public class LoggingEmailSender implements EmailSender {

	private static final Logger log = LoggerFactory.getLogger(LoggingEmailSender.class);

	// token= / t= query parameters carry single-use bearer tokens; strip their values before logging.
	private static final Pattern BEARER_TOKEN = Pattern.compile("([?&](?:token|t)=)[^\\s&]+");

	public LoggingEmailSender() {
		log.warn("RESEND_API_KEY is not set: emails will be LOGGED (redacted), not sent (development only)");
	}

	static String redactTokens(String text) {
		return text == null ? null : BEARER_TOKEN.matcher(text).replaceAll("$1[redacted]");
	}

	@Override
	public void send(EmailMessage message) {
		log.info("""

				===== EMAIL (not sent, RESEND_API_KEY is empty) =====
				To: {}
				Subject: {}

				{}
				=====================================================""", message.to(), message.subject(),
				redactTokens(message.text()));
	}
}
