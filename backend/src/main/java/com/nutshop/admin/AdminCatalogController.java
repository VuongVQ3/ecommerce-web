package com.nutshop.admin;

import com.nutshop.admin.AdminDtos.ActiveRequest;
import com.nutshop.admin.AdminDtos.CategoryRequest;
import com.nutshop.admin.AdminDtos.ProductRequest;
import com.nutshop.common.PageResponse;
import com.nutshop.product.AdminProductService;
import com.nutshop.product.AdminProductService.CategoryRow;
import com.nutshop.product.AdminProductService.ProductAdminDetail;
import com.nutshop.product.AdminProductService.ProductRow;
import com.nutshop.security.Roles;
import com.nutshop.user.Role;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

/** Products, prices, images and categories: ADMIN only. */
@RestController
@RequestMapping("/api/admin")
@Roles(Role.ADMIN)
public class AdminCatalogController {

	private final AdminProductService catalog;

	public AdminCatalogController(AdminProductService catalog) {
		this.catalog = catalog;
	}

	@GetMapping("/products")
	public PageResponse<ProductRow> products(@RequestParam(required = false) String q,
			@RequestParam(required = false) Boolean active, @RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "20") int size) {
		return catalog.list(q, active, page, size);
	}

	@GetMapping("/products/{id}")
	public ProductAdminDetail product(@PathVariable long id) {
		return catalog.get(id);
	}

	@PostMapping("/products")
	@ResponseStatus(HttpStatus.CREATED)
	public ProductAdminDetail create(@Valid @RequestBody ProductRequest req, @AuthenticationPrincipal Jwt jwt) {
		return catalog.create(req.categoryId(), req.slug(), req.details(), userId(jwt));
	}

	@PutMapping("/products/{id}")
	public ProductAdminDetail update(@PathVariable long id, @Valid @RequestBody ProductRequest req,
			@AuthenticationPrincipal Jwt jwt) {
		return catalog.update(id, req.categoryId(), req.slug(), req.details(), userId(jwt));
	}

	/** Hide or show on the storefront. There is no delete: orders keep pointing at products. */
	@PatchMapping("/products/{id}/active")
	public ProductAdminDetail setActive(@PathVariable long id, @Valid @RequestBody ActiveRequest req,
			@AuthenticationPrincipal Jwt jwt) {
		return catalog.setActive(id, req.active(), userId(jwt));
	}

	@PostMapping(path = "/products/{id}/images", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	@ResponseStatus(HttpStatus.CREATED)
	public ProductAdminDetail addImage(@PathVariable long id, @RequestPart("file") MultipartFile file,
			@AuthenticationPrincipal Jwt jwt) throws IOException {
		return catalog.addImage(id, file.getBytes(), userId(jwt));
	}

	@DeleteMapping("/products/{id}/images/{imageId}")
	public ProductAdminDetail deleteImage(@PathVariable long id, @PathVariable UUID imageId,
			@AuthenticationPrincipal Jwt jwt) {
		return catalog.deleteImage(id, imageId, userId(jwt));
	}

	@PostMapping("/products/{id}/images/{imageId}/primary")
	public ProductAdminDetail makePrimary(@PathVariable long id, @PathVariable UUID imageId,
			@AuthenticationPrincipal Jwt jwt) {
		return catalog.makePrimary(id, imageId, userId(jwt));
	}

	@GetMapping("/categories")
	@Roles({ Role.STAFF, Role.ADMIN }) // read-only, also used by staff screens
	public List<CategoryRow> categories() {
		return catalog.listCategories();
	}

	@PostMapping("/categories")
	@ResponseStatus(HttpStatus.CREATED)
	public CategoryRow createCategory(@Valid @RequestBody CategoryRequest req, @AuthenticationPrincipal Jwt jwt) {
		return catalog.createCategory(req.name(), req.slug(), userId(jwt));
	}

	@PutMapping("/categories/{id}")
	public CategoryRow renameCategory(@PathVariable long id, @Valid @RequestBody CategoryRequest req,
			@AuthenticationPrincipal Jwt jwt) {
		return catalog.renameCategory(id, req.name(), req.slug(), userId(jwt));
	}

	private static UUID userId(Jwt jwt) {
		return AdminController.userId(jwt);
	}
}
