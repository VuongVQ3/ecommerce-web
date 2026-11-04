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
 * Vite's dev server shows), and the inside of {@code <div id="root">} with {@code <!--app-body-->…<!--/app-body-->}:
 * pages whose text matters to search engines (blog) write it there, and React replaces it when the app starts. Data
 * the app can start from without an API call goes into the head as {@code <script type="application/json"
 * id="initial-data">}. The file is read once. Without a frontend build (local dev, tests) a minimal page is used.
 */
@Component
public class HtmlPages {

	static final String START = "<!--app-head-->";
	static final String END = "<!--/app-head-->";
	static final String BODY_START = "<!--app-body-->";
	static final String BODY_END = "<!--/app-body-->";
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
			    <div id="root"><!--app-body--><!--/app-body--></div>
			  </body>
			</html>
			""";

	private final SiteProperties site;
	private final PageMetaService meta;
	private final JsonMapper json;
	private final String before;
	private final String between;
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
		int bodyStart = template.indexOf(BODY_START);
		int bodyEnd = template.indexOf(BODY_END);
		if (bodyStart < end || bodyEnd < bodyStart) {
			throw new IllegalStateException("index.html must contain " + BODY_START + " … " + BODY_END + " in #root");
		}
		this.before = template.substring(0, start);
		this.between = template.substring(end + END.length(), bodyStart + BODY_START.length());
		this.after = template.substring(bodyEnd);
	}

	/** HTML pages are never cached: a new deploy must be picked up immediately (assets have hashed names). */
	public ResponseEntity<String> render(PageMeta page, HttpStatus status) {
		return render(page, status, "", null);
	}

	/**
	 * @param body trusted HTML for crawlers inside #root (callers escape what they put in it)
	 * @param initialData serialized as JSON into {@code #initial-data}; null = none
	 */
	public ResponseEntity<String> render(PageMeta page, HttpStatus status, String body, Object initialData) {
		return ResponseEntity.status(status)
			.contentType(HTML_UTF8)
			.cacheControl(CacheControl.noCache())
			.body(html(page, body, initialData));
	}

	public ResponseEntity<String> notFound(String path) {
		return render(meta.notFound(path), HttpStatus.NOT_FOUND);
	}

	String html(PageMeta page) {
		return html(page, "", null);
	}

	String html(PageMeta page, String body, Object initialData) {
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
		if (initialData != null) {
			head.append("    <script type=\"application/json\" id=\"initial-data\">")
				.append(jsonForScript(initialData))
				.append("</script>\n");
		}
		return before + head.toString().stripTrailing() + between + (body == null ? "" : body) + after;
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
