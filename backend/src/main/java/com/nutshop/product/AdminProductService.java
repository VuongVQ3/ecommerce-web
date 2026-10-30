package com.nutshop.product;

import com.nutshop.audit.AuditLog;
import com.nutshop.common.ApiException;
import com.nutshop.common.PageResponse;
import com.nutshop.common.Slugs;
import com.nutshop.media.ImageStorage;
import com.nutshop.media.ImageStorage.StoredImage;
import com.nutshop.media.ImageTypes;
import jakarta.persistence.criteria.Predicate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/** Catalogue management (ADMIN only): products, images, categories. Every change is audited. */
@Service
public class AdminProductService {

	public static final long MAX_IMAGE_BYTES = 5L * 1024 * 1024;
	public static final int MAX_IMAGES = 5;

	private static final Logger log = LoggerFactory.getLogger(AdminProductService.class);

	public record ImageRow(UUID id, String url, Integer width, Integer height, boolean primary) {

		static ImageRow from(ProductImage i) {
			return new ImageRow(i.getId(), i.getUrl(), i.getWidth(), i.getHeight(), i.isPrimary());
		}
	}

	/** @param price 0 = no price yet ("Chưa có giá") */
	public record ProductRow(Long id, String name, String slug, String categoryName, String categorySlug, long price,
			boolean active, int onHand, int reserved, int available, int lowStockThreshold, boolean lowStock,
			String imageUrl, int sortOrder) {

		static ProductRow from(Product p) {
			return new ProductRow(p.getId(), p.getName(), p.getSlug(), p.getCategory().getName(),
					p.getCategory().getSlug(), p.getPrice(), p.isActive(), p.getOnHand(), p.getReserved(),
					p.availableQuantity(), p.getLowStockThreshold(), p.isLowStock(), p.getImageUrl(), p.getSortOrder());
		}
	}

	public record ProductAdminDetail(Long id, String name, String slug, Long categoryId, String shortDescription,
			String description,
			String origin, long price, int weightGrams, BigDecimal calories, BigDecimal protein, BigDecimal fat,
			BigDecimal carbs, BigDecimal fiber, int lowStockThreshold, boolean active, int onHand, int reserved,
			int available, List<ImageRow> images, Instant priceLockedUntil, int sortOrder) {
	}

	/** What the audit log stores for a product (editable fields only). */
	private record AuditView(String name, String slug, Long categoryId, String shortDescription, String description,
			String origin, long price,
			int weightGrams, BigDecimal calories, BigDecimal protein, BigDecimal fat, BigDecimal carbs,
			BigDecimal fiber, int lowStockThreshold, boolean active) {

		static AuditView of(Product p) {
			return new AuditView(p.getName(), p.getSlug(), p.getCategory().getId(), p.getShortDescription(),
					p.getDescription(), p.getOrigin(),
					p.getPrice(), p.getWeightGrams(), p.getCalories(), p.getProtein(), p.getFat(), p.getCarbs(),
					p.getFiber(), p.getLowStockThreshold(), p.isActive());
		}
	}

	public record CategoryRow(Long id, String name, String slug, long productCount) {
	}

	private final ProductRepository products;
	private final CategoryRepository categories;
	private final ProductImageRepository images;
	private final ImageStorage storage;
	private final AuditLog audit;
	private final TransactionTemplate tx;
	private final PromotionService promotions;
	private final ProductSlugHistory slugHistory;
	private final CategorySlugHistory categorySlugHistory;
	private final JdbcTemplate jdbc;

	public static final String PRICE_REQUIRED = "PRICE_REQUIRED";
	public static final String PRICE_REQUIRED_MESSAGE = "Nhập giá bán trước khi hiện sản phẩm";

	public AdminProductService(ProductRepository products, CategoryRepository categories,
			ProductImageRepository images, ImageStorage storage, AuditLog audit, PlatformTransactionManager txManager,
			PromotionService promotions, ProductSlugHistory slugHistory, CategorySlugHistory categorySlugHistory,
			JdbcTemplate jdbc) {
		this.categorySlugHistory = categorySlugHistory;
		this.jdbc = jdbc;
		this.promotions = promotions;
		this.slugHistory = slugHistory;
		this.products = products;
		this.categories = categories;
		this.images = images;
		this.storage = storage;
		this.audit = audit;
		this.tx = new TransactionTemplate(txManager);
	}

	// ---- products ---------------------------------------------------------------------------------------------

