package com.nutshop.content;

import com.nutshop.auth.TokenService;
import com.nutshop.security.Roles;
import com.nutshop.user.Role;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** The Author environment (/author): STAFF and ADMIN (also enforced by SecurityConfig for /api/author/**). */
@RestController
@RequestMapping("/api/author")
@Roles({ Role.STAFF, Role.ADMIN })
public class AuthorController {

	/** Modules of the Author environment, in menu order. */
	static final List<String> MODULES = List.of("sites", "assets", "fragments");

	/** What the signed-in user may do; the frontend shows or hides actions from this, never from the role. */
	public record AuthorSession(Role role, boolean canPublish, boolean canDelete, boolean canManageModels,
			List<String> modules) {
	}

	@GetMapping("/session")
	public AuthorSession session(@AuthenticationPrincipal Jwt jwt) {
		Role role = Role.valueOf(jwt.getClaimAsString(TokenService.ROLE_CLAIM));
		return new AuthorSession(role, ContentPermissions.canPublish(role), ContentPermissions.canDelete(role),
				ContentPermissions.canManageModels(role), MODULES);
	}
}
