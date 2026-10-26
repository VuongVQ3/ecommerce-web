package com.nutshop.admin;

import com.nutshop.audit.AuditLog;
import com.nutshop.user.Role;
import com.nutshop.user.User;
import com.nutshop.user.UserRepository;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.RETURNS_DEEP_STUBS;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Regression for run-2 lead 5: ADMIN_EMAIL used to promote whatever account held the address, even an unverified one
 * an attacker could have registered first. Promotion now requires a verified, active account.
 */
class AdminBootstrapTest {

	private final UserRepository users = mock(UserRepository.class);
	private final AuditLog audit = mock(AuditLog.class, RETURNS_DEEP_STUBS);

	@Test
	void doesNotPromoteAnUnverifiedAccount() {
		User user = new User("admin@shop.test", "hash", "Admin", null, Instant.now()); // unverified
		when(users.findByEmail("admin@shop.test")).thenReturn(Optional.of(user));

		new AdminBootstrap(users, audit, "admin@shop.test").run(null);

		assertThat(user.getRole()).as("unverified account must not be promoted").isEqualTo(Role.CUSTOMER);
		verify(audit, never()).entry(any(), any(), any(), any());
	}

	@Test
	void promotesAVerifiedActiveAccount() {
		User user = new User("admin@shop.test", "hash", "Admin", null, Instant.now());
		user.markEmailVerified(Instant.now());
		when(users.findByEmail("admin@shop.test")).thenReturn(Optional.of(user));

		new AdminBootstrap(users, audit, "admin@shop.test").run(null);

		assertThat(user.getRole()).isEqualTo(Role.ADMIN);
	}
}
