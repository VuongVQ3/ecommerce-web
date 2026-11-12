package com.nutshop.content.site;

import com.nutshop.common.ApiException;
import com.nutshop.common.SecureTokens;
import com.nutshop.content.ContentType;
import com.nutshop.content.PreviewTokenService;
import com.nutshop.content.site.SiteDtos.MenuItem;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

import java.util.List;
import java.util.UUID;

/**
 * The public CMS page API (no sign-in): the published version of the page at a path, cached for a minute with an
 * ETag. The preview reads the working copy for whoever holds a preview link and is never cached.
 */
@RestController
@RequestMapping("/api/content")
public class PageContentController {

	private static final CacheControl PUBLIC = CacheControl.maxAge(PageDelivery.TTL).cachePublic();

	private final PageDelivery delivery;
	private final PreviewTokenService previews;

	public PageContentController(PageDelivery delivery, PreviewTokenService previews) {
		this.delivery = delivery;
		this.previews = previews;
	}

	@GetMapping("/pages")
	public ResponseEntity<JsonNode> page(@RequestParam String path,
			@RequestHeader(name = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch) {
		JsonNode node = delivery.published(normalize(path)).orElseThrow(PageContentController::notFound);
		String etag = "\"" + SecureTokens.hash(node.toString()).substring(0, 32) + "\"";
		if (ifNoneMatch != null && (ifNoneMatch.equals(etag) || ifNoneMatch.equals("W/" + etag))) {
			return ResponseEntity.status(HttpStatus.NOT_MODIFIED).eTag(etag).cacheControl(PUBLIC).build();
		}
		return ResponseEntity.ok().eTag(etag).cacheControl(PUBLIC).body(node);
	}

	/** Published pages marked "show in menu". */
	@GetMapping("/menu")
	public ResponseEntity<List<MenuItem>> menu() {
		return ResponseEntity.ok().cacheControl(PUBLIC).body(delivery.menu());
	}

	@GetMapping("/preview/pages")
	public ResponseEntity<JsonNode> preview(@RequestParam(required = false) String token) {
		JsonNode node = previews.resolve(token)
			.filter(t -> t.type() == ContentType.PAGE)
			.flatMap(t -> delivery.preview(UUID.fromString(t.targetId())))
			.orElseThrow(PageContentController::notFound);
		return ResponseEntity.ok()
			.cacheControl(CacheControl.noStore())
			.header("X-Robots-Tag", "noindex")
			.header("Referrer-Policy", "no-referrer")
			.body(node);
	}

	/** "gioi-thieu/" → "/gioi-thieu": a leading slash added, trailing slashes dropped. */
	static String normalize(String path) {
		String p = path == null ? "" : path.strip();
		if (!p.startsWith("/")) {
			p = "/" + p;
		}
		return p.length() > 1 ? p.replaceAll("/+$", "") : p;
	}

	private static ApiException notFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "PAGE_NOT_FOUND", "Không tìm thấy trang");
	}
}
