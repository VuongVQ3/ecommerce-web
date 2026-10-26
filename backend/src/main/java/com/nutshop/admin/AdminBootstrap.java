package com.nutshop.admin;

import com.nutshop.audit.AuditLog;
import com.nutshop.user.Role;
import com.nutshop.user.User;
import com.nutshop.user.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.Locale;
import java.util.Map;

/**
 * First administrator: on startup, if ADMIN_EMAIL is set, the EXISTING account with that email is promoted to
 * ADMIN. Nothing is created and no password lives in code or config: sign up normally first, then set the
 * variable and restart. The new role reaches the browser on the next token refresh (at most 15 minutes) or login.
 */
@Component
public class AdminBootstrap implements ApplicationRunner {

	private static final Logger log = LoggerFactory.getLogger(AdminBootstrap.class);

	private final UserRepository users;
	private final AuditLog audit;
	private final String adminEmail;

	public AdminBootstrap(UserRepository users, AuditLog audit, @Value("${app.admin-email:}") String adminEmail) {
		this.users = users;
		this.audit = audit;
		this.adminEmail = adminEmail;
	}

	@Override
	@Transactional
	public void run(ApplicationArguments args) {
		if (!StringUtils.hasText(adminEmail)) {
			return;
		}
		String email = adminEmail.trim().toLowerCase(Locale.ROOT);
		User user = users.findByEmail(email).orElse(null);
		if (user == null) {
			log.warn("ADMIN_EMAIL is set but no account uses that email yet: sign up with it, then restart");
			return;
		}
		if (user.getRole() == Role.ADMIN) {
			return;
		}
		if (!user.isEmailVerified() || !user.isActive()) {
			log.warn("ADMIN_EMAIL account {} is not verified/active; not promoting to ADMIN until its owner proves the email",
					user.getId());
			return;
		}
		Role previous = user.getRole();
		user.changeRole(Role.ADMIN);
		audit.entry("USER_PROMOTED", "USER", user.getId(), AuditLog.userLabel(user.getFullName(), user.getEmail()))
			.by(null)
			.changes(Map.of("role", previous), Map.of("role", Role.ADMIN))
			.record();
		log.info("Promoted user {} to ADMIN (ADMIN_EMAIL)", user.getId());
	}
}
