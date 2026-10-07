package com.nutshop.auth;

import com.nutshop.auth.AuthDtos.ForgotPasswordRequest;
import com.nutshop.auth.AuthDtos.GoogleLoginRequest;
import com.nutshop.auth.AuthDtos.LoginRequest;
import com.nutshop.auth.AuthDtos.MessageResponse;
import com.nutshop.auth.AuthDtos.ProvidersResponse;
import com.nutshop.auth.AuthDtos.RegisterRequest;
import com.nutshop.auth.AuthDtos.ResetPasswordRequest;
import com.nutshop.auth.AuthDtos.UserResponse;
import com.nutshop.auth.AuthService.AuthResult;
import com.nutshop.common.UnauthorizedException;
import com.nutshop.user.Role;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.Locale;
import java.util.UUID;

/**
 * Tokens travel only in httpOnly cookies (see {@link AuthCookies}); response bodies carry the user, never a token.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

	private static final Logger log = LoggerFactory.getLogger(AuthController.class);

	static final String FORGOT_PASSWORD_MESSAGE = "Nếu email này đã đăng ký tài khoản, chúng tôi đã gửi liên kết đặt lại "
			+ "mật khẩu. Vui lòng kiểm tra hộp thư (kể cả mục Spam). Liên kết có hiệu lực trong 30 phút.";

	private final AuthService authService;
	private final PasswordResetService passwordReset;
	private final AuthCookies cookies;
	private final GoogleTokenVerifier googleVerifier;

	public AuthController(AuthService authService, PasswordResetService passwordReset, AuthCookies cookies,
			GoogleTokenVerifier googleVerifier) {
		this.authService = authService;
		this.passwordReset = passwordReset;
		this.cookies = cookies;
		this.googleVerifier = googleVerifier;
	}

	/**
	 * A filled honeypot gets a normal-looking 201 so the bot believes it succeeded, but nothing is created, no cookie
	 * is set and Turnstile is not even called.
	 */
	@PostMapping("/register")
	@ResponseStatus(HttpStatus.CREATED)
	public UserResponse register(@Valid @RequestBody RegisterRequest req, HttpServletRequest request,
			HttpServletResponse response) {
		if (req.isHoneypotFilled()) {
			log.info("Registration honeypot triggered from {}", request.getRemoteAddr());
			return new UserResponse(UUID.randomUUID(), req.email().trim().toLowerCase(Locale.ROOT), req.fullName().trim(),
					null, Role.CUSTOMER.name());
		}
		return complete(authService.register(req, ClientInfo.from(request)), response);
	}

	@PostMapping("/login")
	public UserResponse login(@Valid @RequestBody LoginRequest req, HttpServletRequest request,
			HttpServletResponse response) {
		return complete(authService.login(req, ClientInfo.from(request)), response);
	}

	@PostMapping("/google")
	public UserResponse google(@Valid @RequestBody GoogleLoginRequest req, HttpServletRequest request,
			HttpServletResponse response) {
		return complete(authService.loginWithGoogle(req.credential(), ClientInfo.from(request)), response);
	}

	/** Rotates the refresh token. Any failure clears both cookies so the client starts over cleanly. */
	@PostMapping("/refresh")
	public ResponseEntity<?> refresh(@CookieValue(name = AuthCookies.REFRESH_COOKIE, required = false) String token,
			HttpServletRequest request, HttpServletResponse response) {
		try {
			if (token == null || token.isBlank()) {
				throw new UnauthorizedException(RefreshTokenService.INVALID_SESSION);
			}
			return ResponseEntity.ok(complete(authService.refresh(token, ClientInfo.from(request)), response));
		}
		catch (UnauthorizedException ex) {
			cookies.clear(response);
			return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
				.body(ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, ex.getMessage()));
		}
	}

	@PostMapping("/logout")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void logout(@CookieValue(name = AuthCookies.REFRESH_COOKIE, required = false) String token,
			HttpServletResponse response) {
		authService.logout(token);
		cookies.clear(response);
	}

	/** Same response whether or not the email has an account, so it cannot be used to discover accounts. */
	@PostMapping("/forgot-password")
	@ResponseStatus(HttpStatus.ACCEPTED)
	public MessageResponse forgotPassword(@Valid @RequestBody ForgotPasswordRequest req) {
		passwordReset.requestReset(req.email());
		return new MessageResponse(FORGOT_PASSWORD_MESSAGE);
	}

	/** Also clears this browser's cookies: every session of the account has just been revoked. */
	@PostMapping("/reset-password")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void resetPassword(@Valid @RequestBody ResetPasswordRequest req, HttpServletResponse response) {
		passwordReset.resetPassword(req.token(), req.newPassword());
		cookies.clear(response);
	}

	@GetMapping("/me")
	public UserResponse me(@AuthenticationPrincipal Jwt jwt) {
		return authService.currentUser(UUID.fromString(jwt.getSubject()));
	}

	@GetMapping("/providers")
	public ProvidersResponse providers() {
		return new ProvidersResponse(googleVerifier.clientId());
	}

	private UserResponse complete(AuthResult result, HttpServletResponse response) {
		cookies.write(response, result.tokens());
		return result.user();
	}
}
