package com.nutshop.auth;

import java.util.UUID;

/**
 * Called in the same transaction when an account's email becomes verified. Implemented outside the auth package
 * (OrderClaimService attaches the guest orders placed with that email), so auth does not depend on orders.
 */
public interface VerifiedEmailHook {

	/** @return how many items were attached to the account (shown to the user) */
	int onEmailVerified(UUID userId, String email);
}