	/** @param notReady only products that cannot be sold yet: no price, or no stock */
	@Transactional(readOnly = true)
	public PageResponse<ProductRow> list(String q, Boolean active, boolean notReady, int page, int size) {
		Specification<Product> spec = (root, query, cb) -> {
			List<Predicate> where = new ArrayList<>();
			if (StringUtils.hasText(q)) {
				String like = "%" + q.trim().toLowerCase(Locale.ROOT).replaceAll("[%_]", "") + "%";
				where.add(cb.or(cb.like(cb.lower(root.get("name")), like), cb.like(root.get("slug"), like)));
			}
			if (active != null) {
				where.add(cb.equal(root.get("active"), active));
			}
			if (notReady) {
				where.add(cb.or(cb.le(root.<Long>get("price"), 0L), cb.le(root.<Integer>get("onHand"), 0)));
			}
			return cb.and(where.toArray(Predicate[]::new));
		};
		// Same order as the storefront
		var pageable = PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, 100), Sort.by("sortOrder", "name", "id"));
		return PageResponse.from(products.findAll(spec, pageable).map(ProductRow::from));
	}

	@Transactional(readOnly = true)
	public ProductAdminDetail get(long id) {
		return detail(products.findById(id).orElseThrow(AdminProductService::productNotFound));
	}

	/** A product without a price is created hidden; without a sort order it goes after the others. */
	@Transactional
	public ProductAdminDetail create(Long categoryId, String requestedSlug, Product.Details details, UUID actorId) {
		checkNutrition(details);
		Category category = category(categoryId);
		Product draft = new Product(category, slugFor(requestedSlug, details.name(), null), details);
		if (details.sortOrder() == null) {
			draft.setSortOrder(products.maxSortOrder() + 1);
		}
		if (details.price() <= 0) {
			draft.setActive(false);
		}
		Product product = products.save(draft);
		audit.entry("PRODUCT_CREATED", "PRODUCT", product.getId(), product.getName())
			.by(actorId)
			.changes(null, AuditView.of(product))
			.record();
		return detail(product);
	}

	@Transactional
	public ProductAdminDetail update(long id, Long categoryId, String requestedSlug, Product.Details details,
			UUID actorId) {
		Product product = products.lockById(id).orElseThrow(AdminProductService::productNotFound);
		checkNutrition(details);
		if (product.isActive() && details.price() <= 0) {
			throw new ApiException(HttpStatus.BAD_REQUEST, PRICE_REQUIRED, PRICE_REQUIRED_MESSAGE);
		}
		if (details.price() != product.getPrice()) {
			// Frozen while a promotion is running or upcoming
			promotions.checkNewRegularPrice(id);
		}
		AuditView before = AuditView.of(product);
		String oldSlug = product.getSlug();
		product.update(category(categoryId), slugFor(requestedSlug, details.name(), id), details);
		slugHistory.changed(id, oldSlug, product.getSlug());
		audit.entry("PRODUCT_UPDATED", "PRODUCT", id, product.getName()).by(actorId).changes(before, AuditView.of(product)).record();
		return detail(product);
	}

	/**
	 * Hide/show: how to stop selling a product that was ordered (it cannot be deleted). Showing needs a price
	 * (products of the real catalogue start at 0 until the owner prices them).
	 */
	@Transactional
	public ProductAdminDetail setActive(long id, boolean active, UUID actorId) {
		Product product = products.findById(id).orElseThrow(AdminProductService::productNotFound);
		if (active && !product.hasPrice()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, PRICE_REQUIRED, PRICE_REQUIRED_MESSAGE);
		}
		if (product.isActive() != active) {
			product.setActive(active);
			audit.entry(active ? "PRODUCT_SHOWN" : "PRODUCT_HIDDEN", "PRODUCT", id, product.getName())
				.by(actorId)
				.changes(Map.of("active", !active), Map.of("active", active))
				.record();
		}
		return detail(product);
	}

	/**
	 * Deletes a product for good, with its images (files removed after commit), slug history, stock history,
	 * promotions and cart lines. Refused once it is in an order: old orders must keep showing what was bought.
	 */
	@Transactional
	public void delete(long id, UUID actorId) {
		Product product = products.lockById(id).orElseThrow(AdminProductService::productNotFound);
		Integer orders = jdbc.queryForObject("SELECT COUNT(DISTINCT order_id) FROM order_items WHERE product_id = ?",
				Integer.class, id);
		if (orders != null && orders > 0) {
			throw hasOrders("Sản phẩm đã có trong " + orders + " đơn hàng nên không xoá được (đơn cũ cần giữ thông tin sản phẩm).");
		}
		AuditView before = AuditView.of(product);
		List<String> publicIds = images.findByProductIdOrderByPrimaryDescPositionAsc(id)
			.stream()
			.map(ProductImage::getPublicId)
			.toList();
		jdbc.update("DELETE FROM cart_items WHERE product_id = ?", id);
		jdbc.update("DELETE FROM inventory_movements WHERE product_id = ?", id);
		jdbc.update("DELETE FROM product_promotions WHERE product_id = ?", id);
		try {
			// product_images and product_slug_history go with it (ON DELETE CASCADE)
			products.delete(product);
			products.flush();
		}
		catch (DataIntegrityViolationException ex) {
			// An order came in between the check and the delete
			throw hasOrders("Sản phẩm vừa được đặt trong một đơn hàng nên không xoá được.");
		}
		audit.entry("PRODUCT_DELETED", "PRODUCT", id, before.name()).by(actorId).changes(before, null).record();
		TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
			@Override
			public void afterCommit() {
				publicIds.forEach(AdminProductService.this::deleteQuietly);
			}
		});
	}

	/**
	 * Drag-to-reorder: puts the product just before {@code beforeId}, just after {@code afterId}, or (neither) at
	 * the end, then numbers the whole catalogue 1, 2, 3… in the admin list's order (rows locked meanwhile, so two
	 * moves cannot interleave). Audited only when the position really changes, as positions (not the old numbers:
	 * several products may share one, e.g. the samples at 1000).
	 */
	@Transactional
	public ProductRow move(long id, Long beforeId, Long afterId, UUID actorId) {
		if (beforeId != null && afterId != null || Objects.equals(beforeId, id) || Objects.equals(afterId, id)) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_MOVE", "Vị trí mới không hợp lệ");
		}
		List<long[]> rows = jdbc.query("SELECT id, sort_order FROM products ORDER BY sort_order, name, id FOR UPDATE",
				(rs, n) -> new long[] { rs.getLong(1), rs.getInt(2) });
		List<Long> ids = new ArrayList<>(rows.stream().map(r -> r[0]).toList());
		int from = ids.indexOf(id);
		if (from < 0) {
			throw productNotFound();
		}
		Long target = beforeId != null ? beforeId : afterId;
		if (target != null && !ids.contains(target)) {
			throw new ApiException(HttpStatus.CONFLICT, "MOVE_TARGET_GONE",
					"Sản phẩm dùng làm mốc không còn nữa. Tải lại danh sách rồi thử lại.");
		}
		ids.remove(from);
		int to = beforeId != null ? ids.indexOf(beforeId) : afterId != null ? ids.indexOf(afterId) + 1 : ids.size();
		ids.add(to, id);

		// Only the rows whose number changes are written
		Map<Long, Long> oldOrder = new HashMap<>();
		rows.forEach(r -> oldOrder.put(r[0], r[1]));
		List<Object[]> changed = new ArrayList<>();
		for (int i = 0; i < ids.size(); i++) {
			if (oldOrder.get(ids.get(i)) != i + 1) {
				changed.add(new Object[] { i + 1, ids.get(i) });
			}
		}
		if (!changed.isEmpty()) {
			jdbc.batchUpdate("UPDATE products SET sort_order = ? WHERE id = ?", changed);
		}
		Product product = products.findById(id).orElseThrow(AdminProductService::productNotFound);
		if (to != from) {
			audit.entry("PRODUCT_MOVED", "PRODUCT", id, product.getName())
				.by(actorId)
				.changes(Map.of("sortOrder", from + 1), Map.of("sortOrder", to + 1))
				.record();
		}
		return ProductRow.from(product);
	}

	// ---- images -----------------------------------------------------------------------------------------------

	/**
	 * Validates the real file content, uploads outside any DB transaction (it is a slow network call), then
	 * records it under a product row lock so concurrent uploads cannot exceed the limit. A failed save removes
	 * the uploaded file again.
	 */
	public ProductAdminDetail addImage(long id, byte[] bytes, UUID actorId) {
		if (bytes == null || bytes.length == 0) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_IMAGE", "Vui lòng chọn một ảnh");
		}
		if (bytes.length > MAX_IMAGE_BYTES) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "IMAGE_TOO_LARGE", "Ảnh tối đa 5MB");
		}
		ImageTypes.ImageType type = ImageTypes.detect(bytes)
			.orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "INVALID_IMAGE",
					"Chỉ nhận ảnh JPEG, PNG hoặc WebP (nội dung file không phải ảnh hợp lệ)"));
		if (!products.existsById(id)) {
			throw productNotFound();
		}
		if (images.countByProductId(id) >= MAX_IMAGES) {
			throw tooManyImages();
		}
		StoredImage stored = storage.upload(bytes, type);
		try {
			return tx.execute(status -> {
				Product product = products.lockById(id).orElseThrow(AdminProductService::productNotFound);
				long count = images.countByProductId(id);
				if (count >= MAX_IMAGES) {
					throw tooManyImages();
				}
				ProductImage image = new ProductImage(id, stored.publicId(), stored.url(), stored.width(),
						stored.height(), (int) count);
				if (count == 0) {
					image.setPrimary(true);
					product.setImageUrl(stored.url());
				}
				images.save(image);
				audit.entry("PRODUCT_IMAGE_ADDED", "PRODUCT", id, product.getName())
					.by(actorId)
					.changes(null, Map.of("publicId", stored.publicId(), "primary", image.isPrimary()))
					.record();
				return detail(product);
			});
		}
		catch (RuntimeException ex) {
			deleteQuietly(stored.publicId());
			throw ex;
		}
	}

	@Transactional
	public ProductAdminDetail deleteImage(long id, UUID imageId, UUID actorId) {
		Product product = products.lockById(id).orElseThrow(AdminProductService::productNotFound);
		ProductImage image = images.findById(imageId)
			.filter(i -> i.getProductId().equals(id))
			.orElseThrow(AdminProductService::imageNotFound);
		images.delete(image);
		images.flush();
		if (image.isPrimary()) {
			// Promote the next image (if any) so the product keeps a picture
			List<ProductImage> rest = images.findByProductIdOrderByPrimaryDescPositionAsc(id);
			if (rest.isEmpty()) {
				product.setImageUrl(null);
			}
			else {
				rest.getFirst().setPrimary(true);
				product.setImageUrl(rest.getFirst().getUrl());
			}
		}
		audit.entry("PRODUCT_IMAGE_DELETED", "PRODUCT", id, products.findById(id).map(Product::getName).orElse(null))
			.by(actorId)
			.changes(Map.of("publicId", image.getPublicId()), null)
			.record();
		String publicId = image.getPublicId();
		TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
			@Override
			public void afterCommit() {
				deleteQuietly(publicId);
			}
		});
		return detail(product);
	}

	@Transactional
	public ProductAdminDetail makePrimary(long id, UUID imageId, UUID actorId) {
		products.lockById(id).orElseThrow(AdminProductService::productNotFound);
		ProductImage image = images.findById(imageId)
			.filter(i -> i.getProductId().equals(id))
			.orElseThrow(AdminProductService::imageNotFound);
		String url = image.getUrl();
		images.clearPrimary(id); // clears the persistence context: reload below
		ProductImage fresh = images.findById(imageId).orElseThrow();
		fresh.setPrimary(true);
		Product product = products.findById(id).orElseThrow();
		product.setImageUrl(url);
		audit.entry("PRODUCT_IMAGE_PRIMARY", "PRODUCT", id, product.getName())
			.by(actorId)
			.changes(null, Map.of("publicId", fresh.getPublicId()))
			.record();
		return detail(product);
	}

	// ---- categories -------------------------------------------------------------------------------------------

	@Transactional(readOnly = true)
	public List<CategoryRow> listCategories() {
		return categories.findAll(Sort.by("id"))
			.stream()
			.map(c -> new CategoryRow(c.getId(), c.getName(), c.getSlug(), products.countByCategoryId(c.getId())))
			.toList();
	}

	@Transactional
	public CategoryRow createCategory(String name, String requestedSlug, UUID actorId) {
		String slug = categorySlug(requestedSlug, name, null);
		Category category = categories.save(new Category(name.trim(), slug));
		audit.entry("CATEGORY_CREATED", "CATEGORY", category.getId(), category.getName())
			.by(actorId)
			.changes(null, Map.of("name", category.getName(), "slug", slug))
			.record();
		return new CategoryRow(category.getId(), category.getName(), category.getSlug(), 0);
	}

	@Transactional
	public CategoryRow renameCategory(long id, String name, String requestedSlug, UUID actorId) {
		Category category = categories.findById(id)
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "CATEGORY_NOT_FOUND", "Không tìm thấy danh mục"));
		Map<String, String> before = Map.of("name", category.getName(), "slug", category.getSlug());
		String oldSlug = category.getSlug();
		category.rename(name.trim(), categorySlug(requestedSlug, name, id));
		// Old links to the category keep working
		categorySlugHistory.changed(id, oldSlug, category.getSlug());
		audit.entry("CATEGORY_UPDATED", "CATEGORY", id, category.getName())
			.by(actorId)
			.changes(before, Map.of("name", category.getName(), "slug", category.getSlug()))
			.record();
		return new CategoryRow(id, category.getName(), category.getSlug(), products.countByCategoryId(id));
	}

	// ---- helpers ----------------------------------------------------------------------------------------------

	private ProductAdminDetail detail(Product p) {
		return new ProductAdminDetail(p.getId(), p.getName(), p.getSlug(), p.getCategory().getId(),
				p.getShortDescription(), p.getDescription(),
				p.getOrigin(), p.getPrice(), p.getWeightGrams(), p.getCalories(), p.getProtein(), p.getFat(),
				p.getCarbs(), p.getFiber(), p.getLowStockThreshold(), p.isActive(), p.getOnHand(), p.getReserved(),
				p.availableQuantity(),
				images.findByProductIdOrderByPrimaryDescPositionAsc(p.getId()).stream().map(ImageRow::from).toList(),
				promotions.priceLockedUntil(p.getId()), p.getSortOrder());
	}

	/** Nutrition is optional, but a half-filled table would mislead: all five values or none. */
	private static void checkNutrition(Product.Details d) {
		long filled = java.util.stream.Stream.of(d.calories(), d.protein(), d.fat(), d.carbs(), d.fiber())
			.filter(java.util.Objects::nonNull)
			.count();
		if (filled != 0 && filled != 5) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "NUTRITION_INCOMPLETE",
					"Nhập đủ 5 chỉ số dinh dưỡng hoặc để trống cả 5");
		}
	}

	private Category category(Long id) {
		return categories.findById(id)
			.orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "CATEGORY_NOT_FOUND", "Danh mục không tồn tại"));
	}

	/** Explicit slug: must be valid and free. Otherwise generated from the name, with -2, -3… if taken. */
	private String slugFor(String requested, String name, Long selfId) {
		if (StringUtils.hasText(requested)) {
			String slug = requested.trim();
			if (!Slugs.isValid(slug)) {
				throw invalidSlug();
			}
			if (slugTaken(slug, selfId)) {
				throw new ApiException(HttpStatus.CONFLICT, "SLUG_EXISTS", "Đường dẫn (slug) đã được dùng cho sản phẩm khác");
			}
			return slug;
		}
		String base = Slugs.from(name).isEmpty() ? "san-pham" : Slugs.from(name);
		String slug = base;
		for (int n = 2; slugTaken(slug, selfId); n++) {
			slug = base + "-" + n;
		}
		return slug;
	}

	/** In use by another product, or an old address of another product (it still redirects there). */
	private boolean slugTaken(String slug, Long selfId) {
		return products.findBySlug(slug).filter(p -> !p.getId().equals(selfId)).isPresent()
				|| slugHistory.usedByOther(slug, selfId);
	}

	private String categorySlug(String requested, String name, Long selfId) {
		String slug = StringUtils.hasText(requested) ? requested.trim() : Slugs.from(name);
		if (!Slugs.isValid(slug)) {
			throw invalidSlug();
		}
		if (categories.findBySlug(slug).filter(c -> !c.getId().equals(selfId)).isPresent()) {
			throw new ApiException(HttpStatus.CONFLICT, "SLUG_EXISTS", "Đường dẫn (slug) đã được dùng cho danh mục khác");
		}
		return slug;
	}

	private void deleteQuietly(String publicId) {
		try {
			storage.delete(publicId);
		}
		catch (RuntimeException ex) {
			log.warn("Could not delete image {} from storage", publicId, ex);
		}
	}

	private static ApiException invalidSlug() {
		return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_SLUG",
				"Slug chỉ gồm chữ thường không dấu, số và dấu gạch ngang (ví dụ: hat-dieu-rang-muoi)");
	}

	private static ApiException tooManyImages() {
		return new ApiException(HttpStatus.CONFLICT, "TOO_MANY_IMAGES", "Mỗi sản phẩm tối đa " + MAX_IMAGES + " ảnh");
	}

	private static ApiException hasOrders(String why) {
		return new ApiException(HttpStatus.CONFLICT, "PRODUCT_HAS_ORDERS", why + " Hãy ẩn sản phẩm để ngừng bán.");
	}

	private static ApiException productNotFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm");
	}

	private static ApiException imageNotFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "IMAGE_NOT_FOUND", "Không tìm thấy ảnh");
	}
}
