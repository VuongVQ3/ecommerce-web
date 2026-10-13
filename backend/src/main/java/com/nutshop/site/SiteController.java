package com.nutshop.site;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.HtmlUtils;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Map;

/** Health check, public site settings, robots.txt and a sitemap built from the database. */
@RestController
public class SiteController {

	private static final Logger log = LoggerFactory.getLogger(SiteController.class);
	private static final Duration SITEMAP_TTL = Duration.ofHours(1);
	private static final MediaType XML_UTF8 = MediaType.parseMediaType("application/xml;charset=UTF-8");
	private static final MediaType TEXT_UTF8 = MediaType.parseMediaType("text/plain;charset=UTF-8");

	private final SiteProperties site;
	private final JdbcTemplate jdbc;
	private final Clock clock;

	private volatile String sitemap;
	private volatile Instant sitemapBuiltAt = Instant.EPOCH;

	public SiteController(SiteProperties site, JdbcTemplate jdbc, Clock clock) {
		this.site = site;
		this.jdbc = jdbc;
		this.clock = clock;
	}

	/** For the hosting platform's health check: UP only when the database answers. */
	@GetMapping("/api/health")
	public ResponseEntity<Map<String, String>> health() {
		try {
			jdbc.queryForObject("SELECT 1", Integer.class);
			return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("status", "UP"));
		}
		catch (RuntimeException ex) {
			log.warn("Health check: database unavailable ({})", ex.getMessage());
			return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
				.cacheControl(CacheControl.noStore())
				.body(Map.of("status", "DOWN"));
		}
	}

	public record SiteInfo(String siteUrl, Map<String, String> business) {
	}

	/** Business details for the footer and contact page (only the filled-in fields). */
	@GetMapping("/api/site")
	public ResponseEntity<SiteInfo> info() {
		return ResponseEntity.ok()
			.cacheControl(CacheControl.maxAge(Duration.ofMinutes(10)).cachePublic())
			.body(new SiteInfo(site.url(), site.business().filled()));
	}

	@GetMapping("/robots.txt")
	public ResponseEntity<String> robots() {
		String body = """
				User-agent: *
				Allow: /
				Disallow: /admin
				Disallow: /tai-khoan
				Disallow: /thanh-toan
				Disallow: /api/

				Sitemap: %s
				""".formatted(site.absolute("/sitemap.xml"));
		return ResponseEntity.ok()
			.contentType(TEXT_UTF8)
			.cacheControl(CacheControl.maxAge(Duration.ofDays(1)).cachePublic())
			.body(body);
	}

	/** Rebuilt at most once an hour; browsers and crawlers may also cache it for an hour. */
	@GetMapping("/sitemap.xml")
	public ResponseEntity<String> sitemap() {
		Instant now = clock.instant();
		String cached = sitemap;
		if (cached == null || sitemapBuiltAt.plus(SITEMAP_TTL).isBefore(now)) {
			cached = buildSitemap();
			sitemap = cached;
			sitemapBuiltAt = now;
		}
		return ResponseEntity.ok().contentType(XML_UTF8).cacheControl(CacheControl.maxAge(SITEMAP_TTL).cachePublic()).body(cached);
	}

	/** Lets tests see product changes without waiting an hour. */
	void clearSitemapCache() {
		sitemap = null;
	}

	private String buildSitemap() {
		var xml = new StringBuilder("""
				<?xml version="1.0" encoding="UTF-8"?>
				<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
				""");
		url(xml, "/", null);
		url(xml, "/san-pham", null);
		jdbc.query("""
				SELECT c.slug, MAX(p.updated_at) AS lastmod
				FROM categories c LEFT JOIN products p ON p.category_id = c.id AND p.active
				GROUP BY c.id, c.slug ORDER BY c.id""",
				rs -> {
					var ts = rs.getTimestamp("lastmod");
					url(xml, "/danh-muc/" + rs.getString("slug"), ts == null ? null : ts.toInstant());
				});
		jdbc.query("SELECT slug, updated_at FROM products WHERE active ORDER BY id",
				rs -> {
					url(xml, "/san-pham/" + rs.getString("slug"), rs.getTimestamp("updated_at").toInstant());
				});
		for (String path : PageMetaService.INDEXED_STATIC_PAGES) {
			url(xml, path, null);
		}
		return xml.append("</urlset>\n").toString();
	}

	private void url(StringBuilder xml, String path, Instant lastmod) {
		xml.append("  <url><loc>").append(HtmlUtils.htmlEscape(site.absolute(path), "UTF-8")).append("</loc>");
		if (lastmod != null) {
			xml.append("<lastmod>")
				.append(DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(lastmod.atOffset(ZoneOffset.UTC).withNano(0)))
				.append("</lastmod>");
		}
		xml.append("</url>\n");
	}
}
