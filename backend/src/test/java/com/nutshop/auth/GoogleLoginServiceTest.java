package com.nutshop.auth;

import com.nutshop.audit.AuditLog;
import com.nutshop.auth.GoogleTokenVerifier.GoogleUser;
import com.nutshop.common.UnauthorizedException;
import com.nutshop.user.User;
import com.nutshop.user.UserRepository;
import com.nutshop.user.UserStatusCache;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Answers;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
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
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/** {@link AuthService#loginWithGoogle}: which account a verified Google token ends up in, with the verifier mocked. */
@ExtendWith(MockitoExtension.class)
class GoogleLoginServiceTest {

	private static final Instant NOW = Instant.parse("2026-10-21T08:00:00Z");
	private static final ClientInfo CLIENT = new ClientInfo("JUnit", "127.0.0.1");
	private static final String HASH = "$2a$12$someonesPassword";

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

	@Mock
	EmailVerificationService verification;

	@Mock
	UserStatusCache statuses;

	@Mock(answer = Answers.RETURNS_DEEP_STUBS)
	AuditLog audit;

	AuthService service;

	@BeforeEach
	void setUp() {
		given(passwordEncoder.encode(anyString())).willReturn("$2a$12$dummy");
		service = new AuthService(users, passwordEncoder, tokenService, refreshTokens, googleVerifier, turnstile,
				verification, statuses, audit, Clock.fixed(NOW, ZoneOffset.UTC));
	}

	private static User account(String email, String phone, boolean emailVerified) {
		User user = new User(email, HASH, "Người Đăng Ký", phone, NOW.minusSeconds(86_400));
		ReflectionTestUtils.setField(user, "id", UUID.randomUUID());
		if (emailVerified) {
			user.markEmailVerified(NOW.minusSeconds(3600));
		}
		return user;
	}

	private void googleSays(String googleId, String email, String name) {
		given(googleVerifier.verify("id-token")).willReturn(new GoogleUser(googleId, email, name));
	}

	@Test
	void anInvalidTokenIsRejectedBeforeAnyAccountIsLookedUp() {
		given(googleVerifier.verify("id-token")).willThrow(new UnauthorizedException(GoogleTokenVerifier.FAILED));

		assertThatThrownBy(() -> service.loginWithGoogle("id-token", CLIENT)).isInstanceOf(UnauthorizedException.class)
			.hasMessage(GoogleTokenVerifier.FAILED);
		verifyNoInteractions(users, refreshTokens, verification);
	}

	@Test
	void aNewGoogleUserGetsAVerifiedAccountWithoutPassword() {
		googleSays("g-new", "Mai@Gmail.com", "Trần Thị Mai");
		given(users.findByGoogleId("g-new")).willReturn(Optional.empty());
		given(users.findByEmail("mai@gmail.com")).willReturn(Optional.empty());
		given(users.saveAndFlush(any(User.class))).willAnswer(inv -> inv.getArgument(0));

		service.loginWithGoogle("id-token", CLIENT);

		ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
		verify(users).saveAndFlush(saved.capture());
		User user = saved.getValue();
		assertThat(user.getEmail()).isEqualTo("mai@gmail.com");
		assertThat(user.getFullName()).isEqualTo("Trần Thị Mai");
		assertThat(user.getGoogleId()).isEqualTo("g-new");
		assertThat(user.hasPassword()).isFalse();
		assertThat(user.getRole().name()).isEqualTo("CUSTOMER");
		assertThat(user.getTermsAcceptedAt()).isEqualTo(NOW);
		verify(verification).markVerified(user, "GOOGLE");
		verify(refreshTokens).issue(user, CLIENT);
	}

	@Test
	void aNewGoogleUserWithoutANameIsNamedAfterTheEmail() {
		googleSays("g-new", "binh.le@gmail.com", null);
		given(users.findByGoogleId("g-new")).willReturn(Optional.empty());
		given(users.findByEmail("binh.le@gmail.com")).willReturn(Optional.empty());
		given(users.saveAndFlush(any(User.class))).willAnswer(inv -> inv.getArgument(0));

		service.loginWithGoogle("id-token", CLIENT);

		ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
		verify(users).saveAndFlush(saved.capture());
		assertThat(saved.getValue().getFullName()).isEqualTo("binh.le");
	}

