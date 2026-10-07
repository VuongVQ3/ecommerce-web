package com.nutshop.common;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

	@ExceptionHandler(NotFoundException.class)
	ProblemDetail handleNotFound(NotFoundException ex) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
	}

	/** Covers ConflictException too. The optional "code" lets the frontend react to specific errors. */
	@ExceptionHandler(ApiException.class)
	ProblemDetail handleApi(ApiException ex) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(ex.getStatus(), ex.getMessage());
		if (ex.getCode() != null) {
			problem.setProperty("code", ex.getCode());
		}
		return problem;
	}

	@ExceptionHandler(BadCredentialsException.class)
	ProblemDetail handleBadCredentials(BadCredentialsException ex) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, "Email hoặc mật khẩu không đúng");
	}

	@ExceptionHandler(UnauthorizedException.class)
	ProblemDetail handleUnauthorized(UnauthorizedException ex) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, ex.getMessage());
	}

	/** Malformed or non-JSON request body. */
	@ExceptionHandler(HttpMessageNotReadableException.class)
	ProblemDetail handleUnreadable(HttpMessageNotReadableException ex) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Dữ liệu gửi lên không đúng định dạng");
	}

	/** Unique constraint hit by a concurrent request that slipped past the service-level checks. */
	@ExceptionHandler(DataIntegrityViolationException.class)
	ProblemDetail handleDataIntegrity(DataIntegrityViolationException ex) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "Dữ liệu đã tồn tại, vui lòng kiểm tra lại");
	}

	@ExceptionHandler(ResponseStatusException.class)
	ProblemDetail handleResponseStatus(ResponseStatusException ex) {
		return ProblemDetail.forStatusAndDetail(ex.getStatusCode(), ex.getReason());
	}

	@ExceptionHandler(MethodArgumentNotValidException.class)
	ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
		Map<String, String> errors = new LinkedHashMap<>();
		ex.getBindingResult().getFieldErrors().forEach(e -> errors.putIfAbsent(e.getField(), e.getDefaultMessage()));
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Dữ liệu không hợp lệ");
		problem.setProperty("errors", errors);
		return problem;
	}
}
