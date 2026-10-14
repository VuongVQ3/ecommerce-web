package com.nutshop.order;

import com.nutshop.audit.AuditLog;
import com.nutshop.common.ApiException;
import com.nutshop.common.PageResponse;
import com.nutshop.order.PhoneFlag.Level;
import com.nutshop.user.PhoneNumbers;
import com.nutshop.user.Role;
import com.nutshop.user.UserRepository;
import com.nutshop.user.UserStatusCache;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Flags on customers' phone numbers (normalized 0xxxxxxxxx). STAFF may see flags and add WATCH; only ADMIN may block
 * cash on delivery (BLOCK_COD), change an existing flag or remove one. Every change needs a reason and is audited.
 */
@Service
public class PhoneFlagService {

	public record FlagView(String phone, Level level, String reason, Instant createdAt, Instant updatedAt,
			String updatedByName) {
	}

	/**
	 * Order history of a phone number, for the order page.
	 *
	 * @param totalOrders all orders with this number, including the one being looked at
	 * @param previousOrders orders placed before the one being looked at ("Khách mới" when 0)
	 * @param firstOrderAt the earliest OTHER order (never the current one)
	 */
	public record CustomerStats(String phone, long totalOrders, long previousOrders, long completed, long cancelled,
			long refusedDelivery, Instant firstOrderAt, FlagView flag) {
	}

	private final PhoneFlagRepository flags;
	private final UserRepository users;
	private final UserStatusCache statuses;
	private final AuditLog audit;
	private final JdbcTemplate jdbc;
	private final Clock clock;

