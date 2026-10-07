package com.nutshop.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

import java.io.IOException;

/**
 * Serves the React build (copied into classpath:/static by the Docker build) from the same origin as the API.
 * Unknown non-API paths fall back to index.html so client-side routes like /san-pham/abc survive a page reload.
 * In local development the folder is absent and Vite serves the app instead, so this does nothing.
 */
@Configuration
public class SpaConfig implements WebMvcConfigurer {

	private static final Resource INDEX = new ClassPathResource("/static/index.html");

	@Override
	public void addResourceHandlers(ResourceHandlerRegistry registry) {
		registry.addResourceHandler("/**")
			.addResourceLocations("classpath:/static/")
			.resourceChain(true)
			.addResolver(new PathResourceResolver() {
				@Override
				protected Resource getResource(String path, Resource location) throws IOException {
					Resource file = location.createRelative(path);
					if (file.exists() && file.isReadable()) {
						return file;
					}
					// Never answer an unknown API path with the HTML page; let it 404 as JSON
					if (path.startsWith("api/") || !INDEX.exists()) {
						return null;
					}
					return INDEX;
				}
			});
	}
}
