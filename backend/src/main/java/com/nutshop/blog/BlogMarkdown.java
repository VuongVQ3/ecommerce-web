package com.nutshop.blog;

import com.nutshop.site.SiteProperties;
import org.commonmark.Extension;
import org.commonmark.ext.gfm.tables.TablesExtension;
import org.commonmark.node.Code;
import org.commonmark.node.Heading;
import org.commonmark.node.Image;
import org.commonmark.node.Link;
import org.commonmark.node.ListBlock;
import org.commonmark.node.ListItem;
import org.commonmark.node.Node;
import org.commonmark.node.Paragraph;
import org.commonmark.node.Text;
import org.commonmark.parser.Parser;
import org.commonmark.renderer.NodeRenderer;
import org.commonmark.renderer.html.HtmlNodeRendererContext;
import org.commonmark.renderer.html.HtmlRenderer;
import org.commonmark.renderer.html.HtmlWriter;
import org.commonmark.renderer.text.TextContentRenderer;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Blog Markdown → HTML, on the server so the API, the no-JavaScript page and the editor preview show the same thing.
 * <ul>
 * <li>Raw HTML in the Markdown is escaped (shown as text), never passed through.</li>
 * <li>Links keep only http(s) and site paths ("/…"); anything else ({@code javascript:}, {@code data:}…) becomes
 * plain text. Links to other sites open in a new tab with {@code rel="noopener nofollow"}.</li>
 * <li>Images must be https. They load lazily, carry width/height when known (no layout shift) and, on Cloudinary,
 * get {@code f_auto,q_auto} and a srcset. An image alone in its paragraph with a title
 * ({@code ![alt](url "caption")}) becomes a figure with a caption.</li>
 * <li>"# Heading" is rendered as h2: the page's h1 is the post title.</li>
 * </ul>
 */
@Component
public class BlogMarkdown {

	public record ImageSize(int width, int height) {
	}

	/** @param readingMinutes at about 200 words a minute, at least 1 */
	public record Rendered(String html, int readingMinutes) {
	}

	static final int WORDS_PER_MINUTE = 200;
	static final int[] WIDTHS = { 480, 800, 1200 };
	/** The text column is about 70 characters (~700px) wide; full width below that. */
	static final String SIZES = "(min-width: 768px) 720px, 100vw";

	private static final List<Extension> EXTENSIONS = List.of(TablesExtension.create());

	private final Parser parser = Parser.builder().extensions(EXTENSIONS).build();
	private final String siteHost;

	public BlogMarkdown(SiteProperties site) {
		this.siteHost = host(site.url());
	}

	/** @param sizes known image sizes by URL (the post's uploaded images) */
	public Rendered render(String markdown, Map<String, ImageSize> sizes) {
		Node document = parser.parse(markdown == null ? "" : markdown);
		HtmlRenderer renderer = HtmlRenderer.builder()
			.extensions(EXTENSIONS)
			.escapeHtml(true)
			.nodeRendererFactory(context -> new SafeRenderer(context, sizes))
			.build();
		String text = TextContentRenderer.builder().build().render(document);
		return new Rendered(renderer.render(document), readingMinutes(text));
	}

	/** Reading time of a post without rendering its HTML (cards in lists). */
	public int readingMinutesOf(String markdown) {
		return readingMinutes(TextContentRenderer.builder().build().render(parser.parse(markdown == null ? "" : markdown)));
	}

	static int readingMinutes(String text) {
		String trimmed = text == null ? "" : text.strip();
		if (trimmed.isEmpty()) {
			return 1;
		}
		int words = trimmed.split("\\s+").length;
		return Math.max(1, (int) Math.ceil(words / (double) WORDS_PER_MINUTE));
	}

	/** A Cloudinary delivery URL with {@code f_auto,q_auto,w_<width>}; other URLs unchanged. */
	public static String resized(String url, int width) {
		int at = url.indexOf("/image/upload/");
		if (at < 0 || !url.contains("res.cloudinary.com")) {
			return url;
		}
		int cut = at + "/image/upload/".length();
		return url.substring(0, cut) + "f_auto,q_auto,w_" + width + "/" + url.substring(cut);
	}

	public static boolean isCloudinary(String url) {
		return url.contains("res.cloudinary.com") && url.contains("/image/upload/");
	}

	public static String srcset(String url) {
		return java.util.Arrays.stream(WIDTHS).mapToObj(w -> resized(url, w) + " " + w + "w").collect(Collectors.joining(", "));
	}

