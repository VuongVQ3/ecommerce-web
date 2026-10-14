package com.nutshop.admin;

import com.nutshop.audit.AuditLog;
import com.nutshop.auth.RefreshTokenService;
import com.nutshop.auth.StaffInvitationService;
import com.nutshop.common.ApiException;
import com.nutshop.common.PageResponse;
import com.nutshop.order.Order;
import com.nutshop.order.OrderRepository;
import com.nutshop.user.PhoneNumbers;
import com.nutshop.user.Role;
import com.nutshop.user.User;
import com.nutshop.user.UserRepository;
import com.nutshop.user.UserStatusCache;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Accounts, for ADMIN only. Roles can only move between CUSTOMER and STAFF here (admins come from ADMIN_EMAIL);
 * nobody can change or lock their own account, and the last active admin can never be locked. Every change needs a
 * reason and is audited.
 */
@Service
public class AdminUserService {

	/**
	 * @param invitationPending staff invited but no password set yet
	 * @param spent Σ total of COMPLETED orders
	 */
	public record UserRow(UUID id, String fullName, String email, String phone, Role role, boolean active,
			boolean emailVerified, boolean invitationPending, long orderCount, long spent, Instant createdAt) {
	}

	public record UserOrder(String code, String status, String statusLabel, Instant createdAt, long total) {
	}

	public record UserDetail(UserRow user, List<UserOrder> orders) {
	}

	public record AuditRow(UUID id, Instant createdAt, UUID actorId, String actorName, String actorEmail, String action,
			String entityType, String entityId, String before, String after) {
	}

	public record Actor(UUID id, String name, String email) {
	}

	private static final String USER_COLUMNS = """
			SELECT u.id, u.full_name, u.email, u.phone, u.role, u.is_active, u.email_verified_at IS NOT NULL AS verified,
			       (u.password_hash IS NULL AND u.google_id IS NULL) AS pending, u.created_at,
			       COUNT(o.id) AS order_count,
			       COALESCE(SUM(o.total) FILTER (WHERE o.status = 'COMPLETED'), 0) AS spent
			FROM users u LEFT JOIN orders o ON o.user_id = u.id
			""";

	private static final RowMapper<UserRow> USER_ROW = (rs, n) -> new UserRow(rs.getObject("id", UUID.class),
			rs.getString("full_name"), rs.getString("email"), rs.getString("phone"), Role.valueOf(rs.getString("role")),
			rs.getBoolean("is_active"), rs.getBoolean("verified"), rs.getBoolean("pending"), rs.getLong("order_count"),
			rs.getLong("spent"), rs.getTimestamp("created_at").toInstant());

	private final JdbcTemplate jdbc;
	private final UserRepository users;
	private final OrderRepository orders;
	private final RefreshTokenService refreshTokens;
	private final StaffInvitationService invitations;
	private final UserStatusCache statuses;
	private final AuditLog audit;

	public AdminUserService(JdbcTemplate jdbc, UserRepository users, OrderRepository orders,
			RefreshTokenService refreshTokens, StaffInvitationService invitations, UserStatusCache statuses,
			AuditLog audit) {
		this.jdbc = jdbc;
		this.users = users;
		this.orders = orders;
		this.refreshTokens = refreshTokens;
		this.invitations = invitations;
		this.statuses = statuses;
		this.audit = audit;
	}

	// ---- reading ------------------------------------------------------------------------------------------------

