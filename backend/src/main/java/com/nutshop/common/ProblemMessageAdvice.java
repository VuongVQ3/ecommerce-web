package com.nutshop.common;

import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

/**
 * Every error body is an RFC 9457 problem with {@code detail}; this also exposes it as {@code message}, so clients
 * can rely on the {@code { code, message }} pair as well. Filters do the same in ProblemResponses.
 */
@RestControllerAdvice
public class ProblemMessageAdvice implements ResponseBodyAdvice<Object> {

	@Override
	public boolean supports(MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converterType) {
		return true;
	}

	@Override
	public Object beforeBodyWrite(Object body, MethodParameter returnType, MediaType contentType,
			Class<? extends HttpMessageConverter<?>> converterType, ServerHttpRequest request,
			ServerHttpResponse response) {
		if (body instanceof ProblemDetail problem && problem.getDetail() != null) {
			problem.setProperty("message", problem.getDetail());
		}
		return body;
	}
}
