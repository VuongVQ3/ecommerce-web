package com.nutshop.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.Optional;
import java.util.Set;

/** Limits POSTs to the given paths per client IP, each path counted separately. Answers 429 with Retry-After. */
public class RateLimitFilter extends OncePerRequestFilter {

	private final RateLimiter limiter;
	private final Set<String> paths;

	public RateLimitFilter(RateLimiter limiter, Set<String> paths) {
		this.limiter = limiter;
		this.paths = Set.copyOf(paths);
	}

	@Override
	protected boolean shouldNotFilter(HttpServletRequest request) {
		return !"POST".equals(request.getMethod()) || !paths.contains(request.getRequestURI());
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
