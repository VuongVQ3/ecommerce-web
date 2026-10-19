package com.nutshop.site;

import com.nutshop.product.Category;
import com.nutshop.product.PricingService;
import com.nutshop.product.Product;
import com.nutshop.product.ProductImage;

import org.springframework.stereotype.Service;

import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Titles, descriptions and structured data per route, shared by server rendering and the sitemap. */
@Service
public class PageMetaService {

	public static final String BRAND = "Hạt Lành";
	public static final String DEFAULT_DESCRIPTION = "Hạt Lành – mắc ca, hạt điều, hạnh nhân, óc chó, bánh hạt, xoài sấy và"
			+ " mật ong. Gói 500 g, giao hàng toàn quốc, thanh toán khi nhận hàng.";
	private static final int DESCRIPTION_MAX = 155;

	/** Public, indexable pages that are not products or categories. */
	public static final Map<String, PageMeta> STATIC_PAGES = staticPages();
	public static final List<String> INDEXED_STATIC_PAGES = STATIC_PAGES.entrySet()
		.stream()
		.filter(e -> !e.getValue().noindex() && !e.getKey().equals("/") && !e.getKey().equals("/san-pham"))
		.map(Map.Entry::getKey)
		.toList();

	private final SiteProperties site;

	public PageMetaService(SiteProperties site) {
		this.site = site;
	}

	private static Map<String, PageMeta> staticPages() {
		Map<String, PageMeta> pages = new LinkedHashMap<>();
		pages.put("/", PageMeta.page(BRAND + " – Hạt dinh dưỡng & đặc sản chọn lọc", DEFAULT_DESCRIPTION, "/"));
		pages.put("/san-pham", PageMeta.page("Tất cả sản phẩm | " + BRAND,
				"Mắc ca, hạt điều, hạnh nhân, óc chó, bánh thuyền hạt, xoài sấy, mật ong… lọc theo danh mục, gói 500 g."
						+ " Giao hàng toàn quốc, thanh toán khi nhận hàng.",
				"/san-pham"));
		pages.put("/chinh-sach-doi-tra", PageMeta.page("Chính sách đổi trả | " + BRAND,
				"Điều kiện, thời hạn và cách đổi trả sản phẩm khi mua hàng tại " + BRAND + ".", "/chinh-sach-doi-tra"));
		pages.put("/chinh-sach-bao-mat", PageMeta.page("Chính sách bảo mật | " + BRAND,
				"Cách " + BRAND + " thu thập, sử dụng và bảo vệ thông tin cá nhân của khách hàng.", "/chinh-sach-bao-mat"));
		pages.put("/chinh-sach-van-chuyen", PageMeta.page("Chính sách vận chuyển | " + BRAND,
				"Phí giao hàng, thời gian giao và khu vực giao hàng của " + BRAND + ".", "/chinh-sach-van-chuyen"));
		pages.put("/dieu-khoan-su-dung", PageMeta.page("Điều khoản sử dụng | " + BRAND,
				"Điều khoản khi sử dụng website và mua hàng tại " + BRAND + ".", "/dieu-khoan-su-dung"));
		pages.put("/lien-he", PageMeta.page("Liên hệ | " + BRAND,
				"Thông tin liên hệ, hotline và email hỗ trợ khách hàng của " + BRAND + ".", "/lien-he"));
		pages.put("/tra-cuu-don-hang", PageMeta.page("Tra cứu đơn hàng | " + BRAND,
				"Tra cứu tình trạng đơn hàng bằng mã đơn và số điện thoại.", "/tra-cuu-don-hang"));
		for (var p : List.of(new String[] { "/dang-nhap", "Đăng nhập" }, new String[] { "/dang-ky", "Đăng ký" },
				new String[] { "/quen-mat-khau", "Quên mật khẩu" }, new String[] { "/dat-lai-mat-khau", "Đặt lại mật khẩu" },
				new String[] { "/gio-hang", "Giỏ hàng" }, new String[] { "/thanh-toan", "Thanh toán" })) {
			pages.put(p[0], PageMeta.privatePage(p[1] + " | " + BRAND, p[0]));
		}
		return Collections.unmodifiableMap(pages);
	}

	public PageMeta notFound(String path) {
		return new PageMeta("Không tìm thấy trang | " + BRAND, DEFAULT_DESCRIPTION, path, null, "website", true, List.of());
	}

	public PageMeta category(Category category) {
		String path = "/danh-muc/" + category.getSlug();
		Map<String, Object> breadcrumb = breadcrumb(List.of(crumb("Trang chủ", "/"), crumb("Sản phẩm", "/san-pham"),
				crumb(category.getName(), path)));
		return new PageMeta(category.getName() + " | " + BRAND,
				truncate(category.getName() + " tại " + BRAND + ": gói 500 g, chọn lọc kỹ, giao hàng toàn quốc, thanh toán"
						+ " khi nhận hàng."),
				path, null, "website", false, List.of(breadcrumb));
	}

