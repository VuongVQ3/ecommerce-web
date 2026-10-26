package com.nutshop.user;

import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Account state checked on every authenticated API request (UserStatusFilter): locked accounts and role changes take
 * effect within {@link #TTL} even while an older access token is still valid. Admin actions evict the entry so their
 * own changes apply at once on this server.
 */
@Component
public class UserStatusCache {

	public static final Duration TTL = Duration.ofSeconds(60);

	public record Status(boolean active, Role role, boolean passwordChangeRequired, int credentialVersion) {
	}

	private record Entry(Optional<Status> status, Instant expiresAt) {
	}

	private final UserRepository users;
	private final Clock clock;
	private final Map<UUID, Entry> cache = new ConcurrentHashMap<>();

	public UserStatusCache(UserRepository users, Clock clock) {
		this.users = users;
		this.clock = clock;
	}

	/** Empty when the account no longer exists. */
	public Optional<Status> get(UUID userId) {
		Instant now = clock.instant();
		Entry entry = cache.get(userId);
		if (entry == null || entry.expiresAt().isBefore(now)) {
			Optional<Status> status = users.findById(userId)
				.map(u -> new Status(u.isActive(), u.getRole(), u.isPasswordChangeRequired(), u.getCredentialVersion()));
			entry = new Entry(status, now.plus(TTL));
			cache.put(userId, entry);
			if (cache.size() > 10_000) {
				cache.entrySet().removeIf(e -> e.getValue().expiresAt().isBefore(now));
			}
		}
		return entry.status();
	}

	public void evict(UUID userId) {
		cache.remove(userId);
	}
}
