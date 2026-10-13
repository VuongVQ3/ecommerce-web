package com.nutshop.site;

import java.util.List;

/**
 * What goes into the &lt;head&gt; of one page: title, description, canonical path, Open Graph and JSON-LD. Values are
 * plain text here; HtmlPages escapes them.
 *
 * @param canonicalPath path only ("/san-pham/x"); made absolute with SITE_URL
 * @param image absolute image URL, or null for the default Open Graph image
 * @param noindex private or transactional pages (account, cart, admin, 404)
 * @param jsonLd structured data objects, serialized as application/ld+json
 */
public record PageMeta(String title, String description, String canonicalPath, String image, String ogType,
		boolean noindex, List<Object> jsonLd) {

	public static PageMeta page(String title, String description, String path) {
		return new PageMeta(title, description, path, null, "website", false, List.of());
	}

	public static PageMeta privatePage(String title, String path) {
		return new PageMeta(title, PageMetaService.DEFAULT_DESCRIPTION, path, null, "website", true, List.of());
	}
}
