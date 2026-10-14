package com.nutshop.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.Optional;
import java.util.Set;
import java.util.function.Predicate;

/** Limits requests with the given method to the given paths per client IP, each path counted separately. 429 + Retry-After. */
public class RateLimitFilter extends OncePerRequestFilter {

	private final RateLimiter limiter;
	private final Predicate<HttpServletRequest> applies;
	/** Null: each path has its own counter. Otherwise all matching requests of an IP share this counter. */
	private final String bucket;

	public RateLimitFilter(RateLimiter limiter, HttpMethod method, Set<String> paths) {
		Set<String> exact = Set.copyOf(paths);
		this.limiter = limiter;
		this.applies = request -> method.matches(request.getMethod()) && exact.contains(request.getRequestURI());
		this.bucket = null;
	}

	/** Paths with variables (e.g. /api/orders/track/{code}): one shared counter per IP named {@code bucket}. */
	public RateLimitFilter(RateLimiter limiter, RequestMatcher matcher, String bucket) {
		this.limiter = limiter;
		this.applies = matcher::matches;
		this.bucket = bucket;
	}

	/** POST-only, the common case. */
	public RateLimitFilter(RateLimiter limiter, Set<String> paths) {
		this(limiter, HttpMethod.POST, paths);
	}

	@Override
	protected boolean shouldNotFilter(HttpServletRequest request) {
		return !applies.test(request);
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		String counter = bucket != null ? bucket : request.getRequestURI();
		Optional<Duration> retryAfter = limiter.tryAcquire(counter + "|" + request.getRemoteAddr());
		if (retryAfter.isPresent()) {
			long seconds = Math.max(1, (retryAfter.get().toMillis() + 999) / 1000);
			response.setHeader(HttpHeaders.RETRY_AFTER, String.valueOf(seconds));
			ProblemResponses.write(response, HttpStatus.TOO_MANY_REQUESTS,
					"Bạn thao tác quá nhiều lần. Vui lòng thử lại sau " + seconds + " giây.");
			return;
		}
		chain.doFilter(request, response);
	}
}
