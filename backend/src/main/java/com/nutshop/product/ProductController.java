package com.nutshop.product;

import com.nutshop.common.PageResponse;
import com.nutshop.product.ProductDtos.CategoryResponse;
import com.nutshop.product.ProductDtos.ProductDetail;
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

	@GetMapping("/categories")
	public List<CategoryResponse> categories() {
		return productService.listCategories();
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
