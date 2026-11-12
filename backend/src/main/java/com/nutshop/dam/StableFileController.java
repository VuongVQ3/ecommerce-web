package com.nutshop.dam;

import com.nutshop.media.AssetTypes.Kind;
import com.nutshop.site.HtmlPages;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

import java.net.URI;
import java.time.Duration;
import java.util.UUID;

/**
 * Links to DAM files that never break: /files/{assetId}/{name} redirects to the file's current Cloudinary URL, so a
 * price list sent to customers (Zalo, email) keeps working after the PDF is replaced. Public, outside /api. The name
 * is only there to make the link readable; it is never looked up.
 */
@Controller
public class StableFileController {

	/** Short, so a replaced file shows up within minutes even behind caches. */
	static final Duration MAX_AGE = Duration.ofMinutes(5);

	private final DamAssetService assets;
	private final HtmlPages pages;

	public StableFileController(DamAssetService assets, HtmlPages pages) {
		this.assets = assets;
		this.pages = pages;
	}

	@GetMapping("/files/{id}/{name}")
	public ResponseEntity<?> file(@PathVariable String id, @PathVariable String name, HttpServletRequest request) {
		UUID assetId;
		try {
			assetId = UUID.fromString(id);
		}
		catch (IllegalArgumentException ex) {
			return pages.notFound(request.getRequestURI());
		}
		return assets.findForDelivery(assetId).<ResponseEntity<?>>map(asset -> {
			var response = ResponseEntity.status(HttpStatus.FOUND)
				.location(URI.create(asset.url()))
				.cacheControl(CacheControl.maxAge(MAX_AGE).cachePublic());
			if (asset.kind() == Kind.PDF) {
				// Price lists and documents are for the people they are sent to, not for search results
				response.header("X-Robots-Tag", "noindex");
			}
			return response.build();
		}).orElseGet(() -> pages.notFound(request.getRequestURI()));
	}
}
