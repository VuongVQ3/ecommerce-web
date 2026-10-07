package com.nutshop.config;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import com.nutshop.auth.AuthCookies;
import com.nutshop.auth.TokenService;
import com.nutshop.security.ProblemResponses;
import com.nutshop.security.RateLimitFilter;
import com.nutshop.security.RateLimiter;
import com.nutshop.security.RequestedWithHeaderFilter;
import jakarta.servlet.http.Cookie;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
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
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.util.matcher.OrRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

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
			// Guest carts: priced from the products table, never from the client
			PATHS.matcher(HttpMethod.POST, "/api/cart/validate"),
			PATHS.matcher("/error"));

	/** Login, register and password reset: per IP (stops credential stuffing and reset-link spam). */
	private static final Set<String> AUTH_LIMITED_PATHS = Set.of("/api/auth/login", "/api/auth/register",
			"/api/auth/forgot-password", "/api/auth/reset-password");

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http, @Qualifier("authRateLimiter") RateLimiter authRateLimiter,
			@Qualifier("cartValidateRateLimiter") RateLimiter cartValidateRateLimiter) throws Exception {
		http.csrf(csrf -> csrf.disable()) // replaced by RequestedWithHeaderFilter (stateless, cookie-based auth)
			.cors(Customizer.withDefaults())
			.sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
			.authorizeHttpRequests(auth -> auth.requestMatchers(PUBLIC_ENDPOINTS).permitAll().anyRequest().authenticated())
			.addFilterAfter(new RequestedWithHeaderFilter(), CorsFilter.class)
			.addFilterAfter(new RateLimitFilter(authRateLimiter, AUTH_LIMITED_PATHS), RequestedWithHeaderFilter.class)
			.addFilterAfter(new RateLimitFilter(cartValidateRateLimiter, Set.of("/api/cart/validate")),
					RequestedWithHeaderFilter.class)
			.oauth2ResourceServer(o -> o.bearerTokenResolver(bearerTokenResolver())
				.jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter()))
				.authenticationEntryPoint((req, res, ex) -> ProblemResponses.write(res, HttpStatus.UNAUTHORIZED,
						"Vui lòng đăng nhập để tiếp tục"))
				.accessDeniedHandler((req, res, ex) -> ProblemResponses.write(res, HttpStatus.FORBIDDEN,
						"Bạn không có quyền truy cập chức năng này")));
		return http.build();
	}

	/**
	 * Reads the access token from its httpOnly cookie (there is no Authorization header). Skipped on public
	 * endpoints, so a stale or expired cookie can never block login, refresh or browsing products.
	 */
	private static BearerTokenResolver bearerTokenResolver() {
		return request -> {
			if (PUBLIC_ENDPOINTS.matches(request) || request.getCookies() == null) {
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
