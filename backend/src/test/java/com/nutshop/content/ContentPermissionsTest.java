package com.nutshop.content;

import com.nutshop.user.Role;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

/** Every role against every Author permission. */
class ContentPermissionsTest {

	@ParameterizedTest(name = "{0}: author={1} publish={2} delete={3} models={4}")
	@CsvSource({
			"CUSTOMER, false, false, false, false",
			"STAFF,    true,  false, false, false",
			"ADMIN,    true,  true,  true,  true" })
	void rolesAndPermissions(Role role, boolean author, boolean publish, boolean delete, boolean models) {
		assertThat(ContentPermissions.canAuthor(role)).isEqualTo(author);
		assertThat(ContentPermissions.canPublish(role)).isEqualTo(publish);
		assertThat(ContentPermissions.canDelete(role)).isEqualTo(delete);
		assertThat(ContentPermissions.canManageModels(role)).isEqualTo(models);
	}

	@org.junit.jupiter.api.Test
	void noRoleMayDoNothing() {
		assertThat(ContentPermissions.canAuthor(null)).isFalse();
		assertThat(ContentPermissions.canPublish(null)).isFalse();
		assertThat(ContentPermissions.canDelete(null)).isFalse();
		assertThat(ContentPermissions.canManageModels(null)).isFalse();
	}
}
