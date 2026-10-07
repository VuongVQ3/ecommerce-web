package com.nutshop.common;

import org.springframework.http.HttpStatus;

/** 409. Pass a {@code code} (e.g. EMAIL_EXISTS) when the frontend needs to react to this specific conflict. */
public class ConflictException extends ApiException {

	public ConflictException(String message) {
		this(null, message);
	}

	public ConflictException(String code, String message) {
		super(HttpStatus.CONFLICT, code, message);
	}
}
