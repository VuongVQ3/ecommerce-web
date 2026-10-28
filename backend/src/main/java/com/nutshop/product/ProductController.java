package com.nutshop.product;

import com.nutshop.common.PageResponse;
import com.nutshop.product.ProductDtos.CategoryListing;
import com.nutshop.product.ProductDtos.ProductDetail;
import com.nutshop.product.ProductDtos.ProductSuggestion;
import com.nutshop.product.ProductDtos.ProductSummary;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api")
public class ProductController {

	private final ProductService productService;

	public ProductController(ProductService productService) {
		this.productService = productService;
	}

	/** Categories with something on sale, each with its productCount. */
	@GetMapping("/categories")
	public List<CategoryListing> categories() {
		return productService.listCategories();
	}

	/** Header search suggestions: every product on sale, compact; the browser filters it as the user types. */
	@GetMapping("/products/suggestions")
	public List<ProductSuggestion> suggestions() {
		return productService.suggestionIndex();
	}

	@GetMapping("/categories/{slug}")
	public CategoryListing category(@PathVariable String slug) {
		return productService.category(slug);
	}

	@GetMapping("/products")
	public PageResponse<ProductSummary> products(@RequestParam(required = false) String category,
			@RequestParam(required = false) String q, @RequestParam(required = false) String sort,
			@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "12") int size) {
		return productService.search(category, q, sort, page, size);
	}

	@GetMapping("/products/{slug}")
	public ProductDetail product(@PathVariable String slug) {
		return productService.getBySlug(slug);
	}
}
