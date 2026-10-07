package com.nutshop.security;

import com.nutshop.user.Role;
import org.aopalliance.intercept.MethodInvocation;
import org.springframework.aop.Advisor;
import org.springframework.aop.support.AopUtils;
import org.springframework.aop.support.ComposablePointcut;
import org.springframework.aop.support.annotation.AnnotationMatchingPointcut;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.security.authorization.AuthorityAuthorizationManager;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.authorization.method.AuthorizationInterceptorsOrder;
import org.springframework.security.authorization.method.AuthorizationManagerBeforeMethodInterceptor;

import java.lang.reflect.Method;
import java.util.Arrays;

/**
 * Enforces {@link Roles}. Done with a dedicated interceptor rather than a {@code @PreAuthorize} template, because
 * expression templates paste enum values unquoted ({@code hasAnyRole(STAFF,ADMIN)}), which SpEL cannot evaluate.
 */
@Configuration(proxyBeanMethods = false)
public class RolesAuthorizationConfig {

	@Bean
	@org.springframework.context.annotation.Role(BeanDefinition.ROLE_INFRASTRUCTURE)
	static Advisor rolesAuthorizationAdvisor() {
		var pointcut = new ComposablePointcut(AnnotationMatchingPointcut.forClassAnnotation(Roles.class))
			.union(AnnotationMatchingPointcut.forMethodAnnotation(Roles.class));
		AuthorizationManager<MethodInvocation> manager = (authentication, invocation) -> {
			String[] roles = Arrays.stream(findRoles(invocation).value()).map(Role::name).toArray(String[]::new);
			return AuthorityAuthorizationManager.<MethodInvocation>hasAnyRole(roles).authorize(authentication, invocation);
		};
		var interceptor = new AuthorizationManagerBeforeMethodInterceptor(pointcut, manager);
		interceptor.setOrder(AuthorizationInterceptorsOrder.PRE_AUTHORIZE.getOrder());
		return interceptor;
	}

	private static Roles findRoles(MethodInvocation invocation) {
		Class<?> targetClass = invocation.getThis() != null ? AopUtils.getTargetClass(invocation.getThis())
				: invocation.getMethod().getDeclaringClass();
		Method method = AopUtils.getMostSpecificMethod(invocation.getMethod(), targetClass);
		Roles roles = AnnotatedElementUtils.findMergedAnnotation(method, Roles.class);
		if (roles == null) {
			roles = AnnotatedElementUtils.findMergedAnnotation(targetClass, Roles.class);
		}
		if (roles == null) {
			throw new IllegalStateException("@Roles not found on " + method);
		}
		return roles;
	}
}
