package com.nutshop.site;

import com.nutshop.user.PhoneNumbers;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.StringUtils;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Public site settings: the canonical base URL (SITE_URL, so a custom domain is one variable away) and the business
 * details shown in the footer. Empty business fields are hidden, never replaced by sample values.
 */
@ConfigurationProperties(prefix = "app.site")
public record SiteProperties(String url, Business business, Social social) {

	public SiteProperties {
		url = StringUtils.hasText(url) ? url.trim().replaceAll("/+$", "") : "http://localhost:8080";
		business = business == null ? new Business(null, null, null, null, null, null, null, null) : business;
		social = social == null ? new Social(null, null, null) : social;
	}

	/**
	 * @param moitUrl link to the shop's notification on online.gov.vn (Bộ Công Thương)
	 * @param zaloPhone Zalo number for the chat button, normalized to 0xxxxxxxxx; an invalid value is dropped (logged)
	 * @param messengerPage Facebook page username or id for m.me links; letters, digits and dots only, else dropped
	 */
	public record Business(String ownerName, String address, String registrationNumber, String hotline, String email,
			String moitUrl, String zaloPhone, String messengerPage) {

		public Business {
			if (StringUtils.hasText(zaloPhone)) {
				String normalized = PhoneNumbers.normalize(zaloPhone);
				if (PhoneNumbers.isValid(normalized)) {
					zaloPhone = normalized;
				}
				else {
					log.warn("ZALO_PHONE is not a Vietnamese phone number, the Zalo button is hidden");
					zaloPhone = null;
				}
			}
			else {
				zaloPhone = null;
			}
			if (StringUtils.hasText(messengerPage)) {
				messengerPage = messengerPage.trim();
				if (!MESSENGER_PAGE.matcher(messengerPage).matches()) {
					log.warn("MESSENGER_PAGE may only contain letters, digits and dots, the Messenger button is hidden");
					messengerPage = null;
				}
			}
			else {
				messengerPage = null;
			}
		}

		/** Chat and call links for the floating contact button; null = not configured. */
		public Contact contact() {
			return new Contact(zaloPhone == null ? null : "https://zalo.me/" + zaloPhone,
					messengerPage == null ? null : "https://m.me/" + messengerPage,
					StringUtils.hasText(hotline) ? hotline.trim() : null);
		}

		/** Only the fields that are filled in. */
		public Map<String, String> filled() {
			Map<String, String> map = new LinkedHashMap<>();
			put(map, "ownerName", ownerName);
			put(map, "address", address);
			put(map, "registrationNumber", registrationNumber);
			put(map, "hotline", hotline);
			put(map, "email", email);
			put(map, "moitUrl", moitUrl != null && moitUrl.trim().startsWith("https://") ? moitUrl : null);
			return map;
		}

		private static void put(Map<String, String> map, String key, String value) {
			if (StringUtils.hasText(value)) {
				map.put(key, value.trim());
			}
		}
	}

	public record Contact(String zaloUrl, String messengerUrl, String hotline) {
	}

	/**
	 * Shop pages for the row of icons in the footer (FACEBOOK_URL, SHOPEE_URL, TIKTOK_URL). Each must be an https link
	 * on that network's own domain; anything else is dropped with a warning, never fatal.
	 */
	public record Social(String facebookUrl, String shopeeUrl, String tiktokUrl) {

		public Social {
			facebookUrl = checked("FACEBOOK_URL", facebookUrl, "facebook.com", "fb.com", "fb.me");
			shopeeUrl = checked("SHOPEE_URL", shopeeUrl, "shopee.vn", "shp.ee");
			tiktokUrl = checked("TIKTOK_URL", tiktokUrl, "tiktok.com");
		}

		private static String checked(String name, String value, String... domains) {
			if (!StringUtils.hasText(value)) {
				return null;
			}
			try {
				URI uri = new URI(value.trim());
				String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
				boolean ownDomain = Arrays.stream(domains).anyMatch(d -> host.equals(d) || host.endsWith("." + d));
				if ("https".equals(uri.getScheme()) && ownDomain) {
					return uri.toString();
				}
			}
			catch (URISyntaxException ignored) {
				// reported below
			}
			log.warn("{} must be an https link on {}; the icon is hidden", name, String.join(" / ", domains));
			return null;
		}
	}

	/** Footer icons: Facebook, Shopee, Zalo (from ZALO_PHONE), TikTok; null = not configured. */
	public record SocialLinks(String facebookUrl, String shopeeUrl, String zaloUrl, String tiktokUrl) {
	}

	public SocialLinks socialLinks() {
		return new SocialLinks(social.facebookUrl(), social.shopeeUrl(), business.contact().zaloUrl(), social.tiktokUrl());
	}

	private static final Logger log = LoggerFactory.getLogger(SiteProperties.class);

	private static final Pattern MESSENGER_PAGE = Pattern.compile("[A-Za-z0-9.]{1,100}");

	/** Absolute URL for a path starting with "/". */
	public String absolute(String path) {
		return url + path;
	}
}