	public PhoneFlagService(PhoneFlagRepository flags, UserRepository users, UserStatusCache statuses, AuditLog audit,
			JdbcTemplate jdbc, Clock clock) {
		this.flags = flags;
		this.users = users;
		this.statuses = statuses;
		this.audit = audit;
		this.jdbc = jdbc;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public boolean isCodBlocked(String normalizedPhone) {
		return flags.findByPhone(normalizedPhone).map(f -> f.getLevel() == Level.BLOCK_COD).orElse(false);
	}

	@Transactional(readOnly = true)
	public Map<String, PhoneFlag> findAll(Collection<String> phones) {
		if (phones.isEmpty()) {
			return Map.of();
		}
		return flags.findByPhoneIn(new HashSet<>(phones))
			.stream()
			.collect(Collectors.toMap(PhoneFlag::getPhone, Function.identity()));
	}

	@Transactional(readOnly = true)
	public PageResponse<FlagView> list(Level level, String q, int page, int size) {
		String digits = q == null ? "" : q.replaceAll("\\D", "");
		String needle = digits.startsWith("84") && digits.length() > 9 ? "0" + digits.substring(2) : digits;
		var pageable = PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, 100), Sort.by(Sort.Direction.DESC, "updatedAt"));
		var result = level == null ? flags.findByPhoneContaining(needle, pageable)
				: flags.findByLevelAndPhoneContaining(level, needle, pageable);
		Map<UUID, String> names = names(result.getContent().stream().map(PhoneFlag::getUpdatedBy).toList());
		return PageResponse.from(result.map(f -> view(f, names)));
	}

	@Transactional(readOnly = true)
	public CustomerStats stats(String rawPhone, String excludeOrderCode) {
		String phone = normalizeOrThrow(rawPhone);
		String exclude = excludeOrderCode == null ? "" : excludeOrderCode.trim().toUpperCase();
		return jdbc.queryForObject("""
				WITH current_order AS (SELECT created_at FROM orders WHERE code = ?)
				SELECT COUNT(*) AS total,
				       COUNT(*) FILTER (WHERE o.created_at < COALESCE((SELECT created_at FROM current_order), 'infinity')) AS previous,
				       COUNT(*) FILTER (WHERE o.status = 'COMPLETED') AS completed,
				       COUNT(*) FILTER (WHERE o.status = 'CANCELLED') AS cancelled,
				       COUNT(*) FILTER (WHERE o.cancel_reason_code = 'REFUSED_DELIVERY') AS refused,
				       MIN(o.created_at) FILTER (WHERE o.code <> ?) AS first_at
				FROM orders o WHERE o.phone = ?""", (rs, n) -> {
			Timestamp first = rs.getTimestamp("first_at");
			return new CustomerStats(phone, rs.getLong("total"), rs.getLong("previous"), rs.getLong("completed"),
					rs.getLong("cancelled"), rs.getLong("refused"), first == null ? null : first.toInstant(),
					get(phone).orElse(null));
		}, exclude, exclude, phone);
	}

	@Transactional(readOnly = true)
	public Optional<FlagView> get(String phone) {
		return flags.findByPhone(phone).map(f -> view(f, names(List.of(f.getUpdatedBy()))));
	}

	/** Adds or changes the flag of a number. */
	@Transactional
	public FlagView set(String rawPhone, Level level, String reason, UUID actorId) {
		String phone = normalizeOrThrow(rawPhone);
		requireReason(reason);
		boolean admin = isAdmin(actorId);
		Optional<PhoneFlag> existing = flags.findByPhone(phone);
		if (!admin && (level != Level.WATCH || existing.isPresent())) {
			throw forbidden(existing.isPresent() ? "Chỉ quản trị viên mới sửa được đánh dấu đã có"
					: "Chỉ quản trị viên mới chặn được thanh toán khi nhận hàng");
		}
		Instant now = clock.instant();
		Map<String, String> before = existing.map(f -> Map.of("level", f.getLevel().name(), "reason", f.getReason()))
			.orElse(null);
		PhoneFlag flag = existing.orElseGet(() -> new PhoneFlag(phone, level, reason.trim(), actorId, now));
		flag.update(level, reason.trim(), actorId, now);
		flags.saveAndFlush(flag);
		audit.record(actorId, existing.isPresent() ? "PHONE_FLAG_UPDATED" : "PHONE_FLAG_CREATED", "PHONE", phone, before,
				Map.of("level", level.name(), "reason", reason.trim()));
		return view(flag, names(List.of(actorId)));
	}

	@Transactional
	public void remove(String rawPhone, String reason, UUID actorId) {
		String phone = normalizeOrThrow(rawPhone);
		requireReason(reason);
		if (!isAdmin(actorId)) {
			throw forbidden("Chỉ quản trị viên mới gỡ được đánh dấu");
		}
		PhoneFlag flag = flags.findByPhone(phone)
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "FLAG_NOT_FOUND", "Số điện thoại này chưa bị đánh dấu"));
		flags.delete(flag);
		audit.record(actorId, "PHONE_FLAG_REMOVED", "PHONE", phone,
				Map.of("level", flag.getLevel().name(), "reason", flag.getReason()), Map.of("reason", reason.trim()));
	}

	private boolean isAdmin(UUID actorId) {
		// The current role (not the one in a possibly older access token)
		return statuses.get(actorId).map(s -> s.role() == Role.ADMIN).orElse(false);
	}

	private Map<UUID, String> names(Collection<UUID> ids) {
		Set<UUID> wanted = ids.stream().filter(Objects::nonNull).collect(Collectors.toSet());
		Map<UUID, String> names = new HashMap<>();
		users.findAllById(wanted).forEach(u -> names.put(u.getId(), u.getFullName()));
		return names;
	}

	private static FlagView view(PhoneFlag f, Map<UUID, String> names) {
		return new FlagView(f.getPhone(), f.getLevel(), f.getReason(), f.getCreatedAt(), f.getUpdatedAt(),
				f.getUpdatedBy() == null ? null : names.get(f.getUpdatedBy()));
	}

	private static String normalizeOrThrow(String raw) {
		String phone = PhoneNumbers.normalize(raw);
		if (!PhoneNumbers.isValid(phone)) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PHONE", "Số điện thoại không hợp lệ");
		}
		return phone;
	}

	private static void requireReason(String reason) {
		if (!StringUtils.hasText(reason)) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "REASON_REQUIRED", "Vui lòng nhập lý do");
		}
	}

	private static ApiException forbidden(String message) {
		return new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", message);
	}
}
