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

/** Optional Vietnamese phone number: blank, or valid after {@link PhoneNumbers#normalize}. */
@Documented
@Constraint(validatedBy = VietnamesePhone.Validator.class)
@Target({ ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT })
@Retention(RetentionPolicy.RUNTIME)
public @interface VietnamesePhone {

	String message() default "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0";

	Class<?>[] groups() default {};

	Class<? extends Payload>[] payload() default {};

	class Validator implements ConstraintValidator<VietnamesePhone, String> {

		@Override
		public boolean isValid(String value, ConstraintValidatorContext context) {
			String normalized = PhoneNumbers.normalize(value);
			return normalized == null || PhoneNumbers.isValid(normalized);
		}
	}
}
