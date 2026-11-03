package com.nutshop.site;

/**
 * Version of the policy pages (terms of sale + privacy policy) a consent is recorded against: the date of their last
 * change, ISO format. Bump it with POLICY_UPDATED in frontend/src/lib/shopContact.ts whenever the wording in
 * docs/chinh-sach-noi-dung.md changes.
 */
public final class PolicyVersion {

	public static final String CURRENT = "2026-11-03";

	private PolicyVersion() {
	}
}
