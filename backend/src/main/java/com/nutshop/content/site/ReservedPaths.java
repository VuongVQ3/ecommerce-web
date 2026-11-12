package com.nutshop.content.site;

import com.nutshop.dam.StableFileController;
import com.nutshop.site.PageController;
import com.nutshop.site.SiteController;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.GetMapping;

import java.lang.reflect.Method;
import java.util.Collections;
import java.util.Set;
import java.util.TreeSet;

/**
 * First path segments a CMS page may not use: every fixed route of the app, read from the @GetMapping paths of
 * PageController (kept in sync with frontend/src/main.tsx by a test), SiteController and StableFileController,
 * plus the API, static assets and the back office. A top-level CMS page named like one of them could never be
 * reached (or would hide the real page).
 */
@Component
public class ReservedPaths {

	/** Not routes of PageController, but served by the app or the static files. */
	static final Set<String> ALWAYS = Set.of("api", "assets", "brand", "files", "admin", "author", "error", "static",
			"actuator");

	private final Set<String> segments;

	public ReservedPaths() {
		Set<String> found = new TreeSet<>(ALWAYS);
		for (Class<?> controller : new Class<?>[] { PageController.class, SiteController.class, StableFileController.class }) {
			for (Method method : controller.getDeclaredMethods()) {
				GetMapping mapping = method.getAnnotation(GetMapping.class);
				if (mapping == null) {
					continue;
				}
				for (String path : mapping.value().length > 0 ? mapping.value() : mapping.path()) {
					String first = firstSegment(path);
					if (!first.isEmpty()) {
						found.add(first);
					}
				}
			}
		}
		this.segments = Collections.unmodifiableSet(found);
	}

	/** "/san-pham/{slug}" → "san-pham"; "/" → "". */
	static String firstSegment(String path) {
		String trimmed = path.startsWith("/") ? path.substring(1) : path;
		int slash = trimmed.indexOf('/');
		return slash < 0 ? trimmed : trimmed.substring(0, slash);
	}

	/** Whether a page at this path would collide with a fixed route (only its first segment matters). */
	public boolean isReserved(String path) {
		return segments.contains(firstSegment(path));
	}

	public Set<String> segments() {
		return segments;
	}
}
