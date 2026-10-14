package com.nutshop.security;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;

import java.io.IOException;

/** Writes RFC 9457 problem responses from servlet filters, matching what controllers return. */
public final class ProblemResponses {

	private ProblemResponses() {
	}

	public static void write(HttpServletResponse response, HttpStatus status, String detail) throws IOException {
		write(response, status, detail, null);
	}

	/** With a machine-readable {@code code} (e.g. PASSWORD_CHANGE_REQUIRED) the frontend can react to. */
	public static void write(HttpServletResponse response, HttpStatus status, String detail, String code)
			throws IOException {
		response.setStatus(status.value());
		response.setCharacterEncoding("UTF-8");
		response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
		response.getWriter()
			.write("{\"type\":\"about:blank\",\"title\":\"" + json(status.getReasonPhrase()) + "\",\"status\":"
					+ status.value() + ",\"detail\":\"" + json(detail) + "\",\"message\":\"" + json(detail) + "\""
					+ (code == null ? "" : ",\"code\":\"" + json(code) + "\"") + "}");
	}

	private static String json(String value) {
		return value.replace("\\", "\\\\").replace("\"", "\\\"");
	}
}
