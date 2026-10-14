package com.nutshop.config;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import com.nutshop.auth.AuthCookies;
import com.nutshop.auth.TokenService;
import com.nutshop.security.ProblemResponses;
import com.nutshop.security.RateLimitFilter;
import com.nutshop.security.RateLimiter;
import com.nutshop.security.RequestedWithHeaderFilter;
import com.nutshop.security.UserStatusFilter;
import com.nutshop.user.UserStatusCache;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authorization.AuthenticatedAuthorizationManager;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.util.matcher.OrRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Set;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {

	private static final PathPatternRequestMatcher.Builder PATHS = PathPatternRequestMatcher.withDefaults();

	/** Endpoints reachable without signing in. The access cookie is ignored on these (see bearerTokenResolver). */
	static final RequestMatcher PUBLIC_ENDPOINTS = new OrRequestMatcher(
			PATHS.matcher(HttpMethod.POST, "/api/auth/register"),
			PATHS.matcher(HttpMethod.POST, "/api/auth/login"),
			PATHS.matcher(HttpMethod.POST, "/api/auth/google"),
			PATHS.matcher(HttpMethod.POST, "/api/auth/refresh"),
			PATHS.matcher(HttpMethod.POST, "/api/auth/logout"),
			PATHS.matcher(HttpMethod.POST, "/api/auth/forgot-password"),
			PATHS.matcher(HttpMethod.POST, "/api/auth/reset-password"),
			PATHS.matcher(HttpMethod.GET, "/api/auth/providers"),
			PATHS.matcher(HttpMethod.GET, "/api/products/**"),
			PATHS.matcher(HttpMethod.GET, "/api/categories"),
			// Any method, so HEAD probes (curl -I, uptime monitors) work too
			PATHS.matcher("/api/health"),
			PATHS.matcher("/api/site"),
			// Guest carts: priced from the products table, never from the client
			PATHS.matcher(HttpMethod.POST, "/api/cart/validate"),
			// Guests look up their order with code + phone
			PATHS.matcher(HttpMethod.GET, "/api/orders/lookup"),
			// Guest tracking links: the token in ?t= is the proof (rate limited per IP)
			PATHS.matcher(HttpMethod.GET, "/api/orders/track/*"),
			PATHS.matcher(HttpMethod.POST, "/api/orders/track/*/cancel"),
			PATHS.matcher(HttpMethod.POST, "/api/orders/track/*/claim-account"),
			PATHS.matcher(HttpMethod.POST, "/api/auth/verify-email"),
			PATHS.matcher(HttpMethod.POST, "/api/auth/accept-invite"),
			PATHS.matcher("/error"));

	/**
	 * Open to everyone, but the access cookie IS read when present, so a signed-in buyer's order is linked to their
	 * account (guests simply have no cookie).
	 */
	static final RequestMatcher OPTIONAL_AUTH_ENDPOINTS = PATHS.matcher(HttpMethod.POST, "/api/orders");

	/** Reading and cancelling through a tracking link: 30 per minute per IP across all orders. */
	private static final RequestMatcher TRACKING = new OrRequestMatcher(PATHS.matcher(HttpMethod.GET, "/api/orders/track/*"),
			PATHS.matcher(HttpMethod.POST, "/api/orders/track/*/cancel"));

	/** The REST API. Everything else is the bundled React app (static files and client-side routes). */
	static final RequestMatcher API = PATHS.matcher("/api/**");

	/** Login, register and password reset: per IP (stops credential stuffing and reset-link spam). */
	private static final Set<String> AUTH_LIMITED_PATHS = Set.of("/api/auth/login", "/api/auth/register",
			"/api/auth/forgot-password", "/api/auth/reset-password");

	/**
	 * Content-Security-Policy for the app: own scripts only, plus Cloudflare Turnstile and Google Sign-In; Google
	 * Fonts; product images from Cloudinary. JSON-LD blocks are data, not scripts, so they need no exception.
	 * 'unsafe-inline' styles are needed by Google Sign-In's injected button styles.
	 */
	static final String CONTENT_SECURITY_POLICY = String.join("; ",
			"default-src 'self'",
			"script-src 'self' https://challenges.cloudflare.com https://accounts.google.com/gsi/client",
			"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
			"font-src 'self' https://fonts.gstatic.com",
			"img-src 'self' data: https://res.cloudinary.com https://*.googleusercontent.com",
			"connect-src 'self' https://accounts.google.com/gsi/",
			"frame-src https://challenges.cloudflare.com https://accounts.google.com",
			"object-src 'none'",
			"base-uri 'self'",
			"form-action 'self'",
			"frame-ancestors 'none'");

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http,
			@Qualifier("requestMappingHandlerMapping") ObjectProvider<RequestMappingHandlerMapping> handlerMappings, @Qualifier("authRateLimiter") RateLimiter authRateLimiter,
			@Qualifier("cartValidateRateLimiter") RateLimiter cartValidateRateLimiter,
			@Qualifier("orderCreateRateLimiter") RateLimiter orderCreateRateLimiter,
			@Qualifier("orderLookupRateLimiter") RateLimiter orderLookupRateLimiter,
			@Qualifier("orderTrackRateLimiter") RateLimiter orderTrackRateLimiter,
			@Qualifier("claimAccountRateLimiter") RateLimiter claimAccountRateLimiter,
			@Qualifier("orderClaimRateLimiter") RateLimiter orderClaimRateLimiter,
			@Qualifier("verifyEmailRateLimiter") RateLimiter verifyEmailRateLimiter,
			@Qualifier("acceptInviteRateLimiter") RateLimiter acceptInviteRateLimiter, UserStatusCache userStatuses)
			throws Exception {
		http.csrf(csrf -> csrf.disable()) // replaced by RequestedWithHeaderFilter (stateless, cookie-based auth)
			.cors(Customizer.withDefaults())
			.sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
			.authorizeHttpRequests(auth -> auth.requestMatchers(PUBLIC_ENDPOINTS, OPTIONAL_AUTH_ENDPOINTS)
				.permitAll()
				// Defense in depth: controllers also carry @Roles (products/categories are ADMIN only)
				.requestMatchers(PATHS.matcher("/api/admin/**"))
				.hasAnyRole("STAFF", "ADMIN")
				// Unknown API paths fall through to a 404 instead of asking anonymous callers to sign in
				.requestMatchers(API)
				.access(authenticatedOrUnmapped(handlerMappings))
				// The React app itself is public; pages like /tai-khoan are guarded client-side and by the API
				.anyRequest()
				.permitAll())
			.headers(h -> h.contentSecurityPolicy(csp -> csp.policyDirectives(CONTENT_SECURITY_POLICY))
				.referrerPolicy(r -> r.policy(ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN))
				.frameOptions(f -> f.deny()))
			.addFilterAfter(new RequestedWithHeaderFilter(), CorsFilter.class)
			.addFilterAfter(new RateLimitFilter(authRateLimiter, AUTH_LIMITED_PATHS), RequestedWithHeaderFilter.class)
			.addFilterAfter(new RateLimitFilter(cartValidateRateLimiter, Set.of("/api/cart/validate")),
					RequestedWithHeaderFilter.class)
			.addFilterAfter(new RateLimitFilter(orderCreateRateLimiter, Set.of("/api/orders")),
					RequestedWithHeaderFilter.class)
			.addFilterAfter(new RateLimitFilter(orderLookupRateLimiter, HttpMethod.GET, Set.of("/api/orders/lookup")),
					RequestedWithHeaderFilter.class)
			.addFilterAfter(new RateLimitFilter(orderTrackRateLimiter, TRACKING, "order-track"),
					RequestedWithHeaderFilter.class)
			.addFilterAfter(new RateLimitFilter(claimAccountRateLimiter,
					PATHS.matcher(HttpMethod.POST, "/api/orders/track/*/claim-account"), "claim-account"),
					RequestedWithHeaderFilter.class)
			.addFilterAfter(new RateLimitFilter(orderClaimRateLimiter, PATHS.matcher(HttpMethod.POST, "/api/orders/claim"),
					"order-claim"), RequestedWithHeaderFilter.class)
			.addFilterAfter(new RateLimitFilter(verifyEmailRateLimiter, PATHS.matcher(HttpMethod.POST, "/api/auth/verify-email"),
					"verify-email"), RequestedWithHeaderFilter.class)
			.addFilterAfter(new RateLimitFilter(acceptInviteRateLimiter, PATHS.matcher(HttpMethod.POST, "/api/auth/accept-invite"),
					"accept-invite"), RequestedWithHeaderFilter.class)
			// Locked accounts, role changes and required password changes apply even to still-valid access tokens
			.addFilterAfter(new UserStatusFilter(userStatuses), BearerTokenAuthenticationFilter.class)
			.exceptionHandling(e -> e.accessDeniedHandler((req, res, ex) -> ProblemResponses.write(res,
					HttpStatus.FORBIDDEN, "Bạn không có quyền truy cập chức năng này")))
			.oauth2ResourceServer(o -> o.bearerTokenResolver(bearerTokenResolver())
				.jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter()))
				.authenticationEntryPoint((req, res, ex) -> ProblemResponses.write(res, HttpStatus.UNAUTHORIZED,
						"Vui lòng đăng nhập để tiếp tục"))
				.accessDeniedHandler((req, res, ex) -> ProblemResponses.write(res, HttpStatus.FORBIDDEN,
						"Bạn không có quyền truy cập chức năng này")));
		return http.build();
	}

	/** Signed-in callers only, unless no controller handles the path at all (then MVC answers 404). */
	private static AuthorizationManager<RequestAuthorizationContext> authenticatedOrUnmapped(
			ObjectProvider<RequestMappingHandlerMapping> handlerMappings) {
		AuthenticatedAuthorizationManager<RequestAuthorizationContext> authenticated = AuthenticatedAuthorizationManager
			.authenticated();
		return (authentication, context) -> {
			if (!hasHandler(handlerMappings.getObject(), context.getRequest())) {
				return new AuthorizationDecision(true);
			}
			return authenticated.authorize(authentication, context);
		};
	}

	private static boolean hasHandler(RequestMappingHandlerMapping mapping, HttpServletRequest request) {
		try {
			return mapping.getHandler(request) != null;
		}
		catch (Exception ex) {
			// e.g. the path exists but not for this HTTP method: treat as mapped (still needs sign-in)
			return true;
		}
	}

	/**
	 * Reads the access token from its httpOnly cookie (there is no Authorization header). Skipped on public
	 * endpoints and on the static app, so a stale or expired cookie can never block login, refresh, browsing
	 * products or loading the page itself.
	 */
	private static BearerTokenResolver bearerTokenResolver() {
		return request -> {
			if (!API.matches(request) || PUBLIC_ENDPOINTS.matches(request) || request.getCookies() == null) {
				return null;
			}
			for (Cookie cookie : request.getCookies()) {
				if (AuthCookies.ACCESS_COOKIE.equals(cookie.getName()) && !cookie.getValue().isBlank()) {
					return cookie.getValue();
				}
			}
			return null;
		};
	}

	@Bean
	PasswordEncoder passwordEncoder() {
		return new BCryptPasswordEncoder(12);
	}

	@Bean
	RateLimiter authRateLimiter(@Value("${app.rate-limit.auth.max-requests}") int maxRequests,
			@Value("${app.rate-limit.auth.window}") Duration window, Clock clock) {
		return new RateLimiter(maxRequests, window, clock);
	}

	/** Per IP, for POST /api/orders (each order holds stock, so keep bulk fake orders expensive). */
	@Bean
	RateLimiter orderCreateRateLimiter(@Value("${app.rate-limit.order-create.max-requests}") int maxRequests,
			@Value("${app.rate-limit.order-create.window}") Duration window, Clock clock) {
		return new RateLimiter(maxRequests, window, clock);
	}

	/** Per IP, for GET /api/orders/lookup (stops guessing order codes / phone numbers). */
	@Bean
	RateLimiter orderLookupRateLimiter(@Value("${app.rate-limit.order-lookup.max-requests}") int maxRequests,
			@Value("${app.rate-limit.order-lookup.window}") Duration window, Clock clock) {
		return new RateLimiter(maxRequests, window, clock);
	}

	/** Per IP, for reading/cancelling through guest tracking links. */
	@Bean
	RateLimiter orderTrackRateLimiter(@Value("${app.rate-limit.order-track.max-requests}") int maxRequests,
			@Value("${app.rate-limit.order-track.window}") Duration window, Clock clock) {
		return new RateLimiter(maxRequests, window, clock);
	}

	/** Per IP, for creating an account from a guest order's tracking page. */
	@Bean
	RateLimiter claimAccountRateLimiter(@Value("${app.rate-limit.claim-account.max-requests}") int maxRequests,
			@Value("${app.rate-limit.claim-account.window}") Duration window, Clock clock) {
		return new RateLimiter(maxRequests, window, clock);
	}

	/** Per IP, for attaching recent guest orders after signing in. */
	@Bean
	RateLimiter orderClaimRateLimiter(@Value("${app.rate-limit.order-claim.max-requests}") int maxRequests,
			@Value("${app.rate-limit.order-claim.window}") Duration window, Clock clock) {
		return new RateLimiter(maxRequests, window, clock);
	}

	/** Per IP, for setting a first password from a staff invitation link. */
	@Bean
	RateLimiter acceptInviteRateLimiter(@Value("${app.rate-limit.accept-invite.max-requests}") int maxRequests,
			@Value("${app.rate-limit.accept-invite.window}") Duration window, Clock clock) {
		return new RateLimiter(maxRequests, window, clock);
	}

	/** Per IP, for opening email verification links. */
	@Bean
	RateLimiter verifyEmailRateLimiter(@Value("${app.rate-limit.verify-email.max-requests}") int maxRequests,
			@Value("${app.rate-limit.verify-email.window}") Duration window, Clock clock) {
		return new RateLimiter(maxRequests, window, clock);
	}

	/** Per account, for "send the verification email again". */
	@Bean
	RateLimiter verificationEmailRateLimiter(@Value("${app.rate-limit.verification-email.max-requests}") int maxRequests,
			@Value("${app.rate-limit.verification-email.window}") Duration window, Clock clock) {
		return new RateLimiter(maxRequests, window, clock);
	}

	/** Per IP, for the public guest-cart endpoint POST /api/cart/validate. */
	@Bean
	RateLimiter cartValidateRateLimiter(@Value("${app.rate-limit.cart-validate.max-requests}") int maxRequests,
			@Value("${app.rate-limit.cart-validate.window}") Duration window, Clock clock) {
		return new RateLimiter(maxRequests, window, clock);
	}

	/** Per email address, for POST /api/auth/forgot-password (on top of the per-IP limit). */
	@Bean
	RateLimiter passwordResetRateLimiter(@Value("${app.rate-limit.password-reset.max-requests}") int maxRequests,
			@Value("${app.rate-limit.password-reset.window}") Duration window, Clock clock) {
		return new RateLimiter(maxRequests, window, clock);
	}

	@Bean
	JwtEncoder jwtEncoder(JwtProperties props) {
		return new NimbusJwtEncoder(new ImmutableSecret<>(secretKey(props)));
	}

	@Bean
	JwtDecoder jwtDecoder(JwtProperties props) {
		return NimbusJwtDecoder.withSecretKey(secretKey(props)).macAlgorithm(MacAlgorithm.HS256).build();
	}

	@Bean
	CorsConfigurationSource corsConfigurationSource(@Value("${app.frontend-url}") String frontendUrl) {
		var config = new CorsConfiguration();
		config.setAllowedOrigins(List.of(frontendUrl));
		config.setAllowCredentials(true);
		config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
		config.setAllowedHeaders(List.of("Content-Type", RequestedWithHeaderFilter.HEADER));
		var source = new UrlBasedCorsConfigurationSource();
		source.registerCorsConfiguration("/api/**", config);
		return source;
	}

	private static JwtAuthenticationConverter jwtAuthenticationConverter() {
		var authorities = new JwtGrantedAuthoritiesConverter();
		authorities.setAuthoritiesClaimName(TokenService.ROLE_CLAIM);
		authorities.setAuthorityPrefix("ROLE_");
		var converter = new JwtAuthenticationConverter();
		converter.setJwtGrantedAuthoritiesConverter(authorities);
		return converter;
	}

	private static SecretKey secretKey(JwtProperties props) {
		return new SecretKeySpec(props.secret().getBytes(StandardCharsets.UTF_8), "HmacSHA256");
	}
}
