package com.nutshop.auth;

import com.nutshop.common.UnauthorizedException;
import com.nutshop.config.JwtProperties;
import com.nutshop.user.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

/**
 * Opaque refresh tokens with rotation and reuse detection. Each refresh revokes the presented token and issues a
 * new one; presenting an already-revoked token means it was stolen or replayed, so every session of that user is
 * revoked.
 */
@Service
public class RefreshTokenService {

	static final String INVALID_SESSION = "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại";

	private static final Logger log = LoggerFactory.getLogger(RefreshTokenService.class);

	public record Rotation(User user, String refreshToken) {
	}

	private final RefreshTokenRepository tokens;
	private final JwtProperties props;
	private final Clock clock;

	public RefreshTokenService(RefreshTokenRepository tokens, JwtProperties props, Clock clock) {
		this.tokens = tokens;
		this.props = props;
		this.clock = clock;
	}

	/** Returns the raw token for the cookie; only its hash is persisted. */
	@Transactional
	public String issue(User user, ClientInfo client) {
		return create(user, client).raw();
	}

	/**
	 * Commits even when rejecting: the revocations done on reuse/expiry must persist although we throw.
	 */
	@Transactional(noRollbackFor = UnauthorizedException.class)
	public Rotation rotate(String rawToken, ClientInfo client) {
		RefreshToken current = tokens.findByTokenHash(hash(rawToken))
			.orElseThrow(() -> new UnauthorizedException(INVALID_SESSION));
		Instant now = clock.instant();
		User user = current.getUser();

		if (current.isRevoked()) {
			int revoked = tokens.revokeAllActive(user.getId(), now);
			log.warn("Refresh token reuse detected for user {}; revoked {} active token(s)", user.getId(), revoked);
			throw new UnauthorizedException(INVALID_SESSION);
		}
		if (current.isExpired(now) || !user.isActive()) {
			current.revoke(now);
			throw new UnauthorizedException(INVALID_SESSION);
		}

		Created next = create(user, client);
		current.revoke(now);
		current.replaceWith(next.entity().getId());
		return new Rotation(user, next.raw());
	}

	/** Logout: revokes the given token if it is still active. Unknown tokens are ignored. */
	@Transactional
	public void revoke(String rawToken) {
		tokens.findByTokenHash(hash(rawToken)).ifPresent(t -> t.revoke(clock.instant()));
	}

	@Transactional
	public void revokeAll(UUID userId) {
		tokens.revokeAllActive(userId, clock.instant());
	}

	private record Created(RefreshToken entity, String raw) {
	}

	private Created create(User user, ClientInfo client) {
		String raw = SecureTokens.generate();
		Instant now = clock.instant();
		RefreshToken entity = tokens.save(
				new RefreshToken(user, hash(raw), now, now.plus(props.refreshTokenTtl()), client));
		return new Created(entity, raw);
	}

	static String hash(String rawToken) {
		return SecureTokens.hash(rawToken);
	}
}
