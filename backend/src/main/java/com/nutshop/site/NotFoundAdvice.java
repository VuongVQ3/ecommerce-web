package com.nutshop.site;

import com.nutshop.content.site.CmsPages;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * Nothing matched the request: the API answers with a JSON problem, a missing file (anything with an extension) with
 * a short text 404, and every other path is looked up among the CMS pages (CmsPages: a published page, a 301 from an
 * old path, or the app's "page not found" screen with a real 404 status).
 */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
public class NotFoundAdvice {

	private final HtmlPages pages;
	private final CmsPages cmsPages;

	public NotFoundAdvice(HtmlPages pages, CmsPages cmsPages) {
		this.pages = pages;
		this.cmsPages = cmsPages;
	}

	@ExceptionHandler(NoResourceFoundException.class)
	public ResponseEntity<?> notFound(HttpServletRequest request) {
		String path = request.getRequestURI();
		if (path.startsWith("/api/") || path.equals("/api") || path.startsWith("/actuator")) {
			ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, "Không tìm thấy địa chỉ API này");
			problem.setProperty("code", "NOT_FOUND");
			return ResponseEntity.status(HttpStatus.NOT_FOUND).contentType(MediaType.APPLICATION_PROBLEM_JSON).body(problem);
		}
		String last = path.substring(path.lastIndexOf('/') + 1);
		if (last.contains(".")) {
			return ResponseEntity.status(HttpStatus.NOT_FOUND).contentType(MediaType.TEXT_PLAIN).body("Not found");
		}
		// A CMS page (or an old path of one), else the app's "page not found"
		if ("GET".equals(request.getMethod()) || "HEAD".equals(request.getMethod())) {
			return cmsPages.respond(request);
		}
		return pages.notFound(path);
	}
}
