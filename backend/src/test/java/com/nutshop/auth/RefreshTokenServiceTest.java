package com.nutshop.auth;

import com.nutshop.common.UnauthorizedException;
import com.nutshop.config.JwtProperties;
import com.nutshop.user.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class RefreshTokenServiceTest {

	private static final Instant NOW = Instant.parse("2026-10-07T12:00:00Z");
	private static final ClientInfo CLIENT = new ClientInfo("JUnit", "127.0.0.1");

	@Mock
	RefreshTokenRepository tokens;

	RefreshTokenService service;

	User user;

	@BeforeEach
	void setUp() {
		var props = new JwtProperties("x".repeat(32), Duration.ofMinutes(15), Duration.ofDays(7));
		service = new RefreshTokenService(tokens, props, Clock.fixed(NOW, ZoneOffset.UTC));
		user = new User("an@example.com", "hash", "An", null, NOW);
		ReflectionTestUtils.setField(user, "id", UUID.randomUUID());
	}

	private RefreshToken stored(String raw, Instant expiresAt) {
		RefreshToken token = new RefreshToken(user, RefreshTokenService.hash(raw), NOW.minusSeconds(60), expiresAt, CLIENT);
		ReflectionTestUtils.setField(token, "id", UUID.randomUUID());
		given(tokens.findByTokenHash(RefreshTokenService.hash(raw))).willReturn(Optional.of(token));
		return token;
	}

	private void saveAssignsIds() {
		given(tokens.save(any(RefreshToken.class))).willAnswer(inv -> {
			RefreshToken t = inv.getArgument(0);
			ReflectionTestUtils.setField(t, "id", UUID.randomUUID());
			return t;
		});
	}

	@Test
	void issueStoresOnlyTheHash() {
		saveAssignsIds();

		String raw = service.issue(user, CLIENT);

		verify(tokens).save(org.mockito.ArgumentMatchers.argThat(t -> t.getTokenHash().equals(RefreshTokenService.hash(raw))
				&& !t.getTokenHash().equals(raw) && t.getExpiresAt().equals(NOW.plus(Duration.ofDays(7)))));
		assertThat(raw).hasSizeGreaterThanOrEqualTo(43); // 32 random bytes, base64url
	}

	@Test
	void rotateRevokesTheOldTokenAndLinksItToTheNewOne() {
		saveAssignsIds();
		RefreshToken old = stored("old", NOW.plus(Duration.ofDays(1)));

		var rotation = service.rotate("old", CLIENT);

		assertThat(rotation.user()).isSameAs(user);
		assertThat(rotation.refreshToken()).isNotEqualTo("old");
		assertThat(old.getRevokedAt()).isEqualTo(NOW);
		assertThat(old.getReplacedById()).isNotNull();
	}

	@Test
	void reusingARevokedTokenRevokesAllTokensOfTheUser() {
		RefreshToken old = stored("old", NOW.plus(Duration.ofDays(1)));
		old.revoke(NOW.minusSeconds(30));

		assertThatThrownBy(() -> service.rotate("old", CLIENT)).isInstanceOf(UnauthorizedException.class);

		verify(tokens).revokeAllActive(user.getId(), NOW);
		verify(tokens, never()).save(any());
	}

	@Test
	void expiredTokenIsRejectedAndRevoked() {
		RefreshToken old = stored("old", NOW.minusSeconds(1));

		assertThatThrownBy(() -> service.rotate("old", CLIENT)).isInstanceOf(UnauthorizedException.class);

		assertThat(old.getRevokedAt()).isEqualTo(NOW);
		verify(tokens, never()).save(any());
	}

	@Test
	void unknownTokenIsRejected() {
		given(tokens.findByTokenHash(any())).willReturn(Optional.empty());

		assertThatThrownBy(() -> service.rotate("nope", CLIENT)).isInstanceOf(UnauthorizedException.class);
	}
}
