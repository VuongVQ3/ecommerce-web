package com.nutshop.notify;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.Map;

/**
 * Sends a message to the shop's Telegram chat (Bot API sendMessage, HTML). Best effort: failures are logged, never
 * thrown. Off (nothing sent) when TelegramProperties is incomplete.
 */
@Component
public class TelegramNotifier {

	private static final Logger log = LoggerFactory.getLogger(TelegramNotifier.class);
	private static final Duration TIMEOUT = Duration.ofSeconds(5);

	private final TelegramProperties props;
	private final RestClient client;

	public TelegramNotifier(TelegramProperties props) {
		this.props = props;
		var requestFactory = new SimpleClientHttpRequestFactory();
		requestFactory.setConnectTimeout(TIMEOUT);
		requestFactory.setReadTimeout(TIMEOUT);
		this.client = RestClient.builder().baseUrl("https://api.telegram.org").requestFactory(requestFactory).build();
		if (props.enabled()) {
			// Never the token; only the end of the chat id
			String id = props.chatId();
			log.info("Telegram: bật, chat ****{}", id.substring(Math.max(0, id.length() - 4)));
		}
		else {
			log.info("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set: Telegram order alerts are off");
		}
	}

	public boolean enabled() {
		return props.enabled();
	}

	/** {@code html} uses Telegram's HTML subset; user data in it must go through {@link #escape}. */
	public void send(String html) {
		if (!props.enabled()) {
			return;
		}
		try {
			client.post()
				.uri("/bot{token}/sendMessage", props.botToken())
				.contentType(MediaType.APPLICATION_JSON)
				.body(Map.of("chat_id", props.chatId(), "text", html, "parse_mode", "HTML",
						"disable_web_page_preview", true))
				.retrieve()
				.toBodilessEntity();
		}
		catch (RuntimeException ex) {
			// The bot token is part of the URL: never log the exception message
			log.warn("Could not send Telegram message ({})", ex.getClass().getSimpleName());
		}
	}

	/** &amp; &lt; &gt; for Telegram HTML. */
	public static String escape(String text) {
		if (text == null) {
			return "";
		}
		return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
	}
}
