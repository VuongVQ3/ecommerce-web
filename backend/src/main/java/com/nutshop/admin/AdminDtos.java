package com.nutshop.admin;

import com.nutshop.order.AdminOrderService.ContactResult;
import com.nutshop.order.CancelReason;
import com.nutshop.order.PhoneFlag;
import com.nutshop.product.Product;
import com.nutshop.product.ShortDescription;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

/** Request bodies of the back office. */
public final class AdminDtos {

	private AdminDtos() {
	}

	public record ShipRequest(@NotBlank(message = "Vui lòng nhập đơn vị vận chuyển") @Size(max = 100) String carrier,
			@NotBlank(message = "Vui lòng nhập mã vận đơn") @Size(max = 100) String trackingNumber) {
	}

	public record CancelRequest(@NotNull(message = "Vui lòng chọn lý do huỷ đơn") CancelReason reasonCode,
			@NotBlank(message = "Vui lòng nhập lý do huỷ đơn") @Size(max = 500, message = "Lý do tối đa 500 ký tự") String reason) {
	}

	public record ConfirmRequest(@NotNull(message = "Vui lòng chọn kết quả liên hệ") ContactResult contact,
			@Size(max = 500, message = "Ghi chú tối đa 500 ký tự") String note) {
	}

	public record PhoneFlagRequest(@NotNull(message = "Vui lòng chọn mức đánh dấu") PhoneFlag.Level level,
			@NotBlank(message = "Vui lòng nhập lý do") @Size(max = 500, message = "Lý do tối đa 500 ký tự") String reason) {
	}

	public record ReasonRequest(
			@NotBlank(message = "Vui lòng nhập lý do") @Size(max = 500, message = "Lý do tối đa 500 ký tự") String reason) {
	}

	public record NoteRequest(
			@NotBlank(message = "Vui lòng nhập ghi chú") @Size(max = 1000, message = "Ghi chú tối đa 1000 ký tự") String body) {
	}

	public record ImportRequest(
			@NotNull(message = "Vui lòng nhập số lượng") @Min(value = 1, message = "Số lượng phải lớn hơn 0") @Max(value = 100000, message = "Số lượng quá lớn") Integer quantity,
			@Min(value = 0, message = "Giá nhập không được âm") @Max(value = 1_000_000_000L, message = "Giá nhập quá lớn") Long unitCost,
			@Size(max = 200, message = "Tên nhà cung cấp tối đa 200 ký tự") String supplier,
			@Size(max = 500, message = "Ghi chú tối đa 500 ký tự") String note) {
	}

	public record StocktakeRequest(
			@NotNull(message = "Vui lòng nhập số đếm thực tế") @Min(value = 0, message = "Số đếm không được âm") @Max(value = 1_000_000, message = "Số đếm quá lớn") Integer counted,
			@NotBlank(message = "Vui lòng nhập lý do điều chỉnh") @Size(max = 500, message = "Lý do tối đa 500 ký tự") String reason) {
	}

	public record ActiveRequest(@NotNull Boolean active) {
	}

	public record CategoryRequest(
			@NotBlank(message = "Vui lòng nhập tên danh mục") @Size(max = 100, message = "Tên tối đa 100 ký tự") String name,
			@Size(max = 100, message = "Slug tối đa 100 ký tự") String slug) {
	}

	public record ProductRequest(
			@NotBlank(message = "Vui lòng nhập tên sản phẩm") @Size(max = 200, message = "Tên tối đa 200 ký tự") String name,
			@Size(max = 200, message = "Slug tối đa 200 ký tự") String slug,
			@NotNull(message = "Vui lòng chọn danh mục") Long categoryId,
			// Trimmed (blank = none) before it is validated, see the compact constructor
			@Size(max = ShortDescription.MAX, message = "Mô tả ngắn tối đa 160 ký tự") String shortDescription,
			@NotBlank(message = "Vui lòng nhập mô tả") @Size(max = 2000, message = "Mô tả tối đa 2000 ký tự") String description,
			@Size(max = 100, message = "Xuất xứ tối đa 100 ký tự") String origin,
			// Optional while the product is hidden (being prepared); required to show it
			@Min(value = 1000, message = "Giá tối thiểu 1.000₫") @Max(value = 100_000_000L, message = "Giá quá lớn") Long price,
			@NotNull(message = "Vui lòng nhập khối lượng") @Min(value = 1, message = "Khối lượng phải lớn hơn 0") @Max(value = 100_000, message = "Khối lượng quá lớn") Integer weightGrams,
			// Nutrition per 100g: optional, but all five or none (checked by AdminProductService); whole numbers above 0.
			// The columns keep decimals: older figures may still have some (shown rounded on the storefront).
			@Digits(integer = 4, fraction = 0, message = "Năng lượng: chỉ nhập số nguyên, không có phần lẻ")
			@DecimalMin(value = "1", message = "Năng lượng phải lớn hơn 0") @DecimalMax(value = "1000", message = "Giá trị quá lớn") BigDecimal calories,
			@Digits(integer = 4, fraction = 0, message = "Chất đạm: chỉ nhập số nguyên, không có phần lẻ")
			@DecimalMin(value = "1", message = "Chất đạm phải lớn hơn 0") @DecimalMax(value = "100", message = "Tối đa 100g") BigDecimal protein,
			@Digits(integer = 4, fraction = 0, message = "Chất béo: chỉ nhập số nguyên, không có phần lẻ")
			@DecimalMin(value = "1", message = "Chất béo phải lớn hơn 0") @DecimalMax(value = "100", message = "Tối đa 100g") BigDecimal fat,
			@Digits(integer = 4, fraction = 0, message = "Chất bột đường: chỉ nhập số nguyên, không có phần lẻ")
			@DecimalMin(value = "1", message = "Chất bột đường phải lớn hơn 0") @DecimalMax(value = "100", message = "Tối đa 100g") BigDecimal carbs,
			@Digits(integer = 4, fraction = 0, message = "Chất xơ: chỉ nhập số nguyên, không có phần lẻ")
			@DecimalMin(value = "1", message = "Chất xơ phải lớn hơn 0") @DecimalMax(value = "100", message = "Tối đa 100g") BigDecimal fiber,
			@Min(value = 0, message = "Ngưỡng không được âm") @Max(value = 100_000, message = "Ngưỡng quá lớn") Integer lowStockThreshold,
			/** Storefront order (smaller first); null = after the others on create, unchanged on update */
			@Min(value = 0, message = "Thứ tự không được âm") @Max(value = 100_000, message = "Thứ tự quá lớn") Integer sortOrder) {

		public ProductRequest {
			shortDescription = blankToNull(shortDescription);
		}

		Product.Details details() {
			return new Product.Details(name.trim(), shortDescription, description.trim(), blankToNull(origin), price == null ? 0 : price,
					weightGrams, calories, protein, fat, carbs, fiber, lowStockThreshold == null ? 10 : lowStockThreshold,
					sortOrder);
		}

		private static String blankToNull(String s) {
			return s == null || s.isBlank() ? null : s.trim();
		}
	}
}
