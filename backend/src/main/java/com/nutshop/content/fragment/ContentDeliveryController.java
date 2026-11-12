package com.nutshop.content.fragment;

import com.nutshop.common.ApiException;
import com.nutshop.common.SecureTokens;
import com.nutshop.content.ContentType;
import com.nutshop.content.PreviewTokenService;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

import java.util.UUID;

/**
 * The public Content Fragment API (no sign-in): published versions only, cached for a minute by browsers and CDNs,
 * with an ETag so unchanged content answers 304. Preview links read the working copy and are never cached.
 */
@RestController
@RequestMapping("/api/content")
public class ContentDeliveryController {

	private static final CacheControl PUBLIC = CacheControl.maxAge(FragmentDelivery.TTL).cachePublic();

	private final FragmentDelivery delivery;
	private final PreviewTokenService previews;

	public ContentDeliveryController(FragmentDelivery delivery, PreviewTokenService previews) {
		this.delivery = delivery;
		this.previews = previews;
	}

	@GetMapping("/fragments/{id}")
	public ResponseEntity<JsonNode> fragment(@PathVariable String id,
			@RequestHeader(name = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch) {
		return delivery.published(uuid(id)).map(node -> cached(node, ifNoneMatch)).orElseThrow(ContentDeliveryController::notFound);
	}

	@GetMapping("/fragments")
	public ResponseEntity<JsonNode> fragments(@RequestParam(required = false) String model,
			@RequestParam(required = false) String folder, @RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "" + FragmentDelivery.DEFAULT_LIMIT) int limit,
			@RequestHeader(name = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch) {
		return cached(delivery.list(model, folder, page, limit), ifNoneMatch);
	}

	/** The working copy, for whoever holds a preview link of this fragment (see PreviewTokenService). */
	@GetMapping("/preview/fragments/{id}")
	public ResponseEntity<JsonNode> preview(@PathVariable String id, @RequestParam(required = false) String token) {
		UUID fragmentId = uuid(id);
		boolean allowed = previews.resolve(token)
			.filter(t -> t.type() == ContentType.FRAGMENT && t.targetId().equals(fragmentId.toString()))
			.isPresent();
		if (!allowed) {
			// Same answer for a wrong, expired or other fragment's token: nothing to learn from it
			throw notFound();
		}
		JsonNode node = delivery.preview(fragmentId).orElseThrow(ContentDeliveryController::notFound);
		return ResponseEntity.ok()
			.cacheControl(CacheControl.noStore())
			.header("X-Robots-Tag", "noindex")
			.header("Referrer-Policy", "no-referrer")
			.body(node);
	}

	private static ResponseEntity<JsonNode> cached(JsonNode node, String ifNoneMatch) {
		String etag = "\"" + SecureTokens.hash(node.toString()).substring(0, 32) + "\"";
		if (ifNoneMatch != null && (ifNoneMatch.equals(etag) || ifNoneMatch.equals("W/" + etag))) {
			return ResponseEntity.status(HttpStatus.NOT_MODIFIED).eTag(etag).cacheControl(PUBLIC).build();
		}
		return ResponseEntity.ok().eTag(etag).cacheControl(PUBLIC).body(node);
	}

	private static UUID uuid(String raw) {
		try {
			return UUID.fromString(raw);
		}
		catch (IllegalArgumentException ex) {
			throw notFound();
		}
	}

	private static ApiException notFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "FRAGMENT_NOT_FOUND", "Không tìm thấy nội dung");
	}
}
