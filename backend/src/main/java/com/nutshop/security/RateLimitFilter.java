package com.nutshop.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * Limits requests with the given method to the given paths per client IP, each path counted separately. 429 + Retry-After.
 * Matching and the per-path counter use the decoded, normalized path (the same {@link PathPatternRequestMatcher} the
 * security rules use), so an encoded spelling such as {@code /api/auth/%6Cogin} cannot slip past the limit.
 */
public class RateLimitFilter extends OncePerRequestFilter {

	private static final PathPatternRequestMatcher.Builder PATHS = PathPatternRequestMatcher.withDefaults();

	private record Rule(RequestMatcher matcher, String counter) {
	}

	private final RateLimiter limiter;
	private final List<Rule> rules;

	public RateLimitFilter(RateLimiter limiter, HttpMethod method, Set<String> paths) {
		this.limiter = limiter;
		// One matcher per path. The counter key is the canonical "METHOD path", not the raw request URI, so every
		// encoding of the same route shares one counter and each distinct route is still counted separately.
		this.rules = paths.stream().map(path -> new Rule(PATHS.matcher(method, path), method.name() + " " + path)).toList();
	}

	/** Paths with variables (e.g. /api/orders/track/{code}): one shared counter per IP named {@code bucket}. */
	public RateLimitFilter(RateLimiter limiter, RequestMatcher matcher, String bucket) {
		this.limiter = limiter;
		this.rules = List.of(new Rule(matcher, bucket));
	}

	/** POST-only, the common case. */
	public RateLimitFilter(RateLimiter limiter, Set<String> paths) {
		this(limiter, HttpMethod.POST, paths);
	}

	private Rule matched(HttpServletRequest request) {
		for (Rule rule : rules) {
			if (rule.matcher().matches(request)) {
				return rule;
			}
		}
		return null;
	}

	@Override
	protected boolean shouldNotFilter(HttpServletRequest request) {
		return matched(request) == null;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		Rule rule = matched(request);
		String counter = rule != null ? rule.counter() : request.getRequestURI();
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
