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
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
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

	public record ProductRow(Long id, String name, String slug, String categoryName, long price, boolean active,
			int onHand, int reserved, int available, int lowStockThreshold, boolean lowStock, String imageUrl) {

		static ProductRow from(Product p) {
			return new ProductRow(p.getId(), p.getName(), p.getSlug(), p.getCategory().getName(), p.getPrice(),
					p.isActive(), p.getOnHand(), p.getReserved(), p.availableQuantity(), p.getLowStockThreshold(),
					p.isLowStock(), p.getImageUrl());
		}
	}

	public record ProductAdminDetail(Long id, String name, String slug, Long categoryId, String description,
			String origin, long price, int weightGrams, BigDecimal calories, BigDecimal protein, BigDecimal fat,
			BigDecimal carbs, BigDecimal fiber, int lowStockThreshold, boolean active, int onHand, int reserved,
			int available, List<ImageRow> images) {
	}

	/** What the audit log stores for a product (editable fields only). */
	private record AuditView(String name, String slug, Long categoryId, String description, String origin, long price,
			int weightGrams, BigDecimal calories, BigDecimal protein, BigDecimal fat, BigDecimal carbs,
			BigDecimal fiber, int lowStockThreshold, boolean active) {

		static AuditView of(Product p) {
			return new AuditView(p.getName(), p.getSlug(), p.getCategory().getId(), p.getDescription(), p.getOrigin(),
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

	public AdminProductService(ProductRepository products, CategoryRepository categories,
			ProductImageRepository images, ImageStorage storage, AuditLog audit, PlatformTransactionManager txManager,
			PromotionService promotions) {
		this.promotions = promotions;
		this.products = products;
		this.categories = categories;
		this.images = images;
		this.storage = storage;
		this.audit = audit;
		this.tx = new TransactionTemplate(txManager);
	}

	// ---- products ---------------------------------------------------------------------------------------------

	@Transactional(readOnly = true)
	public PageResponse<ProductRow> list(String q, Boolean active, int page, int size) {
		Specification<Product> spec = (root, query, cb) -> {
			List<Predicate> where = new ArrayList<>();
			if (StringUtils.hasText(q)) {
				String like = "%" + q.trim().toLowerCase(Locale.ROOT).replaceAll("[%_]", "") + "%";
				where.add(cb.or(cb.like(cb.lower(root.get("name")), like), cb.like(root.get("slug"), like)));
			}
			if (active != null) {
				where.add(cb.equal(root.get("active"), active));
			}
			return cb.and(where.toArray(Predicate[]::new));
		};
		var pageable = PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, 100), Sort.by("name"));
		return PageResponse.from(products.findAll(spec, pageable).map(ProductRow::from));
	}

	@Transactional(readOnly = true)
	public ProductAdminDetail get(long id) {
		return detail(products.findById(id).orElseThrow(AdminProductService::productNotFound));
	}

	@Transactional
	public ProductAdminDetail create(Long categoryId, String requestedSlug, Product.Details details, UUID actorId) {
		Category category = category(categoryId);
		Product product = products.save(new Product(category, slugFor(requestedSlug, details.name(), null), details));
		audit.record(actorId, "PRODUCT_CREATED", "PRODUCT", product.getId(), null, AuditView.of(product));
		return detail(product);
	}

	@Transactional
	public ProductAdminDetail update(long id, Long categoryId, String requestedSlug, Product.Details details,
			UUID actorId) {
		Product product = products.lockById(id).orElseThrow(AdminProductService::productNotFound);
		if (details.price() != product.getPrice()) {
			// A running or upcoming sale price must stay below the regular price
			promotions.checkNewRegularPrice(id, details.price());
		}
		AuditView before = AuditView.of(product);
		product.update(category(categoryId), slugFor(requestedSlug, details.name(), id), details);
		audit.record(actorId, "PRODUCT_UPDATED", "PRODUCT", id, before, AuditView.of(product));
		return detail(product);
	}

	/** Hide/show. Products are never hard-deleted: orders and carts keep referring to them. */
	@Transactional
	public ProductAdminDetail setActive(long id, boolean active, UUID actorId) {
		Product product = products.findById(id).orElseThrow(AdminProductService::productNotFound);
		if (product.isActive() != active) {
			product.setActive(active);
			audit.record(actorId, active ? "PRODUCT_SHOWN" : "PRODUCT_HIDDEN", "PRODUCT", id, Map.of("active", !active),
					Map.of("active", active));
		}
		return detail(product);
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
				audit.record(actorId, "PRODUCT_IMAGE_ADDED", "PRODUCT", id, null,
						Map.of("publicId", stored.publicId(), "primary", image.isPrimary()));
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
		audit.record(actorId, "PRODUCT_IMAGE_DELETED", "PRODUCT", id, Map.of("publicId", image.getPublicId()), null);
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
		audit.record(actorId, "PRODUCT_IMAGE_PRIMARY", "PRODUCT", id, null, Map.of("publicId", fresh.getPublicId()));
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
		audit.record(actorId, "CATEGORY_CREATED", "CATEGORY", category.getId(), null,
				Map.of("name", category.getName(), "slug", slug));
		return new CategoryRow(category.getId(), category.getName(), category.getSlug(), 0);
	}

	@Transactional
	public CategoryRow renameCategory(long id, String name, String requestedSlug, UUID actorId) {
		Category category = categories.findById(id)
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "CATEGORY_NOT_FOUND", "Không tìm thấy danh mục"));
		Map<String, String> before = Map.of("name", category.getName(), "slug", category.getSlug());
		category.rename(name.trim(), categorySlug(requestedSlug, name, id));
		audit.record(actorId, "CATEGORY_UPDATED", "CATEGORY", id, before,
				Map.of("name", category.getName(), "slug", category.getSlug()));
		return new CategoryRow(id, category.getName(), category.getSlug(), products.countByCategoryId(id));
	}

	// ---- helpers ----------------------------------------------------------------------------------------------

	private ProductAdminDetail detail(Product p) {
		return new ProductAdminDetail(p.getId(), p.getName(), p.getSlug(), p.getCategory().getId(), p.getDescription(),
				p.getOrigin(), p.getPrice(), p.getWeightGrams(), p.getCalories(), p.getProtein(), p.getFat(),
				p.getCarbs(), p.getFiber(), p.getLowStockThreshold(), p.isActive(), p.getOnHand(), p.getReserved(),
				p.availableQuantity(),
				images.findByProductIdOrderByPrimaryDescPositionAsc(p.getId()).stream().map(ImageRow::from).toList());
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
			if (products.findBySlug(slug).filter(p -> !p.getId().equals(selfId)).isPresent()) {
				throw new ApiException(HttpStatus.CONFLICT, "SLUG_EXISTS", "Đường dẫn (slug) đã được dùng cho sản phẩm khác");
			}
			return slug;
		}
		String base = Slugs.from(name).isEmpty() ? "san-pham" : Slugs.from(name);
		String slug = base;
		for (int n = 2; products.findBySlug(slug).filter(p -> !p.getId().equals(selfId)).isPresent(); n++) {
			slug = base + "-" + n;
		}
		return slug;
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

	private static ApiException productNotFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm");
	}

	private static ApiException imageNotFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "IMAGE_NOT_FOUND", "Không tìm thấy ảnh");
	}
}
