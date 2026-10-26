package com.nutshop.mail;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

@Configuration(proxyBeanMethods = false)
public class MailConfig {

	/**
	 * Resend when a key is set. When it is blank we only fall back to the log-only sender if it is explicitly allowed
	 * (local/dev); in production the key is required, so an empty key fails startup instead of silently writing reset,
	 * invite, verification and tracking links to the service logs.
	 */
	@Bean
	EmailSender emailSender(@Value("${app.mail.resend-api-key:}") String apiKey, @Value("${app.mail.from}") String from,
			@Value("${app.mail.allow-logging-sender:false}") boolean allowLoggingSender) {
		if (StringUtils.hasText(apiKey)) {
			return new ResendEmailSender(RestClient.builder(), apiKey.trim(), from);
		}
		if (!allowLoggingSender) {
			throw new IllegalStateException("RESEND_API_KEY must be set so emails are delivered, not logged. "
					+ "Set app.mail.allow-logging-sender=true only for local development.");
		}
		return new LoggingEmailSender();
	}
}
