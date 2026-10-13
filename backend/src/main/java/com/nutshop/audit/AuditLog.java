package com.nutshop.audit;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

import java.util.UUID;

/**
 * Append-only record of back-office changes ("who changed what, from what, to what"). Written in the caller's
 * transaction, so a change and its audit row are committed or rolled back together.
 */
@Service
@Transactional(propagation = Propagation.MANDATORY)
public class AuditLog {

	private final JdbcTemplate jdbc;
	private final JsonMapper json;

	public AuditLog(JdbcTemplate jdbc, JsonMapper json) {
		this.jdbc = jdbc;
		this.json = json;
	}

	/**
	 * @param actorId null for system actions (e.g. the startup admin promotion)
	 * @param before / after small snapshot objects (records/maps), stored as jsonb; null when not applicable
	 */
	public void record(UUID actorId, String action, String entityType, Object entityId, Object before, Object after) {
		jdbc.update("""
				INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, before, after)
				VALUES (?, ?, ?, ?, CAST(? AS jsonb), CAST(? AS jsonb))""", actorId, action, entityType,
				String.valueOf(entityId), toJson(before), toJson(after));
	}

	private String toJson(Object value) {
		return value == null ? null : json.writeValueAsString(value);
	}
}