	/**
	 * "Hạnh nhân sấy 500g – 189.000₫ | Hạt Lành", the description cut to 155 characters, the primary image and
	 * schema.org Product + BreadcrumbList.
	 */
	public PageMeta product(Product p, List<ProductImage> images, PricingService.Price current) {
		String path = "/san-pham/" + p.getSlug();
		String title = p.getName() + " " + weight(p.getWeightGrams()) + " – " + price(current.price()) + " | " + BRAND;
		List<String> imageUrls = images.stream().map(i -> ogImage(i.getUrl())).toList();
		if (imageUrls.isEmpty() && p.getImageUrl() != null) {
			imageUrls = List.of(ogImage(p.getImageUrl()));
		}
		String image = imageUrls.isEmpty() ? defaultImage() : imageUrls.getFirst();
		boolean inStock = p.isActive() && p.availableQuantity() > 0;

		Map<String, Object> offer = new LinkedHashMap<>();
		offer.put("@type", "Offer");
		offer.put("url", site.absolute(path));
		offer.put("price", current.price());
		if (current.promotionEndsAt() != null) {
			offer.put("priceValidUntil", current.promotionEndsAt().atZone(PricingService.VIETNAM).toLocalDate().toString());
		}
		offer.put("priceCurrency", "VND");
		offer.put("availability", inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock");
		offer.put("itemCondition", "https://schema.org/NewCondition");

		Map<String, Object> product = new LinkedHashMap<>();
		product.put("@context", "https://schema.org");
		product.put("@type", "Product");
		product.put("name", p.getName());
		product.put("image", imageUrls.isEmpty() ? List.of(image) : imageUrls);
		product.put("description", p.getDescription());
		product.put("sku", "HL-" + p.getId());
		product.put("brand", Map.of("@type", "Brand", "name", BRAND));
		product.put("category", p.getCategory().getName());
		product.put("offers", offer);

		Map<String, Object> breadcrumb = breadcrumb(List.of(crumb("Trang chủ", "/"), crumb("Sản phẩm", "/san-pham"),
				crumb(p.getCategory().getName(), "/danh-muc/" + p.getCategory().getSlug()), crumb(p.getName(), path)));
		return new PageMeta(title, truncate(p.getDescription()), path, image, "product", false,
				List.of(product, breadcrumb));
	}

	public String defaultImage() {
		return site.absolute("/og-default.png");
	}

	// ---- helpers ----------------------------------------------------------------------------------------------

	private Map<String, Object> crumb(String name, String path) {
		Map<String, Object> item = new LinkedHashMap<>();
		item.put("name", name);
		item.put("item", site.absolute(path));
		return item;
	}

	private static Map<String, Object> breadcrumb(List<Map<String, Object>> items) {
		List<Object> list = new ArrayList<>();
		for (int i = 0; i < items.size(); i++) {
			Map<String, Object> entry = new LinkedHashMap<>();
			entry.put("@type", "ListItem");
			entry.put("position", i + 1);
			entry.putAll(items.get(i));
			list.add(entry);
		}
		Map<String, Object> breadcrumb = new LinkedHashMap<>();
		breadcrumb.put("@context", "https://schema.org");
		breadcrumb.put("@type", "BreadcrumbList");
		breadcrumb.put("itemListElement", list);
		return breadcrumb;
	}

	/** 1200x630 crop from Cloudinary (as JPEG, which every social network accepts). */
	static String ogImage(String url) {
		int at = url.indexOf("/image/upload/");
		if (at < 0 || !url.contains("res.cloudinary.com")) {
			return url;
		}
		int cut = at + "/image/upload/".length();
		return url.substring(0, cut) + "c_fill,w_1200,h_630,q_auto,f_jpg/" + url.substring(cut);
	}

	/** At most 155 characters, cut at a word boundary with an ellipsis. */
	static String truncate(String text) {
		String clean = text == null ? "" : text.replaceAll("\\s+", " ").trim();
		if (clean.length() <= DESCRIPTION_MAX) {
			return clean;
		}
		String cut = clean.substring(0, DESCRIPTION_MAX - 1);
		int space = cut.lastIndexOf(' ');
		if (space > DESCRIPTION_MAX / 2) {
			cut = cut.substring(0, space);
		}
		return cut.replaceAll("[\\s,.;:–-]+$", "") + "…";
	}

	static String price(long vnd) {
		return NumberFormat.getIntegerInstance(Locale.forLanguageTag("vi-VN")).format(vnd) + "₫";
	}

	static String weight(int grams) {
		if (grams < 1000) {
			return grams + "g";
		}
		return (grams % 1000 == 0 ? String.valueOf(grams / 1000) : String.valueOf(grams / 1000.0)) + "kg";
	}
}
