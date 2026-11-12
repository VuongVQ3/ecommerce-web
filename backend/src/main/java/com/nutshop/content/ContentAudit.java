package com.nutshop.content;

/**
 * Audit log codes for CMS content, shared by Sites, Assets and Content Fragments. The entity type is the
 * {@link ContentType} name ({@code ASSET}, {@code FRAGMENT}, {@code PAGE}). The back office shows them through
 * frontend/src/admin/auditLabels.ts: add a label there for every new code.
 *
 * <pre>
 * audit.entry(ContentAudit.CONTENT_PUBLISHED, ContentAudit.entityType(ContentType.PAGE), id, title).by(actorId).record();
 * </pre>
 */
public final class ContentAudit {

	public static final String CONTENT_CREATED = "CONTENT_CREATED";
	public static final String CONTENT_UPDATED = "CONTENT_UPDATED";
	public static final String CONTENT_PUBLISHED = "CONTENT_PUBLISHED";
	public static final String CONTENT_UNPUBLISHED = "CONTENT_UNPUBLISHED";
	public static final String CONTENT_DELETED = "CONTENT_DELETED";
	public static final String CONTENT_ROLLED_BACK = "CONTENT_ROLLED_BACK";

	private ContentAudit() {
	}

	public static String entityType(ContentType type) {
		return type.name();
	}
}
