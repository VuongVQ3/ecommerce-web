package com.nutshop.security;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory sliding-window rate limiter: at most {@code maxRequests} per key within {@code window}.
 * State is per application instance; running several instances would need a shared store (e.g. Redis).
 */
public class RateLimiter {

	/** Above this many tracked keys, idle ones are swept so memory stays bounded. */
	private static final int SWEEP_THRESHOLD = 10_000;

	private final int maxRequests;
	private final Duration window;
	private final Clock clock;
	private final ConcurrentHashMap<String, Deque<Instant>> hits = new ConcurrentHashMap<>();

	public RateLimiter(int maxRequests, Duration window, Clock clock) {
		this.maxRequests = maxRequests;
		this.window = window;
		this.clock = clock;
	}

	/** Records a hit for {@code key}. Returns empty if allowed, otherwise how long until the next hit is allowed. */
	public Optional<Duration> tryAcquire(String key) {
		Instant now = clock.instant();
		Duration[] retryAfter = { null };
		hits.compute(key, (k, timestamps) -> {
			Deque<Instant> q = timestamps == null ? new ArrayDeque<>() : timestamps;
			prune(q, now);
			if (q.size() >= maxRequests) {
				retryAfter[0] = Duration.between(now, q.peekFirst().plus(window));
			}
			else {
				q.addLast(now);
			}
			return q;
		});
		if (hits.size() > SWEEP_THRESHOLD) {
			sweep(now);
		}
		return Optional.ofNullable(retryAfter[0]);
	}

	/** Test helper: forget all recorded hits. */
	public void reset() {
		hits.clear();
	}

	private void sweep(Instant now) {
		for (String key : hits.keySet()) {
			hits.computeIfPresent(key, (k, q) -> {
				prune(q, now);
				return q.isEmpty() ? null : q;
			});
		}
	}

	private void prune(Deque<Instant> q, Instant now) {
		Instant cutoff = now.minus(window);
		while (!q.isEmpty() && !q.peekFirst().isAfter(cutoff)) {
			q.pollFirst();
		}
	}
}
