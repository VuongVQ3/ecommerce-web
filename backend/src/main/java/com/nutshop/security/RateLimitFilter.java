package com.nutshop.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.Optional;
import java.util.Set;

/** Limits requests with the given method to the given paths per client IP, each path counted separately. 429 + Retry-After. */
public class RateLimitFilter extends OncePerRequestFilter {

	private final RateLimiter limiter;
	private final HttpMethod method;
	private final Set<String> paths;

	public RateLimitFilter(RateLimiter limiter, HttpMethod method, Set<String> paths) {
		this.limiter = limiter;
		this.method = method;
		this.paths = Set.copyOf(paths);
	}

	/** POST-only, the common case. */
	public RateLimitFilter(RateLimiter limiter, Set<String> paths) {
		this(limiter, HttpMethod.POST, paths);
	}

	@Override
	protected boolean shouldNotFilter(HttpServletRequest request) {
		return !method.matches(request.getMethod()) || !paths.contains(request.getRequestURI());
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		Optional<Duration> retryAfter = limiter.tryAcquire(request.getRequestURI() + "|" + request.getRemoteAddr());
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
