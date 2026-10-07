package com.nutshop.common;

import org.springframework.http.HttpStatus;

/**
 * An error with a machine-readable {@code code} (e.g. EMAIL_EXISTS) that the frontend can react to, besides the
 * Vietnamese {@code detail} shown to users. Rendered as a problem response with a "code" property.
 */
public class ApiException extends RuntimeException {

	private final HttpStatus status;
	private final String code;

	public ApiException(HttpStatus status, String code, String message) {
		super(message);
		this.status = status;
		this.code = code;
	}

	public HttpStatus getStatus() {
		return status;
	}

	public String getCode() {
		return code;
	}
}
