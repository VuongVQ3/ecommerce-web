package com.nutshop.security;

import com.nutshop.auth.TokenService;
import com.nutshop.user.Role;
import com.nutshop.user.UserStatusCache;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * Runs after the access token was accepted and checks the account itself (cached up to 60 seconds):
 * <ul>
 * <li>locked or deleted → 401, so a locked user's old access token stops working;</li>
 * <li>back office ({@code /api/admin/**}) with a role that is no longer STAFF/ADMIN → 403;</li>
 * <li>back office while a password change is required → 403 PASSWORD_CHANGE_REQUIRED.</li>
 * </ul>
 */
public class UserStatusFilter extends OncePerRequestFilter {

	public static final String PASSWORD_CHANGE_REQUIRED = "PASSWORD_CHANGE_REQUIRED";

	// Decoded, normalized match on the back office, so an encoded path such as /api/%61dmin/** cannot skip these checks.
	private static final RequestMatcher BACK_OFFICE = PathPatternRequestMatcher.withDefaults().matcher("/api/admin/**");

	private final UserStatusCache statuses;

	public UserStatusFilter(UserStatusCache statuses) {
		this.statuses = statuses;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		Authentication auth = SecurityContextHolder.getContext().getAuthentication();
		if (!(auth instanceof JwtAuthenticationToken jwt)) {
			chain.doFilter(request, response);
			return;
		}
		var status = statuses.get(UUID.fromString(jwt.getToken().getSubject()));
		if (status.isEmpty() || !status.get().active()) {
			SecurityContextHolder.clearContext();
			ProblemResponses.write(response, HttpStatus.UNAUTHORIZED,
					"Tài khoản đã bị khoá. Vui lòng liên hệ cửa hàng để được hỗ trợ.", "ACCOUNT_LOCKED");
			return;
		}
		Object tokenVersion = jwt.getToken().getClaim(TokenService.CREDENTIAL_VERSION_CLAIM);
		long presented = tokenVersion instanceof Number n ? n.longValue() : 0L;
		if (presented != status.get().credentialVersion()) {
			SecurityContextHolder.clearContext();
			ProblemResponses.write(response, HttpStatus.UNAUTHORIZED,
					"Phiên đăng nhập đã hết hiệu lực. Vui lòng đăng nhập lại.", "SESSION_INVALIDATED");
			return;
		}
		if (BACK_OFFICE.matches(request)) {
			Role role = status.get().role();
			if (role != Role.STAFF && role != Role.ADMIN) {
				ProblemResponses.write(response, HttpStatus.FORBIDDEN, "Bạn không có quyền truy cập chức năng này");
				return;
			}
			if (status.get().passwordChangeRequired()) {
				ProblemResponses.write(response, HttpStatus.FORBIDDEN,
						"Vui lòng đổi mật khẩu trước khi dùng trang quản trị", PASSWORD_CHANGE_REQUIRED);
				return;
			}
		}
		chain.doFilter(request, response);
	}
}
