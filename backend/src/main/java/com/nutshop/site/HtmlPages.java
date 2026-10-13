package com.nutshop.site;

import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.util.HtmlUtils;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;

/**
 * Serves the React app's index.html with a &lt;head&gt; written for the requested page, so crawlers and link previews
 * see the right title, description, canonical URL, Open Graph tags and JSON-LD without running JavaScript.
 * <p>
 * index.html marks the replaceable part with {@code <!--app-head-->…<!--/app-head-->} (the defaults inside are what
 * Vite's dev server shows). The file is read once. Without a frontend build (local dev, tests) a minimal page is used.
 */
@Component
public class HtmlPages {

	static final String START = "<!--app-head-->";
	static final String END = "<!--/app-head-->";
	private static final MediaType HTML_UTF8 = MediaType.parseMediaType("text/html;charset=UTF-8");
	private static final String FALLBACK = """
			<!doctype html>
			<html lang="vi">
			  <head>
			    <meta charset="UTF-8" />
			    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
			    <!--app-head--><title>Hạt Lành</title><!--/app-head-->
			  </head>
			  <body>
			    <div id="root"></div>
			  </body>
			</html>
			""";

	private final SiteProperties site;
	private final PageMetaService meta;
	private final JsonMapper json;
	private final String before;
	private final String after;

	public HtmlPages(SiteProperties site, PageMetaService meta, JsonMapper json) {
		this.site = site;
		this.meta = meta;
		this.json = json;
		String template = load(new ClassPathResource("/static/index.html"));
		int start = template.indexOf(START);
		int end = template.indexOf(END);
		if (start < 0 || end < start) {
			throw new IllegalStateException("index.html must contain " + START + " … " + END + " in <head>");
		}
		this.before = template.substring(0, start);
		this.after = template.substring(end + END.length());
	}

	/** HTML pages are never cached: a new deploy must be picked up immediately (assets have hashed names). */
	public ResponseEntity<String> render(PageMeta page, HttpStatus status) {
		return ResponseEntity.status(status).contentType(HTML_UTF8).cacheControl(CacheControl.noCache()).body(html(page));
	}

	public ResponseEntity<String> notFound(String path) {
		return render(meta.notFound(path), HttpStatus.NOT_FOUND);
	}

	String html(PageMeta page) {
		String image = page.image() != null ? page.image() : meta.defaultImage();
		String url = site.absolute(page.canonicalPath());
		var head = new StringBuilder();
		head.append("<title>").append(esc(page.title())).append("</title>\n");
		tag(head, "name", "description", page.description());
		if (page.noindex()) {
			tag(head, "name", "robots", "noindex, nofollow");
		}
		else {
			head.append("    <link rel=\"canonical\" href=\"").append(esc(url)).append("\" />\n");
		}
		tag(head, "property", "og:site_name", PageMetaService.BRAND);
		tag(head, "property", "og:locale", "vi_VN");
		tag(head, "property", "og:type", page.ogType());
		tag(head, "property", "og:title", page.title());
		tag(head, "property", "og:description", page.description());
		tag(head, "property", "og:url", url);
		tag(head, "property", "og:image", image);
		tag(head, "name", "twitter:card", "summary_large_image");
		for (Object data : page.jsonLd()) {
			head.append("    <script type=\"application/ld+json\">").append(jsonForScript(data)).append("</script>\n");
		}
		return before + head.toString().stripTrailing() + after;
	}

	private static void tag(StringBuilder head, String attr, String key, String content) {
		head.append("    <meta ").append(attr).append("=\"").append(key).append("\" content=\"").append(esc(content)).append("\" />\n");
	}

	private static String esc(String value) {
		return HtmlUtils.htmlEscape(value == null ? "" : value, "UTF-8");
	}

	/** JSON inside a script element: "<" and friends are escaped so text like "</script>" cannot end the element. */
	private String jsonForScript(Object data) {
		return json.writeValueAsString(data).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026");
	}

	private static String load(Resource resource) {
		if (!resource.exists()) {
			return FALLBACK;
		}
		try (var in = resource.getInputStream()) {
			return new String(in.readAllBytes(), StandardCharsets.UTF_8);
		}
		catch (IOException ex) {
			throw new UncheckedIOException(ex);
		}
	}
}
