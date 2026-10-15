package com.nutshop.order;

import com.nutshop.user.PersonName;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.nutshop.user.VietnamesePhone;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;

/**
 * Order requests carry product ids, quantities and delivery details only. Any price or total a client sends is
 * ignored (unknown JSON fields are dropped); the server prices everything from the products table.
 */
public final class OrderDtos {

	private OrderDtos() {
	}

	public record LineRequest(
			@NotNull(message = "Thiếu mã sản phẩm") Long productId,
			@NotNull(message = "Vui lòng chọn số lượng")
			@Min(value = 1, message = "Số lượng phải lớn hơn 0")
			@Max(value = 99, message = "Số lượng quá lớn") Integer quantity) {
	}

	/**
	 * @param provinceCode / wardCode codes from vn-admin-units.json (2025 structure: province → ward)
	 * @param idempotencyKey generated once per checkout visit; resubmitting returns the same order
	 */
	public record PlaceOrderRequest(
			@NotNull(message = "Giỏ hàng đang trống")
			@Size(min = 1, max = 50, message = "Đơn hàng phải có từ 1 đến 50 sản phẩm") List<@Valid LineRequest> items,
			@NotBlank(message = "Vui lòng nhập họ tên") @PersonName String customerName,
			@NotBlank(message = "Vui lòng nhập số điện thoại") @VietnamesePhone String phone,
			@Email(message = "Email không hợp lệ") @Size(max = 255, message = "Email quá dài") String email,
			@NotNull(message = "Vui lòng chọn tỉnh/thành phố") Integer provinceCode,
			@NotNull(message = "Vui lòng chọn phường/xã") Integer wardCode,
			@NotBlank(message = "Vui lòng nhập địa chỉ chi tiết")
			@Size(max = 255, message = "Địa chỉ tối đa 255 ký tự") String addressLine,
			@Size(max = 500, message = "Ghi chú tối đa 500 ký tự") String note,
			@NotBlank(message = "Thiếu mã chống gửi trùng")
			@Size(min = 8, max = 100, message = "Mã chống gửi trùng không hợp lệ") String idempotencyKey) {
	}

	/** @param regularUnitPrice the regular price at purchase time (higher than unitPrice when discounted) */
	public record OrderItemResponse(Long productId, String productName, long unitPrice, long regularUnitPrice,
			int weightGrams, int quantity, long lineTotal) {

		static OrderItemResponse from(OrderItem i) {
			return new OrderItemResponse(i.getProductId(), i.getProductName(), i.getUnitPrice(),
					i.getRegularUnitPrice(), i.getWeightGrams(), i.getQuantity(), i.getLineTotal());
		}
	}

	public record StatusChange(String status, String label, Instant at, String reason) {
	}

	/**
	 * What a customer sends to cancel their own order (signed in or with a tracking link). Checked by
	 * OrderService#cancelByCustomer so that a wrong or missing code gives INVALID_CANCEL_REASON.
	 *
	 * @param reasonCode one of the customer reasons (CancelReason#forCustomer)
	 * @param reason optional note, up to 300 characters; required with OTHER
	 */
	public record CustomerCancelRequest(String reasonCode, String reason) {
	}

	/**
	 * @param canCancel true while the customer may still cancel it themselves (PENDING)
	 * @param cancelReasonCode / cancelReasonLabel / cancelReason / cancelledByType set once CANCELLED
	 * @param accessToken guest orders, only in the response that placed the order: the secret of the tracking link
	 * @param trackingUrl guest orders, only in that response: {@code SITE_URL/don-hang/{code}?t={accessToken}}
	 */
	public record OrderResponse(String code, String status, String statusLabel, boolean canCancel, Instant createdAt,
			String customerName, String phone, String email, String province, String ward, String addressLine,
			String note, String paymentMethod, List<OrderItemResponse> items, long subtotal, long shippingFee,
			long total, List<StatusChange> history, String cancelReasonCode, String cancelReasonLabel,
			String cancelReason, String cancelledByType, @JsonInclude(JsonInclude.Include.NON_NULL) String accessToken,
			@JsonInclude(JsonInclude.Include.NON_NULL) String trackingUrl) {

		OrderResponse withTracking(String token, String url) {
			return new OrderResponse(code, status, statusLabel, canCancel, createdAt, customerName, phone, email,
					province, ward, addressLine, note, paymentMethod, items, subtotal, shippingFee, total, history,
					cancelReasonCode, cancelReasonLabel, cancelReason, cancelledByType, token, url);
		}
	}

	public record OrderSummary(String code, String status, String statusLabel, Instant createdAt, int itemCount,
			String firstItemName, long total) {

		static OrderSummary from(Order o) {
			int count = o.getItems().stream().mapToInt(OrderItem::getQuantity).sum();
			String first = o.getItems().isEmpty() ? null : o.getItems().getFirst().getProductName();
			return new OrderSummary(o.getCode(), o.getStatus().name(), o.getStatus().label(), o.getCreatedAt(), count,
					first, o.getTotal());
		}
	}

	/** One line that could not be reserved; part of the 409 OUT_OF_STOCK response ("items"). */
	public record Shortage(Long productId, String name, int requested, int available) {
	}
}
