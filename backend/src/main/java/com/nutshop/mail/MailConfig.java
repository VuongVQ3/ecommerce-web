package com.nutshop.mail;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

@Configuration(proxyBeanMethods = false)
public class MailConfig {

	@Bean
	EmailSender emailSender(@Value("${app.mail.resend-api-key:}") String apiKey, @Value("${app.mail.from}") String from) {
		return StringUtils.hasText(apiKey) ? new ResendEmailSender(RestClient.builder(), apiKey.trim(), from)
				: new LoggingEmailSender();
	}
}
