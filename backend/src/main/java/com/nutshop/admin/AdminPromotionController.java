package com.nutshop.admin;

import com.nutshop.product.ProductPromotion.Status;
import com.nutshop.product.PromotionService;
import com.nutshop.product.PromotionService.BulkResult;
import com.nutshop.product.PromotionService.PromotionRow;
import com.nutshop.product.PromotionService.UsageResponse;
import com.nutshop.security.Roles;
import com.nutshop.user.Role;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Sale prices: ADMIN only (docs/pricing.md). Every change is audited. */
@RestController
@RequestMapping("/api/admin/promotions")
@Roles(Role.ADMIN)
public class AdminPromotionController {

	public record PromotionRequest(@NotNull(message = "Vui lòng chọn sản phẩm") Long productId,
			@NotNull(message = "Vui lòng nhập giá khuyến mại") @Min(value = 1000, message = "Giá khuyến mại tối thiểu 1.000₫") Long salePrice,
			@NotNull(message = "Vui lòng chọn ngày bắt đầu") Instant startsAt,
			@NotNull(message = "Vui lòng chọn ngày kết thúc") Instant endsAt) {
	}

	public record BulkRequest(
			@NotEmpty(message = "Vui lòng chọn ít nhất một sản phẩm") @Size(max = 200, message = "Tối đa 200 sản phẩm mỗi lần") List<@NotNull Long> productIds,
			@NotNull(message = "Vui lòng nhập mức giảm") @Min(value = 1, message = "Mức giảm tối thiểu 1%") @Max(value = 99, message = "Mức giảm tối đa 99%") Integer percentOff,
			@NotNull(message = "Vui lòng chọn ngày bắt đầu") Instant startsAt,
			@NotNull(message = "Vui lòng chọn ngày kết thúc") Instant endsAt) {
	}

	private final PromotionService promotions;

	public AdminPromotionController(PromotionService promotions) {
		this.promotions = promotions;
	}

	@GetMapping
	public List<PromotionRow> list(@RequestParam(required = false) Status status) {
		return promotions.list(status);
	}

	/** Products with their current price and promotion days used in the year (for the create form). */
	@GetMapping("/usage")
	public UsageResponse usage(@RequestParam(required = false) Integer year) {
		return promotions.usage(year);
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public PromotionRow create(@Valid @RequestBody PromotionRequest req, @AuthenticationPrincipal Jwt jwt) {
		return promotions.create(req.productId(), req.salePrice(), req.startsAt(), req.endsAt(), AdminController.userId(jwt));
	}

	@PutMapping("/{id}")
	public PromotionRow update(@PathVariable UUID id, @Valid @RequestBody PromotionRequest req,
			@AuthenticationPrincipal Jwt jwt) {
		return promotions.update(id, req.salePrice(), req.startsAt(), req.endsAt(), AdminController.userId(jwt));
	}

	/** Running: ends now. Upcoming: cancelled. */
	@PostMapping("/{id}/end")
	public PromotionRow end(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
		return promotions.end(id, AdminController.userId(jwt));
	}

	/** Same % off for several products; per-product results (one failure does not stop the others). */
	@PostMapping("/bulk")
	public List<BulkResult> bulk(@Valid @RequestBody BulkRequest req, @AuthenticationPrincipal Jwt jwt) {
		return promotions.createBulk(req.productIds(), req.percentOff(), req.startsAt(), req.endsAt(),
				AdminController.userId(jwt));
	}
}
