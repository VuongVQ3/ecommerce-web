package com.nutshop.mail;

import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

/** Sends email through the Resend HTTP API (https://resend.com/docs/api-reference/emails/send-email). */
public class ResendEmailSender implements EmailSender {

	private final RestClient client;
	private final String from;

	public ResendEmailSender(RestClient.Builder builder, String apiKey, String from) {
		this.client = builder.baseUrl("https://api.resend.com")
			.defaultHeader("Authorization", "Bearer " + apiKey)
			.build();
		this.from = from;
	}

	@Override
	public void send(EmailMessage message) {
		client.post()
			.uri("/emails")
			.contentType(MediaType.APPLICATION_JSON)
			.body(Map.of("from", from, "to", List.of(message.to()), "subject", message.subject(), "html",
					message.html(), "text", message.text()))
			.retrieve()
			.toBodilessEntity();
	}
}
