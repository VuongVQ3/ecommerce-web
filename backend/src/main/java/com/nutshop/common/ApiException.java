package com.nutshop.common;

import org.springframework.http.HttpStatus;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * An error with a machine-readable {@code code} (e.g. EMAIL_EXISTS) that the frontend can react to, besides the
 * Vietnamese {@code detail} shown to users. Rendered as a problem response with a "code" property, plus any extra
 * properties (e.g. the list of out-of-stock items).
 */
public class ApiException extends RuntimeException {

	private final HttpStatus status;
	private final String code;
	private final Map<String, Object> properties = new LinkedHashMap<>();

	public ApiException(HttpStatus status, String code, String message) {
		super(message);
		this.status = status;
		this.code = code;
	}

	public ApiException withProperty(String name, Object value) {
		properties.put(name, value);
		return this;
	}

	public HttpStatus getStatus() {
		return status;
	}

	public String getCode() {
		return code;
	}

	public Map<String, Object> getProperties() {
		return properties;
	}
}
