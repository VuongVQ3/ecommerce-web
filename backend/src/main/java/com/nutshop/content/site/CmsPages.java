package com.nutshop.content.site;

import com.nutshop.dam.AssetRenditions;
import com.nutshop.site.HtmlPages;
import com.nutshop.site.PageMeta;
import com.nutshop.site.PageMetaService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.util.HtmlUtils;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.databind.JsonNode;

import java.util.List;
import java.util.Map;

/**
 * Serves CMS pages for addresses no fixed route handles (called where the app would otherwise answer 404): a
 * published page → the app with its own meta tags (title, description, canonical, Open Graph image from the og
 * rendition), its text for crawlers and the API answer as initial data; an old path of a published page → 301 to
 * the current one; anything else → the usual 404 page.
 */
@Component
public class CmsPages {

	private final PageDelivery delivery;
	private final HtmlPages pages;

	public CmsPages(PageDelivery delivery, HtmlPages pages) {
		this.delivery = delivery;
		this.pages = pages;
	}

	public ResponseEntity<String> respond(HttpServletRequest request) {
		String path = PageContentController.normalize(request.getRequestURI());
		var page = delivery.published(path);
		if (page.isPresent()) {
			JsonNode node = page.get();
			return pages.render(meta(node), HttpStatus.OK, body(node), Map.of("type", "cmsPage", "slug", path, "data", node));
		}
		var moved = delivery.redirectFor(path);
		if (moved.isPresent()) {
			String target = UriComponentsBuilder.fromPath(moved.get()).query(request.getQueryString()).build().toUriString();
			return ResponseEntity.status(HttpStatus.MOVED_PERMANENTLY).header(HttpHeaders.LOCATION, target).build();
		}
		return pages.notFound(request.getRequestURI());
	}

	static PageMeta meta(JsonNode page) {
		JsonNode props = page.path("properties");
		String seoTitle = props.path("seoTitle").asString("");
		String title = (seoTitle.isBlank() ? page.path("title").asString("") : seoTitle) + " | " + PageMetaService.BRAND;
		String description = props.path("seoDescription").asString("");
		JsonNode og = props.path("ogImage").path("renditions").path(AssetRenditions.OG);
		return new PageMeta(title, description.isBlank() ? PageMetaService.DEFAULT_DESCRIPTION : description,
				page.path("path").asString(), og.isString() ? og.asString() : null, "website",
				props.path("noindex").asBoolean(false), List.of());
	}

	/** The heading and the text blocks, readable without JavaScript (markdown HTML is already sanitized). */
	static String body(JsonNode page) {
		StringBuilder html = new StringBuilder("<main><h1>")
			.append(HtmlUtils.htmlEscape(page.path("title").asString(""), "UTF-8"))
			.append("</h1>");
		appendText(page.path("regions").path("main"), html);
		return html.append("</main>").toString();
	}

	private static void appendText(JsonNode blocks, StringBuilder html) {
		for (JsonNode block : blocks) {
			JsonNode props = block.path("props");
			String headline = props.path("headline").asString("");
			if (!headline.isBlank()) {
				html.append("<h2>").append(HtmlUtils.htmlEscape(headline, "UTF-8")).append("</h2>");
			}
			JsonNode markdown = props.path("markdown").path("html");
			if (markdown.isString()) {
				html.append(markdown.asString());
			}
			appendText(block.path("children"), html);
		}
	}
}
