package com.nutshop.site;

/**
 * Version of the policies (terms of sale + privacy policy) a consent is recorded against, ISO date. Bump it only when
 * customers must agree again: an account that agreed to an older version is asked again at checkout. /api/site hands
 * it to the frontend for that check. The pages' "Cập nhật lần cuối" dates are separate (UPDATED in
 * frontend/src/lib/policyDates.ts): a change that asks nothing new of customers moves only a page's date.
 */
public final class PolicyVersion {

	public static final String CURRENT = "2026-11-03";

	private PolicyVersion() {
	}
}
