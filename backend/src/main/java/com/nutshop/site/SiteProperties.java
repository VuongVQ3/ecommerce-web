package com.nutshop.site;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Public site settings: the canonical base URL (SITE_URL, so a custom domain is one variable away) and the business
 * details shown in the footer. Empty business fields are hidden, never replaced by sample values.
 */
@ConfigurationProperties(prefix = "app.site")
public record SiteProperties(String url, Business business) {

	public SiteProperties {
		url = StringUtils.hasText(url) ? url.trim().replaceAll("/+$", "") : "http://localhost:8080";
		business = business == null ? new Business(null, null, null, null, null, null) : business;
	}

	/**
	 * @param moitUrl link to the shop's notification on online.gov.vn (Bộ Công Thương)
	 */
	public record Business(String ownerName, String address, String registrationNumber, String hotline, String email,
			String moitUrl) {

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

	/** Absolute URL for a path starting with "/". */
	public String absolute(String path) {
		return url + path;
	}
}
