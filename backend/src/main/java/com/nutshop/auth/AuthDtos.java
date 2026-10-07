package com.nutshop.auth;

import com.nutshop.user.User;
import com.nutshop.user.VietnamesePhone;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public final class AuthDtos {

	/** At least one letter (any alphabet, incl. Vietnamese) and one digit. Keep in sync with the frontend. */
	static final String PASSWORD_PATTERN = "^(?=.*\\p{L})(?=.*\\d).+$";

	private AuthDtos() {
	}

	/**
	 * @param phone optional; accepts "0912 345 678", "0912.345.678", "+84912345678"... normalized before storing
	 * @param acceptTerms must be true (terms of use + privacy policy)
	 * @param marketingConsent optional opt-in for promotional emails, false when absent
	 * @param turnstileToken Cloudflare Turnstile token from the widget
	 * @param website honeypot: hidden from humans, so any value means a bot
	 */
	public record RegisterRequest(
			@NotBlank(message = "Vui lòng nhập họ tên")
			@Size(max = 100, message = "Họ tên tối đa 100 ký tự") String fullName,
			@NotBlank(message = "Vui lòng nhập email")
			@Email(message = "Email không hợp lệ")
			@Size(max = 255, message = "Email quá dài") String email,
			@NotBlank(message = "Vui lòng nhập mật khẩu")
			@Size(min = 8, max = 72, message = "Mật khẩu phải từ 8 đến 72 ký tự")
			@Pattern(regexp = PASSWORD_PATTERN, message = "Mật khẩu phải có cả chữ và số") String password,
			@VietnamesePhone String phone,
			@NotNull(message = TERMS_REQUIRED) @AssertTrue(message = TERMS_REQUIRED) Boolean acceptTerms,
			// Boxed on purpose: Jackson 3 rejects a missing JSON field for a primitive boolean
			Boolean marketingConsent,
			String turnstileToken,
			String website) {

		static final String TERMS_REQUIRED = "Bạn cần đồng ý với Điều khoản sử dụng và Chính sách bảo mật";

		boolean wantsMarketing() {
			return Boolean.TRUE.equals(marketingConsent);
		}

		boolean isHoneypotFilled() {
			return website != null && !website.isBlank();
		}
	}

	public record LoginRequest(
			@NotBlank(message = "Vui lòng nhập email") String email,
			@NotBlank(message = "Vui lòng nhập mật khẩu") String password) {
	}

	public record ForgotPasswordRequest(
			@NotBlank(message = "Vui lòng nhập email")
			@Email(message = "Email không hợp lệ")
			@Size(max = 255, message = "Email quá dài") String email) {
	}

	public record ResetPasswordRequest(
			@NotBlank(message = "Liên kết đặt lại mật khẩu không hợp lệ") String token,
			@NotBlank(message = "Vui lòng nhập mật khẩu mới")
			@Size(min = 8, max = 72, message = "Mật khẩu phải từ 8 đến 72 ký tự")
			@Pattern(regexp = PASSWORD_PATTERN, message = "Mật khẩu phải có cả chữ và số") String newPassword) {
	}

	/** A message to show to the user as-is. */
	public record MessageResponse(String message) {
	}

	public record GoogleLoginRequest(@NotBlank(message = "Thiếu thông tin đăng nhập Google") String credential) {
	}

	/** Which sign-in methods the frontend should offer. */
	public record ProvidersResponse(String googleClientId) {
	}

	/** Public view of a user. Never contains the password hash. */
	public record UserResponse(UUID id, String email, String fullName, String phone, String role) {

		public static UserResponse from(User u) {
			return new UserResponse(u.getId(), u.getEmail(), u.getFullName(), u.getPhone(), u.getRole().name());
		}
	}
}
