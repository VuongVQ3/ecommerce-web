package com.nutshop.notify;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.StringUtils;

/**
 * Telegram alerts for the shop (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID). Both are needed; with either one missing the
 * alerts are off.
 */
@ConfigurationProperties(prefix = "app.telegram")
public record TelegramProperties(String botToken, String chatId) {

	public TelegramProperties {
		botToken = StringUtils.hasText(botToken) ? botToken.trim() : null;
		chatId = StringUtils.hasText(chatId) ? chatId.trim() : null;
	}

	public boolean enabled() {
		return botToken != null && chatId != null;
	}
}
