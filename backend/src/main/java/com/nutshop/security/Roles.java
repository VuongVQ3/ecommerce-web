package com.nutshop.security;

import com.nutshop.user.Role;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Restricts a controller class or method to users having any of the given roles, e.g.
 * {@code @Roles({Role.STAFF, Role.ADMIN})}. A method-level annotation overrides one on the class. Anonymous callers
 * get 401, signed-in callers without the role get 403. Enforced by {@link RolesAuthorizationConfig}.
 * <p>
 * The role comes from the access token, so a role change applies once the user's access token is refreshed
 * (at most 15 minutes).
 */
@Target({ ElementType.METHOD, ElementType.TYPE })
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface Roles {

	Role[] value();
}