	/** http(s) or a path on this site ("/…", not "//host" or "/\host", which browsers read as another site). */
	static boolean safeHref(String href) {
		if (href == null) {
			return false;
		}
		String h = href.strip().toLowerCase(Locale.ROOT);
		if (h.startsWith("/")) {
			return !h.startsWith("//") && !h.startsWith("/\\");
		}
		return h.startsWith("https://") || h.startsWith("http://");
	}

	static boolean safeImage(String src) {
		return src != null && src.strip().toLowerCase(Locale.ROOT).startsWith("https://");
	}

	private boolean external(String href) {
		if (href.startsWith("/")) {
			return false;
		}
		String host = host(href);
		return host == null || !host.equals(siteHost);
	}

	private static String host(String url) {
		try {
			String host = URI.create(url.strip()).getHost();
			if (host == null) {
				return null;
			}
			host = host.toLowerCase(Locale.ROOT);
			return host.startsWith("www.") ? host.substring(4) : host;
		}
		catch (IllegalArgumentException ex) {
			return null;
		}
	}

	private final class SafeRenderer implements NodeRenderer {

		private final HtmlNodeRendererContext context;
		private final HtmlWriter html;
		private final Map<String, ImageSize> sizes;

		SafeRenderer(HtmlNodeRendererContext context, Map<String, ImageSize> sizes) {
			this.context = context;
			this.html = context.getWriter();
			this.sizes = sizes == null ? Map.of() : sizes;
		}

		@Override
		public Set<Class<? extends Node>> getNodeTypes() {
			return Set.of(Paragraph.class, Heading.class, Link.class, Image.class);
		}

		@Override
		public void render(Node node) {
			switch (node) {
				case Paragraph p -> paragraph(p);
				case Heading h -> heading(h);
				case Link l -> link(l);
				case Image i -> image(i);
				default -> children(node);
			}
		}

		private void paragraph(Paragraph p) {
			if (p.getFirstChild() instanceof Image image && image.getNext() == null && image.getTitle() != null
					&& !image.getTitle().isBlank() && safeImage(image.getDestination())) {
				html.line();
				html.tag("figure");
				image(image);
				html.tag("figcaption");
				html.text(image.getTitle());
				html.tag("/figcaption");
				html.tag("/figure");
				html.line();
				return;
			}
			// Items of a tight list hold their text without <p>
			if (p.getParent() instanceof ListItem item && item.getParent() instanceof ListBlock list && list.isTight()) {
				children(p);
				return;
			}
			html.line();
			html.tag("p");
			children(p);
			html.tag("/p");
			html.line();
		}

		private void heading(Heading h) {
			String tag = "h" + Math.max(2, h.getLevel());
			html.line();
			html.tag(tag);
			children(h);
			html.tag("/" + tag);
			html.line();
		}

		private void link(Link link) {
			String href = link.getDestination();
			if (!safeHref(href)) {
				children(link);
				return;
			}
			Map<String, String> attrs = new LinkedHashMap<>();
			attrs.put("href", href.strip());
			if (link.getTitle() != null && !link.getTitle().isBlank()) {
				attrs.put("title", link.getTitle());
			}
			if (external(href.strip())) {
				attrs.put("target", "_blank");
				attrs.put("rel", "noopener nofollow");
			}
			html.tag("a", attrs);
			children(link);
			html.tag("/a");
		}

		private void image(Image image) {
			String src = image.getDestination();
			String alt = altText(image);
			if (!safeImage(src)) {
				html.text(alt);
				return;
			}
			src = src.strip();
			Map<String, String> attrs = new LinkedHashMap<>();
			if (isCloudinary(src)) {
				attrs.put("src", resized(src, 800));
				attrs.put("srcset", srcset(src));
				attrs.put("sizes", SIZES);
			}
			else {
				attrs.put("src", src);
			}
			attrs.put("alt", alt);
			ImageSize size = sizes.get(src);
			if (size != null) {
				attrs.put("width", String.valueOf(size.width()));
				attrs.put("height", String.valueOf(size.height()));
			}
			attrs.put("loading", "lazy");
			attrs.put("decoding", "async");
			html.tag("img", attrs, true);
		}

		private void children(Node parent) {
			Node child = parent.getFirstChild();
			while (child != null) {
				Node next = child.getNext();
				context.render(child);
				child = next;
			}
		}
	}

	private static String altText(Node node) {
		var text = new StringBuilder();
		for (Node child = node.getFirstChild(); child != null; child = child.getNext()) {
			if (child instanceof Text t) {
				text.append(t.getLiteral());
			}
			else if (child instanceof Code c) {
				text.append(c.getLiteral());
			}
			else {
				text.append(altText(child));
			}
		}
		return text.toString();
	}
}
