package com.nutshop.order;

import com.nutshop.common.SecureTokens;
import com.nutshop.site.SiteProperties;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

/**
 * Tracking links for guest orders: {@code SITE_URL/don-hang/{code}?t={token}}. The raw token exists only in the
 * response that created it and in the links sent by email; the database keeps its SHA-256. A link is valid for 180
 * days; an order may have several valid links (each email carries a fresh one, older ones keep working).
 */
@Component
@Transactional(propagation = Propagation.MANDATORY)
public class OrderAccessTokens {

	public static final Duration TTL = Duration.ofDays(180);

	private final OrderAccessTokenRepository tokens;
	private final SiteProperties site;
	private final Clock clock;

	public OrderAccessTokens(OrderAccessTokenRepository tokens, SiteProperties site, Clock clock) {
		this.tokens = tokens;
		this.site = site;
		this.clock = clock;
	}

	/** @return the raw token, to hand out exactly once */
	public String issue(Order order) {
		String raw = SecureTokens.generate();
		Instant now = clock.instant();
		tokens.save(new OrderAccessToken(order.getId(), SecureTokens.hash(raw), now, now.plus(TTL)));
		return raw;
	}

	/**
	 * True when {@code rawToken} is a valid, unexpired link of this order. Every stored hash of the order is compared
	 * in constant time (no early exit), so timing reveals nothing about the token.
	 */
	@Transactional(propagation = Propagation.SUPPORTS)
	public boolean matches(Order order, String rawToken) {
		if (rawToken == null || rawToken.isBlank() || rawToken.length() > 100 || order.getUserId() != null) {
			return false;
		}
		String hash = SecureTokens.hash(rawToken.trim());
		Instant now = clock.instant();
		boolean match = false;
		for (OrderAccessToken token : tokens.findByOrderId(order.getId())) {
			match |= SecureTokens.matches(token.getTokenHash(), hash) && token.getExpiresAt().isAfter(now);
		}
		return match;
	}

	/** The order now belongs to an account: its tracking links stop working. */
	public void revokeAll(Order order) {
		tokens.deleteByOrderId(order.getId());
	}

	public String trackingUrl(Order order, String rawToken) {
		return site.absolute("/don-hang/" + order.getCode() + "?t=" + rawToken);
	}

	/** Where emails send the customer: a fresh tracking link for guests, "my orders" for account holders. */
	public String linkFor(Order order) {
		return order.getUserId() == null ? trackingUrl(order, issue(order))
				: site.absolute("/tai-khoan/don-hang/" + order.getCode());
	}
}
