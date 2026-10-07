package com.nutshop.product;

import com.nutshop.cart.CartProperties;
import com.nutshop.common.NotFoundException;
import com.nutshop.common.PageResponse;
import com.nutshop.product.ProductDtos.CategoryResponse;
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

@Service
@Transactional(readOnly = true)
public class ProductService {

	private static final int MAX_PAGE_SIZE = 48;

	private final ProductRepository products;
	private final CategoryRepository categories;
	private final CartProperties cartProps;

	public ProductService(ProductRepository products, CategoryRepository categories, CartProperties cartProps) {
		this.products = products;
		this.categories = categories;
		this.cartProps = cartProps;
	}

	public List<CategoryResponse> listCategories() {
		return categories.findAll(Sort.by("id")).stream().map(CategoryResponse::from).toList();
	}

	/** Catalogue listing: discontinued products are hidden (their pages stay reachable by slug). */
	public PageResponse<ProductSummary> search(String category, String q, String sort, int page, int size) {
		var pageable = PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, MAX_PAGE_SIZE), toSort(sort));
		List<Specification<Product>> filters = new ArrayList<>();
		filters.add(ProductSpecs.active());
		if (StringUtils.hasText(category)) {
			filters.add(ProductSpecs.inCategory(category));
		}
		if (StringUtils.hasText(q)) {
			filters.add(ProductSpecs.nameContains(q));
		}
		var result = products.findAll(Specification.allOf(filters), pageable);
		return PageResponse.from(result.map(p -> ProductSummary.from(p, cartProps.maxQtyPerItem())));
	}

	public ProductDetail getBySlug(String slug) {
		return products.findBySlug(slug)
			.map(p -> ProductDetail.from(p, cartProps.maxQtyPerItem()))
			.orElseThrow(() -> new NotFoundException("Không tìm thấy sản phẩm"));
	}

	private static Sort toSort(String sort) {
		return switch (sort == null ? "" : sort) {
			case "price_asc" -> Sort.by("price").ascending();
			case "price_desc" -> Sort.by("price").descending();
			case "calories_asc" -> Sort.by("calories").ascending();
			case "protein_desc" -> Sort.by("protein").descending();
			default -> Sort.by("id").ascending();
		};
	}
}
