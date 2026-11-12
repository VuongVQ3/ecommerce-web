package com.nutshop.content;

import com.nutshop.user.Role;

import java.util.Set;

/**
 * Who may do what in the Author environment: the single source of these rules for the backend (controllers check
 * them, and GET /api/author/session hands them to the frontend so it never derives them from the role itself).
 * <p>
 * To let STAFF publish, add {@code Role.STAFF} to {@link #PUBLISHERS}.
 */
public final class ContentPermissions {

	/** Open /author, write drafts, upload, preview. */
	private static final Set<Role> AUTHORS = Set.of(Role.STAFF, Role.ADMIN);

	/** Publish and unpublish. */
	private static final Set<Role> PUBLISHERS = Set.of(Role.ADMIN);

	/** Delete content. */
	private static final Set<Role> DELETERS = Set.of(Role.ADMIN);

	/** Create and change content models (the structure of Content Fragments). */
	private static final Set<Role> MODEL_MANAGERS = Set.of(Role.ADMIN);

	private ContentPermissions() {
	}

	public static boolean canAuthor(Role role) {
		return role != null && AUTHORS.contains(role);
	}

	public static boolean canPublish(Role role) {
		return role != null && PUBLISHERS.contains(role);
	}

	public static boolean canDelete(Role role) {
		return role != null && DELETERS.contains(role);
	}

	public static boolean canManageModels(Role role) {
		return role != null && MODEL_MANAGERS.contains(role);
	}
}
