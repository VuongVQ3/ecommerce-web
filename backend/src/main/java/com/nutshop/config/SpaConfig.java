package com.nutshop.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.EncodedResourceResolver;
import org.springframework.web.servlet.resource.PathResourceResolver;

import java.io.IOException;
import java.time.Duration;

/**
 * Serves the React build (copied into classpath:/static by the Docker build) from the same origin as the API.
 * <ul>
 * <li>Hashed bundles under /assets are cached for a year (immutable); other files (icons, Open Graph image) a day.</li>
 * <li>Pre-compressed .br/.gz copies made at build time are sent when the browser accepts them.</li>
 * <li>No fallback here: app routes are rendered by PageController, unknown paths become 404 (NotFoundAdvice).</li>
 * </ul>
 * In local development the folder is absent and Vite serves the app instead.
 */
@Configuration
public class SpaConfig implements WebMvcConfigurer {

	@Override
	public void addResourceHandlers(ResourceHandlerRegistry registry) {
		registry.addResourceHandler("/assets/**")
			.addResourceLocations("classpath:/static/assets/")
			.setCacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable())
			.resourceChain(true)
			.addResolver(new EncodedResourceResolver())
			.addResolver(new PathResourceResolver());
		registry.addResourceHandler("/**")
			.addResourceLocations("classpath:/static/")
			.setCacheControl(CacheControl.maxAge(Duration.ofDays(1)).cachePublic())
			.resourceChain(true)
			.addResolver(new EncodedResourceResolver())
			.addResolver(new PathResourceResolver() {
				@Override
				protected Resource getResource(String path, Resource location) throws IOException {
					// The bare template would skip the per-page meta tags: always go through PageController
					return path.equals("index.html") ? null : super.getResource(path, location);
				}
			});
	}
}
