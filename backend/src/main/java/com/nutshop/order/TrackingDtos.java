package com.nutshop.order;

import com.nutshop.user.PersonName;
import com.nutshop.auth.AuthDtos;
import com.nutshop.order.OrderDtos.OrderItemResponse;
import com.nutshop.order.OrderDtos.StatusChange;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;

/** Guest tracking page (/don-hang/{code}?t=…) and attaching guest orders to an account. */
public final class TrackingDtos {

	private TrackingDtos() {
	}

	/**
	 * What the holder of a tracking link sees. The phone and email are partly hidden (a link can be forwarded); the
	 * address is shown in full so the buyer can check where the parcel goes.
	 *
	 * @param canCancel the buyer may still cancel (PENDING)
	 * @param canClaim not attached to an account yet: the page offers to create one
	 * @param hasEmail false = the "create account" form must ask for an email
	 */
	public record TrackedOrder(String code, String status, String statusLabel, Instant createdAt, String customerName,
			String maskedPhone, String maskedEmail, boolean hasEmail, String province, String ward, String addressLine,
			String paymentMethod, List<OrderItemResponse> items, long subtotal, long shippingFee, long total,
			String carrier, String trackingNumber, List<StatusChange> history, boolean canCancel, boolean canClaim,
			String cancelReasonCode, String cancelReasonLabel, String cancelReason, String cancelledByType) {
	}

	/** Same password rules as registration; name, email and phone come from the order. */
	public record ClaimAccountRequest(
			@NotBlank(message = "Vui lòng nhập mật khẩu")
			@Size(min = 8, max = 72, message = "Mật khẩu phải từ 8 đến 72 ký tự")
			@Pattern(regexp = AuthDtos.PASSWORD_PATTERN, message = "Mật khẩu phải có cả chữ và số") String password,
			@NotNull(message = TERMS_REQUIRED) @AssertTrue(message = TERMS_REQUIRED) Boolean acceptTerms,
			/** Only used when the order has no email. */
			@Email(message = "Email không hợp lệ") @Size(max = 255, message = "Email quá dài") String email,
			/** Optional: the account's name when it should differ from the name on the order. */
			@PersonName String fullName,
			/** Optional Cloudflare Turnstile token; verified server-side when present (run-2 leads 11/12). */
			@Size(max = 4096) String turnstileToken) {

		static final String TERMS_REQUIRED = "Bạn cần đồng ý với Điều khoản sử dụng và Chính sách bảo mật";
	}

	/** Guest lookup: no validation messages, any problem gives the same 404. */
	public record LookupRequest(String code, String phone) {
	}

	/** A short-lived tracking link (code + token) for the guest who proved code + phone. */
	public record LookupResult(String code, String token) {
	}

	/** One entry of the browser's "recent orders" list. */
	public record ClaimItem(@NotBlank @Size(max = 30) String code, @NotBlank @Size(max = 100) String token) {
	}

	public record ClaimResult(List<String> claimed, List<String> skipped) {
	}
}
