package com.nutshop.content;

/**
 * The kinds of CMS content managed in the Author environment (/author). Used as {@code target_type} of preview tokens
 * and as the audit log entity type (see {@link ContentAudit}).
 */
public enum ContentType {
	/** An image or PDF in Assets (DAM). */
	ASSET,
	/** A Content Fragment: structured content following a content model. */
	FRAGMENT,
	/** A Sites page built from components. */
	PAGE
}
