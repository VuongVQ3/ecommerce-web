package com.nutshop.auth;

import com.nutshop.auth.AuthDtos.LoginRequest;
import com.nutshop.auth.AuthDtos.RegisterRequest;
import com.nutshop.auth.RefreshTokenService.Rotation;
import com.nutshop.common.ApiException;
import com.nutshop.common.ConflictException;
import com.nutshop.common.UnauthorizedException;
import com.nutshop.user.User;
import com.nutshop.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.willThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

	private static final ClientInfo CLIENT = new ClientInfo("JUnit", "127.0.0.1");
	private static final String DUMMY_HASH = "$2a$12$dummy";

	@Mock
	UserRepository users;

	@Mock
	PasswordEncoder passwordEncoder;

	@Mock
	TokenService tokenService;

	@Mock
	RefreshTokenService refreshTokens;

	@Mock
	GoogleTokenVerifier googleVerifier;

	@Mock
	TurnstileVerifier turnstile;

	AuthService service;

	@BeforeEach
	void setUp() {
		given(passwordEncoder.encode(anyString())).willReturn(DUMMY_HASH);
		service = new AuthService(users, passwordEncoder, tokenService, refreshTokens, googleVerifier, turnstile,
				Clock.fixed(NOW, ZoneOffset.UTC));
	}

	private static final Instant NOW = Instant.parse("2026-10-07T12:00:00Z");

	private static User user(String email, boolean active) {
		User user = new User(email, "$2a$12$real", "Khách", null, NOW);
		ReflectionTestUtils.setField(user, "id", UUID.randomUUID());
		user.setActive(active);
		return user;
	}

	private static RegisterRequest registration(String email, String phone, boolean marketing) {
		return new RegisterRequest("An", email, "matkhau123", phone, true, marketing, "token", null);
	}

	@Test
	void registerRejectsDuplicateEmailCaseInsensitivelyWithCode() {
		given(users.existsByEmail("an@example.com")).willReturn(true);

		assertThatThrownBy(() -> service.register(registration("  An@Example.COM ", null, false), CLIENT))
			.isInstanceOfSatisfying(ConflictException.class,
					ex -> assertThat(ex.getCode()).isEqualTo(AuthService.EMAIL_EXISTS));

		verify(users, never()).save(any());
		verifyNoInteractions(refreshTokens);
	}

	@Test
	void registerChecksDuplicatePhoneAfterNormalizing() {
		given(users.existsByPhone("0912345678")).willReturn(true);

		assertThatThrownBy(() -> service.register(registration("an@example.com", "+84 912.345.678", false), CLIENT))
			.isInstanceOfSatisfying(ConflictException.class,
					ex -> assertThat(ex.getCode()).isEqualTo(AuthService.PHONE_EXISTS));
		verify(users, never()).save(any());
	}

	@Test
	void registerVerifiesTurnstileBeforeTouchingTheDatabase() {
		willThrow(new ApiException(HttpStatus.BAD_REQUEST, TurnstileVerifier.FAILED_CODE, "x")).given(turnstile)
			.verify("token", "127.0.0.1");

		assertThatThrownBy(() -> service.register(registration("an@example.com", null, false), CLIENT))
			.isInstanceOf(ApiException.class);
		verifyNoInteractions(users);
	}

	@Test
	void registerRecordsConsentTimestamps() {
		given(users.save(any(User.class))).willAnswer(inv -> inv.getArgument(0));

		service.register(registration("an@example.com", "0912 345 678", true), CLIENT);

		verify(users).save(argThat(u -> NOW.equals(u.getTermsAcceptedAt()) && u.hasMarketingConsent()
				&& NOW.equals(u.getMarketingConsentAt()) && "0912345678".equals(u.getPhone())));
	}

	@Test
	void registerWithoutMarketingConsentLeavesItOff() {
		given(users.save(any(User.class))).willAnswer(inv -> inv.getArgument(0));

		service.register(registration("an@example.com", null, false), CLIENT);

		verify(users).save(argThat(u -> !u.hasMarketingConsent() && u.getMarketingConsentAt() == null));
	}

	@Test
	void loginWithWrongPasswordFailsWithoutIssuingTokens() {
		given(users.findByEmail("an@example.com")).willReturn(Optional.of(user("an@example.com", true)));
		given(passwordEncoder.matches("sai-mat-khau1", "$2a$12$real")).willReturn(false);

		assertThatThrownBy(() -> service.login(new LoginRequest("an@example.com", "sai-mat-khau1"), CLIENT))
			.isInstanceOf(BadCredentialsException.class);
		verifyNoInteractions(tokenService, refreshTokens);
	}

	@Test
	void loginWithUnknownEmailStillChecksAPasswordToHideTiming() {
		given(users.findByEmail("ghost@example.com")).willReturn(Optional.empty());

		assertThatThrownBy(() -> service.login(new LoginRequest("ghost@example.com", "matkhau123"), CLIENT))
			.isInstanceOf(BadCredentialsException.class);
		verify(passwordEncoder).matches("matkhau123", DUMMY_HASH);
	}

	@Test
	void loginToDeactivatedAccountIsForbiddenEvenWithCorrectPassword() {
		given(users.findByEmail("an@example.com")).willReturn(Optional.of(user("an@example.com", false)));
		given(passwordEncoder.matches("matkhau123", "$2a$12$real")).willReturn(true);

		assertThatThrownBy(() -> service.login(new LoginRequest("an@example.com", "matkhau123"), CLIENT))
			.isInstanceOfSatisfying(ResponseStatusException.class,
					ex -> assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN));
		verifyNoInteractions(refreshTokens);
	}

	@Test
	void loginSuccessIssuesBothTokens() {
		User user = user("an@example.com", true);
		given(users.findByEmail("an@example.com")).willReturn(Optional.of(user));
		given(passwordEncoder.matches("matkhau123", "$2a$12$real")).willReturn(true);
		given(tokenService.issueAccessToken(user)).willReturn("access");
		given(refreshTokens.issue(user, CLIENT)).willReturn("refresh");

		var result = service.login(new LoginRequest("AN@example.com", "matkhau123"), CLIENT);

		assertThat(result.tokens()).isEqualTo(new IssuedTokens("access", "refresh"));
		assertThat(result.user().email()).isEqualTo("an@example.com");
	}

	@Test
	void refreshWithReusedTokenPropagatesRejection() {
		given(refreshTokens.rotate(eq("reused"), any())).willThrow(new UnauthorizedException("revoked"));

		assertThatThrownBy(() -> service.refresh("reused", CLIENT)).isInstanceOf(UnauthorizedException.class);
		verifyNoInteractions(tokenService);
	}

	@Test
	void refreshIssuesNewAccessTokenForRotatedSession() {
		User user = user("an@example.com", true);
		given(refreshTokens.rotate("old", CLIENT)).willReturn(new Rotation(user, "new-refresh"));
		given(tokenService.issueAccessToken(user)).willReturn("new-access");

		var result = service.refresh("old", CLIENT);

		assertThat(result.tokens()).isEqualTo(new IssuedTokens("new-access", "new-refresh"));
	}
}
