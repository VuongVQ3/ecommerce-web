package com.nutshop.product;

import com.nutshop.cart.CartProperties;
import com.nutshop.common.NotFoundException;
import com.nutshop.common.PageResponse;
import com.nutshop.product.ProductDtos.CategoryListing;
import com.nutshop.product.ProductDtos.ProductDetail;
import com.nutshop.product.ProductDtos.ProductSummary;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Service
@Transactional(readOnly = true)
public class ProductService {

	private static final int MAX_PAGE_SIZE = 48;

	private final ProductRepository products;
	private final CategoryRepository categories;
	private final CartProperties cartProps;
	private final ProductImageRepository images;
	private final PricingService pricing;
	private final ProductSlugHistory slugHistory;

	public ProductService(ProductRepository products, CategoryRepository categories, CartProperties cartProps,
			ProductImageRepository images, PricingService pricing, ProductSlugHistory slugHistory) {
		this.slugHistory = slugHistory;
		this.products = products;
		this.categories = categories;
		this.cartProps = cartProps;
		this.images = images;
		this.pricing = pricing;
	}

	/** Only categories with something on sale (an emptied category disappears from menus and filters). */
	public List<CategoryListing> listCategories() {
		return categories.findWithProductsOnSale().stream().map(row -> {
			Category c = (Category) row[0];
			return new CategoryListing(c.getId(), c.getName(), c.getSlug(), (Long) row[1]);
		}).toList();
	}

	/** Any category by slug, also one with nothing on sale (productCount 0): its page says so instead of a 404. */
	public CategoryListing category(String slug) {
		Category c = categories.findBySlug(slug).orElseThrow(() -> new NotFoundException("Không tìm thấy danh mục"));
		return new CategoryListing(c.getId(), c.getName(), c.getSlug(), categories.countOnSale(c.getId()));
	}

	/** Catalogue listing: discontinued products are hidden (their pages stay reachable by slug). */
	public PageResponse<ProductSummary> search(String category, String q, String sort, int page, int size) {
		boolean byPrice = "price_asc".equals(sort) || "price_desc".equals(sort);
		boolean byNutrition = "calories_asc".equals(sort) || "protein_desc".equals(sort);
		// Price sorts use the current (possibly discounted) price, nutrition sorts put products without figures last:
		// both are ordered inside the query
		var pageable = PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, MAX_PAGE_SIZE),
				byPrice || byNutrition ? Sort.unsorted() : Sort.by("sortOrder", "id"));
		List<Specification<Product>> filters = new ArrayList<>();
		if (byPrice) {
			filters.add(ProductSpecs.orderByCurrentPrice("price_asc".equals(sort), pricing.now()));
		}
		if (byNutrition) {
			filters.add("calories_asc".equals(sort) ? ProductSpecs.orderByNutrient("calories", true)
					: ProductSpecs.orderByNutrient("protein", false));
		}
		filters.add(ProductSpecs.active());
		if (StringUtils.hasText(category)) {
			filters.add(ProductSpecs.inCategory(category));
		}
		if (StringUtils.hasText(q)) {
			filters.add(ProductSpecs.nameContains(q));
		}
		var result = products.findAll(Specification.allOf(filters), pageable);
		var prices = pricing.pricesOf(result.getContent());
		return PageResponse
			.from(result.map(p -> ProductSummary.from(p, cartProps.maxQtyPerItem(), prices.get(p.getId()))));
	}

	/** Hidden products are not found on the storefront (orders and carts keep their own snapshot). */
	public ProductDetail getBySlug(String slug) {
		Optional<Product> current = products.findBySlug(slug);
		if (current.isPresent()) {
			return current.filter(Product::isActive).map(this::detail).orElseThrow(ProductService::notFound);
		}
		// An old slug: same product, with redirectTo so the page can replace its URL
		return activeByOldSlug(slug).map(p -> detail(p).redirectedFrom()).orElseThrow(ProductService::notFound);
	}

	/** The active product that used to have {@code slug} (and no longer does). */
	public Optional<Product> activeByOldSlug(String slug) {
		return slugHistory.productFor(slug)
			.flatMap(products::findById)
			.filter(Product::isActive)
			.filter(p -> !p.getSlug().equals(slug));
	}

	private ProductDetail detail(Product p) {
		return ProductDetail.from(p, cartProps.maxQtyPerItem(), images.findByProductIdOrderByPrimaryDescPositionAsc(p.getId()),
				pricing.priceOf(p));
	}

	private static NotFoundException notFound() {
		return new NotFoundException("Không tìm thấy sản phẩm");
	}

}
