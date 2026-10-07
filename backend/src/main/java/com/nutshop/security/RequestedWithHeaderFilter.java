package com.nutshop.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Set;

/**
 * CSRF protection for cookie authentication. With SameSite=None, another site can make the browser send our cookies
 * along with a plain form POST. Browsers only let a page add a custom header like X-Requested-With after a CORS
 * preflight, which only FRONTEND_URL passes, so requiring it on state-changing requests blocks forged ones.
 */
public class RequestedWithHeaderFilter extends OncePerRequestFilter {

	public static final String HEADER = "X-Requested-With";

	private static final Set<String> UNSAFE_METHODS = Set.of("POST", "PUT", "PATCH", "DELETE");

	@Override
	protected boolean shouldNotFilter(HttpServletRequest request) {
		return !UNSAFE_METHODS.contains(request.getMethod()) || !request.getRequestURI().startsWith("/api/");
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		String value = request.getHeader(HEADER);
		if (value == null || value.isBlank()) {
			ProblemResponses.write(response, HttpStatus.FORBIDDEN, "Yêu cầu không hợp lệ (thiếu header " + HEADER + ")");
			return;
		}
		chain.doFilter(request, response);
	}
}
