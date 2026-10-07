package com.nutshop.auth;

import com.nutshop.auth.AuthDtos.LoginRequest;
import com.nutshop.auth.AuthDtos.RegisterRequest;
import com.nutshop.auth.AuthDtos.UserResponse;
import com.nutshop.auth.GoogleTokenVerifier.GoogleUser;
import com.nutshop.auth.RefreshTokenService.Rotation;
import com.nutshop.common.ConflictException;
import com.nutshop.common.UnauthorizedException;
import com.nutshop.user.PhoneNumbers;
import com.nutshop.user.User;
import com.nutshop.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Instant;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

@Service
public class AuthService {

	public record AuthResult(UserResponse user, IssuedTokens tokens) {
	}

	static final String ACCOUNT_LOCKED = "Tài khoản đã bị khóa. Vui lòng liên hệ cửa hàng để được hỗ trợ.";
	public static final String EMAIL_EXISTS = "EMAIL_EXISTS";
	public static final String PHONE_EXISTS = "PHONE_EXISTS";

	private final UserRepository users;
	private final PasswordEncoder passwordEncoder;
	private final TokenService tokenService;
	private final RefreshTokenService refreshTokens;
	private final GoogleTokenVerifier googleVerifier;
	private final TurnstileVerifier turnstile;
	private final Clock clock;

	/**
	 * Compared against when the email is unknown, so a failed login always costs one BCrypt check and response
	 * time does not reveal whether an account exists.
	 */
	private final String dummyHash;

	public AuthService(UserRepository users, PasswordEncoder passwordEncoder, TokenService tokenService,
			RefreshTokenService refreshTokens, GoogleTokenVerifier googleVerifier, TurnstileVerifier turnstile,
			Clock clock) {
		this.users = users;
		this.passwordEncoder = passwordEncoder;
		this.tokenService = tokenService;
		this.refreshTokens = refreshTokens;
		this.googleVerifier = googleVerifier;
		this.turnstile = turnstile;
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
		Instant now = clock.instant();
		User user = new User(email, passwordEncoder.encode(req.password()), req.fullName().trim(), phone, now);
		user.setMarketingConsent(req.wantsMarketing(), now);
		return issue(users.save(user), client);
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
			.or(() -> users.findByEmail(email).map(existing -> {
				existing.linkGoogle(google.googleId());
				return existing;
			}))
			.orElseGet(() -> users
				.save(User.fromGoogle(email, displayName(google, email), google.googleId(), clock.instant())));
		ensureActive(user);
		return issue(user, client);
	}

	@Transactional(readOnly = true)
	public UserResponse currentUser(UUID userId) {
		return users.findById(userId)
			.filter(User::isActive)
			.map(UserResponse::from)
			.orElseThrow(() -> new UnauthorizedException(RefreshTokenService.INVALID_SESSION));
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
