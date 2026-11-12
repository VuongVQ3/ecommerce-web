package com.nutshop.content;

import com.nutshop.auth.TokenService;
import com.nutshop.common.ApiException;
import com.nutshop.user.Role;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;

import java.util.UUID;

/** Who is acting in the Author environment, read from the access token. */
public record AuthorActor(UUID id, Role role) {

	public static AuthorActor of(Jwt jwt) {
		return new AuthorActor(UUID.fromString(jwt.getSubject()), Role.valueOf(jwt.getClaimAsString(TokenService.ROLE_CLAIM)));
	}

	/** 403 unless the role may delete content (see {@link ContentPermissions#canDelete}). */
	public AuthorActor requireDelete() {
		if (!ContentPermissions.canDelete(role)) {
			throw new ApiException(HttpStatus.FORBIDDEN, "CONTENT_DELETE_FORBIDDEN", "Chỉ quản trị viên được xoá nội dung");
		}
		return this;
	}
}
