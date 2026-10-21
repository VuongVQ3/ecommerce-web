package com.nutshop.auth;

import com.nutshop.auth.AuthDtos.LoginRequest;
import com.nutshop.auth.AuthDtos.RegisterRequest;
import com.nutshop.auth.AuthDtos.UserResponse;
import com.nutshop.auth.GoogleTokenVerifier.GoogleUser;
import com.nutshop.auth.RefreshTokenService.Rotation;
import com.nutshop.audit.AuditLog;
import com.nutshop.common.ConflictException;
import com.nutshop.common.UnauthorizedException;
import com.nutshop.user.PhoneNumbers;
import com.nutshop.common.ApiException;
import com.nutshop.user.Role;
import com.nutshop.user.User;
import com.nutshop.user.UserStatusCache;
import com.nutshop.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class AuthService {

	public record AuthResult(UserResponse user, IssuedTokens tokens) {
	}

	static final String ACCOUNT_LOCKED = "Tài khoản đã bị khóa. Vui lòng liên hệ cửa hàng để được hỗ trợ.";
	public static final String EMAIL_EXISTS = "EMAIL_EXISTS";
	public static final String PHONE_EXISTS = "PHONE_EXISTS";
	public static final String ACCOUNT_EXISTS = "ACCOUNT_EXISTS";

	private final UserRepository users;
	private final PasswordEncoder passwordEncoder;
	private final TokenService tokenService;
	private final RefreshTokenService refreshTokens;
	private final GoogleTokenVerifier googleVerifier;
	private final TurnstileVerifier turnstile;
	private final EmailVerificationService verification;
	private final UserStatusCache statuses;
	private final AuditLog audit;
	private final Clock clock;

	/**
	 * Compared against when the email is unknown, so a failed login always costs one BCrypt check and response
	 * time does not reveal whether an account exists.
	 */
	private final String dummyHash;

	public AuthService(UserRepository users, PasswordEncoder passwordEncoder, TokenService tokenService,
			RefreshTokenService refreshTokens, GoogleTokenVerifier googleVerifier, TurnstileVerifier turnstile,
			EmailVerificationService verification, UserStatusCache statuses, AuditLog audit, Clock clock) {
		this.users = users;
		this.passwordEncoder = passwordEncoder;
		this.tokenService = tokenService;
		this.refreshTokens = refreshTokens;
		this.googleVerifier = googleVerifier;
		this.turnstile = turnstile;
		this.verification = verification;
		this.statuses = statuses;
		this.audit = audit;
		this.clock = clock;
		this.dummyHash = passwordEncoder.encode(UUID.randomUUID().toString());
	}

	/** Callers must reject honeypot submissions before this (see AuthController). */
	@Transactional
	public AuthResult register(RegisterRequest req, ClientInfo client) {
		turnstile.verify(req.turnstileToken(), client.ip());
		String email = normalizeEmail(req.email());
		String phone = PhoneNumbers.normalize(req.phone());
		if (users.existsByEmail(email)) {
			throw new ConflictException(EMAIL_EXISTS, "Email này đã có tài khoản");
		}
		if (phone != null && users.existsByPhone(phone)) {
			throw new ConflictException(PHONE_EXISTS, "Số điện thoại này đã được sử dụng");
		}
		User user = new User(email, passwordEncoder.encode(req.password()), req.fullName().trim(), phone, clock.instant());
		user = users.saveAndFlush(user); // audit rows reference it through JDBC
		verification.sendLink(user);
		return issue(user, client);
	}

	/**
	 * Account created from a guest order's tracking page (OrderClaimService): name, email and phone come from the
	 * order, the buyer only chooses a password and accepts the terms. Same password hashing and consent records as
	 * {@link #register}. If the email or the phone already has an account → 409 ACCOUNT_EXISTS, nothing created.
	 */
	@Transactional
	public AuthResult createAccountForOrder(String rawEmail, String fullName, String phone, String password,
			ClientInfo client) {
		String email = normalizeEmail(rawEmail);
		if (users.existsByEmail(email) || (phone != null && users.existsByPhone(phone))) {
			throw new ConflictException(ACCOUNT_EXISTS, "Email hoặc số điện thoại này đã có tài khoản.");
		}
		User user = new User(email, passwordEncoder.encode(password), fullName.trim(), phone, clock.instant());
		user = users.saveAndFlush(user); // audit rows reference it through JDBC
		verification.sendLink(user);
		return issue(user, client);
	}

	@Transactional
	public AuthResult login(LoginRequest req, ClientInfo client) {
		Optional<User> found = users.findByEmail(normalizeEmail(req.email())).filter(User::hasPassword);
		String hash = found.map(User::getPasswordHash).orElse(dummyHash);
		boolean passwordMatches = passwordEncoder.matches(req.password(), hash);
		if (found.isEmpty() || !passwordMatches) {
			throw new BadCredentialsException("Invalid credentials");
		}
		User user = found.get();
		ensureActive(user);
		// Staff and admins with a password that no longer meets the rules: signed in, but the back office stays
		// closed until they change it (UserStatusFilter)
		if (user.getRole() != Role.CUSTOMER && !PasswordRules.meets(req.password()) && !user.isPasswordChangeRequired()) {
			user.requirePasswordChange();
			statuses.evict(user.getId());
		}
		return issue(user, client);
	}

	/**
	 * Not transactional on purpose: {@link RefreshTokenService#rotate} must commit its revocations on its own,
	 * even when it rejects the token.
	 */
	public AuthResult refresh(String rawRefreshToken, ClientInfo client) {
		Rotation rotation = refreshTokens.rotate(rawRefreshToken, client);
		User user = rotation.user();
		return new AuthResult(UserResponse.from(user),
				new IssuedTokens(tokenService.issueAccessToken(user), rotation.refreshToken()));
	}

	public void logout(String rawRefreshToken) {
		if (StringUtils.hasText(rawRefreshToken)) {
			refreshTokens.revoke(rawRefreshToken);
		}
	}

	/**
	 * Signs in with a Google ID token. Matches by Google account first, then links an existing account with the
	 * same (Google-verified) email, otherwise creates a new password-less account.
	 */
	@Transactional
	public AuthResult loginWithGoogle(String credential, ClientInfo client) {
		GoogleUser google = googleVerifier.verify(credential);
		String email = normalizeEmail(google.email());
		User user = users.findByGoogleId(google.googleId())
			.or(() -> users.findByEmail(email).map(existing -> linkGoogle(existing, google.googleId())))
			.orElseGet(() -> users
				.saveAndFlush(User.fromGoogle(email, displayName(google, email), google.googleId(), clock.instant())));
		ensureActive(user);
		// Google has verified this address (GoogleTokenVerifier requires email_verified)
		verification.markVerified(user, "GOOGLE");
		return issue(user, client);
	}

	/**
	 * Signed in: new password (same rules as registration). Every other session is signed out; this browser gets fresh
	 * cookies. The current password is required when the account has one.
	 */
	@Transactional
	public AuthResult changePassword(UUID userId, String currentPassword, String newPassword, ClientInfo client) {
		User user = users.findById(userId)
			.filter(User::isActive)
			.orElseThrow(() -> new UnauthorizedException(RefreshTokenService.INVALID_SESSION));
		if (user.hasPassword() && (currentPassword == null || !passwordEncoder.matches(currentPassword, user.getPasswordHash()))) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "WRONG_PASSWORD", "Mật khẩu hiện tại không đúng")
				.withProperty("errors", java.util.Map.of("currentPassword", "Mật khẩu hiện tại không đúng"));
		}
		if (user.hasPassword() && passwordEncoder.matches(newPassword, user.getPasswordHash())) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "SAME_PASSWORD", "Mật khẩu mới phải khác mật khẩu hiện tại")
				.withProperty("errors", java.util.Map.of("newPassword", "Mật khẩu mới phải khác mật khẩu hiện tại"));
		}
		user.changePassword(passwordEncoder.encode(newPassword));
		refreshTokens.revokeAll(userId);
		statuses.evict(userId);
		return issue(user, client);
	}

	@Transactional(readOnly = true)
	public UserResponse currentUser(UUID userId) {
		return users.findById(userId)
			.filter(User::isActive)
			.map(UserResponse::from)
			.orElseThrow(() -> new UnauthorizedException(RefreshTokenService.INVALID_SESSION));
	}

	/**
	 * An account with this email but no Google link yet. If its email was never verified, whoever registered it may
	 * have used someone else's address (e.g. to be signed in when the real owner arrives): the Google owner gets it
	 * without that person's password, phone or sessions.
	 */
	private User linkGoogle(User existing, String googleId) {
		ensureActive(existing);
		if (!existing.isEmailVerified()) {
			Map<String, Object> before = Map.of("passwordSet", existing.hasPassword(), "phoneSet", existing.getPhone() != null);
			existing.clearUnprovenDetails();
			refreshTokens.revokeAll(existing.getId());
			statuses.evict(existing.getId());
			audit.entry("USER_GOOGLE_TAKEOVER", "USER", existing.getId(),
					AuditLog.userLabel(existing.getFullName(), existing.getEmail()))
				.byCustomer(existing.getId())
				.changes(before, Map.of("passwordSet", false, "phoneSet", false))
				.record();
		}
		existing.linkGoogle(googleId);
		return existing;
	}

	private AuthResult issue(User user, ClientInfo client) {
		var tokens = new IssuedTokens(tokenService.issueAccessToken(user), refreshTokens.issue(user, client));
		return new AuthResult(UserResponse.from(user), tokens);
	}

	private static void ensureActive(User user) {
		if (!user.isActive()) {
			throw new ResponseStatusException(HttpStatus.FORBIDDEN, ACCOUNT_LOCKED);
		}
	}

	private static String normalizeEmail(String email) {
		return email.trim().toLowerCase(Locale.ROOT);
	}

	private static String displayName(GoogleUser google, String email) {
		String name = StringUtils.hasText(google.name()) ? google.name().trim() : email.substring(0, email.indexOf('@'));
		return name.length() > 100 ? name.substring(0, 100) : name;
	}
}
