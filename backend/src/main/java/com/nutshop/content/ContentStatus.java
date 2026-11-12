package com.nutshop.content;

/**
 * Publication state of a CMS item. Author and Publish share this service: the draft is what authors edit, the
 * published version is what visitors see. Not used yet (declared for the Sites, Assets and Content Fragments phases).
 */
public enum ContentStatus {
	/** Never published: only visible in the Author environment and through preview links. */
	DRAFT,
	/** Published, and the draft is identical to the live version. */
	PUBLISHED,
	/**
	 * Published, but the draft has been edited since: visitors still see the last published version until the
	 * draft is published again.
	 */
	MODIFIED
}
