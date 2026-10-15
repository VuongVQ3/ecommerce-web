package com.nutshop.audit;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Append-only record of back-office changes ("who changed what, from what, to what"). Written in the caller's
 * transaction, so a change and its audit row are committed or rolled back together.
 *
 * <pre>
 * audit.entry("PRODUCT_UPDATED", "PRODUCT", id, product.getName()).by(actorId).changes(before, after).record();
 * </pre>
 */
@Service
@Transactional(propagation = Propagation.MANDATORY)
public class AuditLog {

	/** Who did it: a back-office account, the customer themselves, or the application. */
	public enum ActorType {
		STAFF, CUSTOMER, SYSTEM
	}

	private final JdbcTemplate jdbc;
	private final JsonMapper json;

	public AuditLog(JdbcTemplate jdbc, JsonMapper json) {
		this.jdbc = jdbc;
		this.json = json;
	}

	/**
	 * @param label what the entity is called right now (product name, order code, "Name (email)", phone number…), so
	 * the log stays readable after a rename or a delete
	 */
	public Entry entry(String action, String entityType, Object entityId, String label) {
		return new Entry(action, entityType, String.valueOf(entityId), label);
	}

	/** "Nguyễn Văn A (a@example.com)" */
	public static String userLabel(String fullName, String email) {
		if (fullName == null || fullName.isBlank()) {
			return email;
		}
		return email == null ? fullName : fullName + " (" + email + ")";
	}

	public final class Entry {

		private final String action;
		private final String entityType;
		private final String entityId;
		private final String label;
		private UUID actorId;
		private ActorType actorType = ActorType.SYSTEM;
		private Object before;
		private Object after;
		private String reasonCode;
		private String reason;

		private Entry(String action, String entityType, String entityId, String label) {
			this.action = action;
			this.entityType = entityType;
			this.entityId = entityId;
			this.label = truncate(label, 255);
		}

		/** A back-office account; null = the application itself (SYSTEM). */
		public Entry by(UUID staffId) {
			this.actorId = staffId;
			this.actorType = staffId == null ? ActorType.SYSTEM : ActorType.STAFF;
			return this;
		}

		/** The customer acting on their own data; {@code userId} is null for a guest (tracking link). */
		public Entry byCustomer(UUID userId) {
			this.actorId = userId;
			this.actorType = ActorType.CUSTOMER;
			return this;
		}

		/**
		 * Snapshots (records/maps) before and after. Only fields whose value changed are stored; a creation
		 * ({@code before} null) stores the non-empty fields of {@code after}; a deletion stores {@code before}.
		 */
		public Entry changes(Object before, Object after) {
			this.before = before;
			this.after = after;
			return this;
		}

		public Entry reason(String reason) {
			return reason(null, reason);
		}

		public Entry reason(String code, String reason) {
			this.reasonCode = code;
			this.reason = reason == null || reason.isBlank() ? null : truncate(reason.trim(), 500);
			return this;
		}

		/** Writes the row, unless it is an update that changed nothing and gives no reason. */
		public void record() {
			ObjectNode b = before == null ? null : (ObjectNode) json.valueToTree(before);
			ObjectNode a = after == null ? null : (ObjectNode) json.valueToTree(after);
			if (b != null && a != null) {
				ObjectNode changedBefore = json.createObjectNode();
				ObjectNode changedAfter = json.createObjectNode();
				for (Map.Entry<String, JsonNode> field : b.properties()) {
					JsonNode now = a.get(field.getKey());
					if (!same(field.getValue(), now == null ? json.nullNode() : now)) {
						changedBefore.set(field.getKey(), field.getValue());
						changedAfter.set(field.getKey(), now == null ? json.nullNode() : now);
					}
				}
				for (Map.Entry<String, JsonNode> field : a.properties()) {
					if (!b.has(field.getKey()) && !field.getValue().isNull()) {
						changedBefore.set(field.getKey(), json.nullNode());
						changedAfter.set(field.getKey(), field.getValue());
					}
				}
				if (changedAfter.isEmpty() && reason == null) {
					return;
				}
				b = changedBefore;
				a = changedAfter;
			}
			else if (a != null) {
				ObjectNode created = json.createObjectNode();
				for (Map.Entry<String, JsonNode> field : a.properties()) {
					if (!field.getValue().isNull()) {
						created.set(field.getKey(), field.getValue());
					}
				}
				a = created;
			}
			jdbc.update("""
					INSERT INTO audit_logs (actor_id, actor_type, action, entity_type, entity_id, entity_label, before, after,
					                        reason_code, reason)
					VALUES (?, ?, ?, ?, ?, ?, CAST(? AS jsonb), CAST(? AS jsonb), ?, ?)""", actorId, actorType.name(), action,
					entityType, entityId, label, b == null ? null : b.toString(), a == null ? null : a.toString(),
					reasonCode, reason);
		}
	}

	/** Numbers compare by value: 500 and 500.00 (a decimal column read back) are the same. */
	private static boolean same(JsonNode x, JsonNode y) {
		if (x.isNumber() && y.isNumber()) {
			return x.decimalValue().compareTo(y.decimalValue()) == 0;
		}
		return Objects.equals(x, y);
	}

	private static String truncate(String s, int max) {
		return s == null || s.length() <= max ? s : s.substring(0, max);
	}
}