	@Test
	void anAccountAlreadyLinkedToThisGoogleAccountSignsInWithoutCreatingAnother() {
		User linked = account("mai@gmail.com", "0912345678", true);
		linked.linkGoogle("g-1");
		googleSays("g-1", "mai@gmail.com", "Mai");
		given(users.findByGoogleId("g-1")).willReturn(Optional.of(linked));

		service.loginWithGoogle("id-token", CLIENT);

		verify(users, never()).findByEmail(anyString());
		verify(users, never()).saveAndFlush(any());
		verify(refreshTokens).issue(linked, CLIENT);
		assertThat(linked.hasPassword()).isTrue();
	}

	@Test
	void aVerifiedAccountWithTheSameEmailIsLinkedAndKeepsItsPasswordAndPhone() {
		User owner = account("mai@gmail.com", "0912345678", true);
		googleSays("g-1", "mai@gmail.com", "Mai");
		given(users.findByGoogleId("g-1")).willReturn(Optional.empty());
		given(users.findByEmail("mai@gmail.com")).willReturn(Optional.of(owner));

		service.loginWithGoogle("id-token", CLIENT);

		assertThat(owner.getGoogleId()).isEqualTo("g-1");
		assertThat(owner.getPasswordHash()).isEqualTo(HASH);
		assertThat(owner.getPhone()).isEqualTo("0912345678");
		verify(refreshTokens, never()).revokeAll(any());
		verify(users, never()).saveAndFlush(any());
		verifyNoInteractions(audit);
		verify(refreshTokens).issue(owner, CLIENT);
	}

	@Test
	void anUnverifiedAccountWithTheSameEmailIsTakenOverClean() {
		// Someone registered with this address but never opened the verification email
		User squatter = account("mai@gmail.com", "0987654321", false);
		googleSays("g-1", "mai@gmail.com", "Mai");
		given(users.findByGoogleId("g-1")).willReturn(Optional.empty());
		given(users.findByEmail("mai@gmail.com")).willReturn(Optional.of(squatter));

		service.loginWithGoogle("id-token", CLIENT);

		assertThat(squatter.getGoogleId()).isEqualTo("g-1");
		assertThat(squatter.hasPassword()).isFalse();
		assertThat(squatter.getPhone()).isNull();
		verify(refreshTokens).revokeAll(squatter.getId());
		verify(statuses).evict(squatter.getId());
		verify(audit).entry(org.mockito.ArgumentMatchers.eq("USER_GOOGLE_TAKEOVER"), org.mockito.ArgumentMatchers.eq("USER"),
				org.mockito.ArgumentMatchers.eq(squatter.getId()), anyString());
		verify(verification).markVerified(squatter, "GOOGLE");
		// This browser's session is issued after the old ones were revoked
		var order = org.mockito.Mockito.inOrder(refreshTokens);
		order.verify(refreshTokens).revokeAll(squatter.getId());
		order.verify(refreshTokens).issue(squatter, CLIENT);
	}

	@Test
	void theEmailMatchesWhateverItsCase() {
		User owner = account("an.nguyen@gmail.com", null, true);
		googleSays("g-2", "  An.Nguyen@GMAIL.com ", "An");
		given(users.findByGoogleId("g-2")).willReturn(Optional.empty());
		given(users.findByEmail("an.nguyen@gmail.com")).willReturn(Optional.of(owner));

		service.loginWithGoogle("id-token", CLIENT);

		assertThat(owner.getGoogleId()).isEqualTo("g-2");
		verify(users, never()).saveAndFlush(any());
	}

	@Test
	void aLockedAccountIsNeitherSignedInNorChanged() {
		User locked = account("mai@gmail.com", "0987654321", false);
		locked.setActive(false);
		googleSays("g-1", "mai@gmail.com", "Mai");
		given(users.findByGoogleId("g-1")).willReturn(Optional.empty());
		given(users.findByEmail("mai@gmail.com")).willReturn(Optional.of(locked));

		assertThatThrownBy(() -> service.loginWithGoogle("id-token", CLIENT)).isInstanceOf(ResponseStatusException.class);
		assertThat(locked.getGoogleId()).isNull();
		assertThat(locked.hasPassword()).isTrue();
		assertThat(locked.getPhone()).isEqualTo("0987654321");
		verify(refreshTokens, never()).issue(any(), any());
	}
}
