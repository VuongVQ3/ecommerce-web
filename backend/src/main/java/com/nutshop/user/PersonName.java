package com.nutshop.user;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.util.regex.Pattern;

/**
 * A person's name (sign-up, checkout, account from an order, staff invitation): after trimming 2–60 characters,
 * letters (any language, with their accents), spaces, apostrophes, dots and hyphens only, and at least one letter.
 * Null/blank passes: pair with @NotBlank when required. Same rule as the frontend's personName (auth/schemas.ts).
 */
@Documented
@Constraint(validatedBy = PersonName.Validator.class)
@Target({ ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT })
@Retention(RetentionPolicy.RUNTIME)
public @interface PersonName {

	String MESSAGE = "Họ tên không hợp lệ";

	String message() default MESSAGE;

	Class<?>[] groups() default {};

	Class<? extends Payload>[] payload() default {};

	class Validator implements ConstraintValidator<PersonName, String> {

		/** \p{M}: accents typed as separate combining marks (decomposed Vietnamese). */
		private static final Pattern ALLOWED = Pattern.compile("[\\p{L}\\p{M} .'’-]+");

		private static final Pattern HAS_LETTER = Pattern.compile("\\p{L}");

		/** For names that do not come through a request body (e.g. the name on an order). */
		public static boolean valid(String value) {
			if (value == null) {
				return false;
			}
			String name = value.strip();
			int length = name.codePointCount(0, name.length());
			return length >= 2 && length <= 60 && ALLOWED.matcher(name).matches() && HAS_LETTER.matcher(name).find();
		}

		@Override
		public boolean isValid(String value, ConstraintValidatorContext context) {
			return value == null || value.isBlank() || valid(value);
		}
	}
}
