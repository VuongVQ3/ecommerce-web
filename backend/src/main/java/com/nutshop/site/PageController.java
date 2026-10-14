package com.nutshop.site;

import com.nutshop.common.Slugs;
import com.nutshop.product.CategoryRepository;
import com.nutshop.product.PricingService;
import com.nutshop.product.ProductImageRepository;
import com.nutshop.product.ProductRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * The React app's routes, rendered with page-specific meta tags. Only these paths return the app with 200; anything
 * else that is not a static file gets the app's 404 page with status 404 (see NotFoundAdvice). Keep in sync with
 * frontend/src/main.tsx (PageRoutesTest checks every route there).
 */
@Controller
public class PageController {

	private final HtmlPages pages;
	private final PageMetaService meta;
	private final ProductRepository products;
	private final ProductImageRepository images;
	private final CategoryRepository categories;
	private final PricingService pricing;

	public PageController(HtmlPages pages, PageMetaService meta, ProductRepository products,
			ProductImageRepository images, CategoryRepository categories, PricingService pricing) {
		this.pages = pages;
		this.meta = meta;
		this.products = products;
		this.categories = categories;
		this.images = images;
		this.pricing = pricing;
	}

	@GetMapping({ "/", "/chinh-sach-doi-tra", "/chinh-sach-bao-mat", "/chinh-sach-van-chuyen", "/dieu-khoan-su-dung",
			"/lien-he", "/tra-cuu-don-hang", "/dang-nhap", "/dang-ky", "/quen-mat-khau", "/dat-lai-mat-khau",
			"/gio-hang", "/thanh-toan" })
	public ResponseEntity<String> staticPage(HttpServletRequest request) {
		return pages.render(PageMetaService.STATIC_PAGES.get(request.getRequestURI()), HttpStatus.OK);
	}

	/** The old filter link /san-pham?category=x moves permanently to the category page. */
	@GetMapping("/san-pham")
	public ResponseEntity<String> products(@RequestParam(required = false) String category, HttpServletRequest request) {
		if (category != null && Slugs.isValid(category)) {
			String target = UriComponentsBuilder.fromPath("/danh-muc/" + category)
				.query(request.getQueryString())
				.replaceQueryParam("category")
				.build()
				.toUriString();
			return ResponseEntity.status(HttpStatus.MOVED_PERMANENTLY).header(HttpHeaders.LOCATION, target).build();
		}
		return pages.render(PageMetaService.STATIC_PAGES.get("/san-pham"), HttpStatus.OK);
	}

	/** Missing or hidden products are a real 404 (also for crawlers). */
	@GetMapping("/san-pham/{slug}")
	@Transactional(readOnly = true)
	public ResponseEntity<String> product(@PathVariable String slug, HttpServletRequest request) {
		return products.findBySlug(slug)
			.filter(p -> p.isActive())
			.map(p -> pages.render(meta.product(p, images.findByProductIdOrderByPrimaryDescPositionAsc(p.getId()),
					pricing.priceOf(p)), HttpStatus.OK))
			.orElseGet(() -> pages.notFound(request.getRequestURI()));
	}

	@GetMapping("/danh-muc/{slug}")
	public ResponseEntity<String> category(@PathVariable String slug, HttpServletRequest request) {
		return categories.findBySlug(slug)
			.map(c -> pages.render(meta.category(c), HttpStatus.OK))
			.orElseGet(() -> pages.notFound(request.getRequestURI()));
	}

	@GetMapping("/dat-hang-thanh-cong/{code}")
	public ResponseEntity<String> orderPlaced(HttpServletRequest request) {
		return pages.render(PageMeta.privatePage("Đặt hàng thành công | " + PageMetaService.BRAND, request.getRequestURI()),
				HttpStatus.OK);
	}

	/**
	 * Guest tracking page: the URL carries a secret token (?t=), so the page is never indexed, never cached and
	 * never sends a Referer header to other sites.
	 */
	@GetMapping("/don-hang/{code}")
	public ResponseEntity<String> trackOrder(HttpServletRequest request) {
		return secret(pages.render(PageMeta.privatePage("Theo dõi đơn hàng | " + PageMetaService.BRAND,
				request.getRequestURI()), HttpStatus.OK));
	}

	@GetMapping("/xac-minh-email")
	public ResponseEntity<String> verifyEmail(HttpServletRequest request) {
		return secret(pages.render(PageMeta.privatePage("Xác minh email | " + PageMetaService.BRAND,
				request.getRequestURI()), HttpStatus.OK));
	}

	/** Staff invitation link (?token=): same treatment as the other secret links. */
	@GetMapping("/dat-mat-khau")
	public ResponseEntity<String> acceptInvite(HttpServletRequest request) {
		return secret(pages.render(PageMeta.privatePage("Đặt mật khẩu | " + PageMetaService.BRAND,
				request.getRequestURI()), HttpStatus.OK));
	}

	private static ResponseEntity<String> secret(ResponseEntity<String> page) {
		return ResponseEntity.status(page.getStatusCode())
			.headers(h -> {
				h.addAll(page.getHeaders());
				h.setCacheControl(CacheControl.noStore());
				h.set("Referrer-Policy", "no-referrer");
			})
			.body(page.getBody());
	}

	/** Signed-in areas: guarded by the app and the API; never indexed. */
	@GetMapping({ "/tai-khoan", "/tai-khoan/**" })
	public ResponseEntity<String> account(HttpServletRequest request) {
		return pages.render(PageMeta.privatePage("Tài khoản | " + PageMetaService.BRAND, request.getRequestURI()),
				HttpStatus.OK);
	}

	@GetMapping({ "/admin", "/admin/**" })
	public ResponseEntity<String> admin(HttpServletRequest request) {
		return pages.render(PageMeta.privatePage("Quản trị | " + PageMetaService.BRAND, request.getRequestURI()),
				HttpStatus.OK);
	}

	/** Old address of the terms page. */
	@GetMapping("/dieu-khoan")
	public ResponseEntity<Void> oldTerms() {
		return ResponseEntity.status(HttpStatus.MOVED_PERMANENTLY).header(HttpHeaders.LOCATION, "/dieu-khoan-su-dung").build();
	}
}
