package com.nutshop.site;

/**
 * Version of the policy pages (terms of sale + privacy policy) a consent is recorded against: the date of their last
 * change, ISO format. The one place to bump whenever the wording in docs/chinh-sach-noi-dung.md changes: /api/site
 * hands it to the frontend, which shows it as the pages' "Cập nhật lần cuối" date.
 */
public final class PolicyVersion {

	public static final String CURRENT = "2026-11-03";

	private PolicyVersion() {
	}
}