	@Transactional(readOnly = true)
	public PageResponse<UserRow> list(String q, Role role, Boolean active, int page, int size) {
		List<String> where = new ArrayList<>();
		List<Object> args = new ArrayList<>();
		if (StringUtils.hasText(q)) {
			String term = "%" + q.trim().toLowerCase(Locale.ROOT).replaceAll("[%_]", "") + "%";
			String phone = PhoneNumbers.normalize(q.trim());
			String digits = phone != null ? phone.replaceAll("\\D", "") : "";
			where.add("(lower(u.full_name) LIKE ? OR lower(u.email) LIKE ?" + (digits.length() >= 3 ? " OR u.phone LIKE ?" : "") + ")");
			args.add(term);
			args.add(term);
			if (digits.length() >= 3) {
				args.add("%" + digits + "%");
			}
		}
		if (role != null) {
			where.add("u.role = ?");
			args.add(role.name());
		}
		if (active != null) {
			where.add("u.is_active = ?");
			args.add(active);
		}
		String filter = where.isEmpty() ? "" : " WHERE " + String.join(" AND ", where);
		long total = jdbc.queryForObject("SELECT COUNT(*) FROM users u" + filter, Long.class, args.toArray());
		int pageSize = Math.clamp(size, 1, 100);
		int pageNo = Math.max(page, 0);
		List<Object> pageArgs = new ArrayList<>(args);
		pageArgs.add(pageSize);
		pageArgs.add((long) pageNo * pageSize);
		List<UserRow> rows = jdbc.query(USER_COLUMNS + filter + " GROUP BY u.id ORDER BY u.created_at DESC LIMIT ? OFFSET ?",
				USER_ROW, pageArgs.toArray());
		return new PageResponse<>(rows, pageNo, pageSize, total, (int) ((total + pageSize - 1) / pageSize));
	}

	@Transactional(readOnly = true)
	public UserDetail detail(UUID id) {
		UserRow row = row(id);
		List<UserOrder> list = orders.findByUserIdOrderByCreatedAtDesc(id, PageRequest.of(0, 100))
			.map(AdminUserService::order)
			.getContent();
		return new UserDetail(row, list);
	}

	// ---- changes ------------------------------------------------------------------------------------------------

	/** CUSTOMER ↔ STAFF only. */
	@Transactional
	public UserRow changeRole(UUID id, Role role, String reason, UUID actorId) {
		requireReason(reason);
		if (role != Role.CUSTOMER && role != Role.STAFF) {
			throw conflict("ROLE_NOT_ALLOWED", "Chỉ đổi được giữa Khách hàng và Nhân viên");
		}
		User user = target(id, actorId);
		if (user.getRole() == Role.ADMIN) {
			throw conflict("ROLE_NOT_ALLOWED", "Không đổi được role của quản trị viên ở đây");
		}
		if (user.getRole() == role) {
			throw conflict("ROLE_UNCHANGED", "Tài khoản đã có role này");
		}
		Role before = user.getRole();
		user.changeRole(role);
		users.flush();
		statuses.evict(id);
		audit.record(actorId, "USER_ROLE_CHANGED", "USER", id, Map.of("role", before.name()),
				Map.of("role", role.name(), "reason", reason.trim()));
		return row(id);
	}

	/** Locking signs the account out everywhere: refresh tokens are revoked and old access tokens stop working. */
	@Transactional
	public UserRow setActive(UUID id, boolean active, String reason, UUID actorId) {
		requireReason(reason);
		User user = target(id, actorId);
		if (user.isActive() == active) {
			throw conflict("STATUS_UNCHANGED", active ? "Tài khoản đang hoạt động" : "Tài khoản đã bị khoá");
		}
		if (!active && user.getRole() == Role.ADMIN && users.countByRoleAndActiveTrue(Role.ADMIN) <= 1) {
			throw conflict("LAST_ADMIN", "Không thể khoá quản trị viên cuối cùng đang hoạt động");
		}
		user.setActive(active);
		users.flush();
		if (!active) {
			refreshTokens.revokeAll(id);
		}
		statuses.evict(id);
		audit.record(actorId, active ? "USER_UNLOCKED" : "USER_LOCKED", "USER", id, Map.of("active", !active),
				Map.of("active", active, "reason", reason.trim()));
		return row(id);
	}

	@Transactional
	public UserRow inviteStaff(String fullName, String email, String reason, UUID actorId) {
		requireReason(reason);
		return row(invitations.invite(fullName, email, reason, actorId).getId());
	}

	// ---- audit log ----------------------------------------------------------------------------------------------

	@Transactional(readOnly = true)
	public PageResponse<AuditRow> auditLog(UUID actor, String entityType, LocalDate from, LocalDate to, int page,
			int size) {
		List<String> where = new ArrayList<>();
		List<Object> args = new ArrayList<>();
		if (actor != null) {
			where.add("a.actor_id = ?");
			args.add(actor);
		}
		if (StringUtils.hasText(entityType)) {
			where.add("a.entity_type = ?");
			args.add(entityType.trim().toUpperCase(Locale.ROOT));
		}
		if (from != null) {
			where.add("a.created_at >= ?");
			args.add(Timestamp.from(from.atStartOfDay(VIETNAM).toInstant()));
		}
		if (to != null) {
			where.add("a.created_at < ?");
			args.add(Timestamp.from(to.plusDays(1).atStartOfDay(VIETNAM).toInstant()));
		}
		String filter = where.isEmpty() ? "" : " WHERE " + String.join(" AND ", where);
		long total = jdbc.queryForObject("SELECT COUNT(*) FROM audit_logs a" + filter, Long.class, args.toArray());
		int pageSize = Math.clamp(size, 1, 100);
		int pageNo = Math.max(page, 0);
		List<Object> pageArgs = new ArrayList<>(args);
		pageArgs.add(pageSize);
		pageArgs.add((long) pageNo * pageSize);
		List<AuditRow> rows = jdbc.query("""
				SELECT a.id, a.created_at, a.actor_id, u.full_name, u.email, a.action, a.entity_type, a.entity_id,
				       a.before::text AS before_json, a.after::text AS after_json
				FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id""" + filter
				+ " ORDER BY a.created_at DESC LIMIT ? OFFSET ?",
				(rs, n) -> new AuditRow(rs.getObject("id", UUID.class), rs.getTimestamp("created_at").toInstant(),
						rs.getObject("actor_id", UUID.class), rs.getString("full_name"), rs.getString("email"),
						rs.getString("action"), rs.getString("entity_type"), rs.getString("entity_id"),
						rs.getString("before_json"), rs.getString("after_json")),
				pageArgs.toArray());
		return new PageResponse<>(rows, pageNo, pageSize, total, (int) ((total + pageSize - 1) / pageSize));
	}

	/** People who appear in the audit log, for the filter. */
	@Transactional(readOnly = true)
	public List<Actor> auditActors() {
		return jdbc.query("""
				SELECT DISTINCT u.id, u.full_name, u.email FROM audit_logs a JOIN users u ON u.id = a.actor_id
				ORDER BY u.full_name""", (rs, n) -> new Actor(rs.getObject("id", UUID.class), rs.getString("full_name"),
				rs.getString("email")));
	}

	// ---- helpers ------------------------------------------------------------------------------------------------

	private static final java.time.ZoneId VIETNAM = java.time.ZoneId.of("Asia/Ho_Chi_Minh");

	private UserRow row(UUID id) {
		List<UserRow> rows = jdbc.query(USER_COLUMNS + " WHERE u.id = ? GROUP BY u.id", USER_ROW, id);
		if (rows.isEmpty()) {
			throw new ApiException(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "Không tìm thấy tài khoản");
		}
		return rows.getFirst();
	}

	/** The account to change; never the admin's own. */
	private User target(UUID id, UUID actorId) {
		if (id.equals(actorId)) {
			throw conflict("SELF_CHANGE", "Không thể tự đổi role hoặc tự khoá tài khoản của chính mình");
		}
		return users.findById(id)
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "Không tìm thấy tài khoản"));
	}

	private static UserOrder order(Order o) {
		return new UserOrder(o.getCode(), o.getStatus().name(), o.getStatus().label(), o.getCreatedAt(), o.getTotal());
	}

	private static void requireReason(String reason) {
		if (!StringUtils.hasText(reason)) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "REASON_REQUIRED", "Vui lòng nhập lý do");
		}
	}

	private static ApiException conflict(String code, String message) {
		return new ApiException(HttpStatus.CONFLICT, code, message);
	}
}
