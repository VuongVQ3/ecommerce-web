package com.nutshop.order;

import com.nutshop.audit.AuditLog;
import com.nutshop.common.ApiException;
import com.nutshop.common.PageResponse;
import com.nutshop.order.OrderDtos.OrderResponse;
import com.nutshop.user.PhoneNumbers;
import com.nutshop.user.User;
import com.nutshop.user.UserRepository;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Back-office order handling for STAFF and ADMIN. Every action locks the order row first and goes through
 * OrderService#transition, so the state machine is enforced and a double click cannot move stock twice.
 */
@Service
public class AdminOrderService {

	public static final ZoneId VIETNAM = ZoneId.of("Asia/Ho_Chi_Minh");

	public enum Action {
		CONFIRM(OrderStatus.CONFIRMED), SHIP(OrderStatus.SHIPPING), COMPLETE(OrderStatus.COMPLETED),
		CANCEL(OrderStatus.CANCELLED);

		final OrderStatus target;

		Action(OrderStatus target) {
			this.target = target;
		}
	}

	/** @param flagLevel / flagReason when the phone number is flagged (warning icon in the list) */
	public record OrderRow(String code, String status, String statusLabel, Instant createdAt, String customerName,
			String phone, int itemCount, long total, String flagLevel, String flagReason) {
	}

	/** How the shop reached the customer before confirming (recorded as an internal note). */
	public enum ContactResult {
		CALLED("Đã gọi điện xác nhận với khách"), ZALO("Đã nhắn Zalo xác nhận với khách"),
		UNREACHABLE("Chưa liên hệ được khách");

		final String note;

		ContactResult(String note) {
			this.note = note;
		}
	}

	public record OrderList(PageResponse<OrderRow> page, long pendingCount) {
	}

	public record NoteResponse(String body, Instant createdAt, String authorName) {
	}

	/**
	 * @param allowedActions what the current status allows, so the UI only shows valid buttons
	 */
	public record AdminOrderDetail(OrderResponse order, boolean guest, String carrier, String trackingNumber,
			List<NoteResponse> notes, List<Action> allowedActions, CancelReason cancelReasonCode) {
	}

	private record AuditView(String status, String carrier, String trackingNumber) {

		static AuditView of(Order o) {
			return new AuditView(o.getStatus().name(), o.getCarrier(), o.getTrackingNumber());
		}
	}

	private final OrderRepository orders;
	private final OrderNoteRepository notes;
	private final OrderService orderService;
	private final UserRepository users;
	private final AuditLog audit;
	private final PhoneFlagService phoneFlags;

	public AdminOrderService(OrderRepository orders, OrderNoteRepository notes, OrderService orderService,
			UserRepository users, AuditLog audit, PhoneFlagService phoneFlags) {
		this.phoneFlags = phoneFlags;
		this.orders = orders;
		this.notes = notes;
		this.orderService = orderService;
		this.users = users;
		this.audit = audit;
	}

	/**
	 * @param from / to inclusive calendar days in Vietnam time
	 * @param q order code (prefix, case-insensitive) or phone number in any common format
	 */
	@Transactional(readOnly = true)
	public OrderList list(OrderStatus status, LocalDate from, LocalDate to, String q, int page, int size) {
		Specification<Order> spec = (root, query, cb) -> {
			List<Predicate> where = new ArrayList<>();
			if (status != null) {
				where.add(cb.equal(root.get("status"), status));
			}
			if (from != null) {
				where.add(cb.greaterThanOrEqualTo(root.get("createdAt"), from.atStartOfDay(VIETNAM).toInstant()));
			}
			if (to != null) {
				where.add(cb.lessThan(root.get("createdAt"), to.plusDays(1).atStartOfDay(VIETNAM).toInstant()));
			}
			if (StringUtils.hasText(q)) {
				String term = q.trim();
				String phone = PhoneNumbers.normalize(term);
				Predicate byCode = cb.like(root.get("code"), term.toUpperCase(Locale.ROOT).replaceAll("[%_]", "") + "%");
				where.add(PhoneNumbers.isValid(phone) ? cb.or(byCode, cb.equal(root.get("phone"), phone)) : byCode);
			}
			return cb.and(where.toArray(Predicate[]::new));
		};
		var pageable = PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, 100), Sort.by(Sort.Direction.DESC, "createdAt"));
		var found = orders.findAll(spec, pageable);
		Map<String, PhoneFlag> flagged = phoneFlags.findAll(found.getContent().stream().map(Order::getPhone).toList());
		var result = found.map(o -> {
			PhoneFlag flag = flagged.get(o.getPhone());
			return new OrderRow(o.getCode(), o.getStatus().name(), o.getStatus().label(), o.getCreatedAt(),
					o.getCustomerName(), o.getPhone(), o.getItems().stream().mapToInt(OrderItem::getQuantity).sum(),
					o.getTotal(), flag == null ? null : flag.getLevel().name(), flag == null ? null : flag.getReason());
		});
		return new OrderList(PageResponse.from(result), orders.countByStatus(OrderStatus.PENDING));
	}

	@Transactional(readOnly = true)
	public AdminOrderDetail detail(String code) {
		Order order = orders.findByCode(code).orElseThrow(AdminOrderService::notFound);
		List<OrderNote> orderNotes = notes.findByOrderIdOrderByCreatedAtAsc(order.getId());
		Set<UUID> authorIds = new HashSet<>();
		orderNotes.forEach(n -> authorIds.add(n.getAuthorId()));
		authorIds.remove(null);
		Map<UUID, String> names = users.findAllById(authorIds)
			.stream()
			.collect(Collectors.toMap(User::getId, User::getFullName));
		List<Action> allowed = List.of(Action.values())
			.stream()
			.filter(a -> order.getStatus().canTransitionTo(a.target))
			.toList();
		return new AdminOrderDetail(orderService.toResponse(order), order.getUserId() == null, order.getCarrier(),
				order.getTrackingNumber(),
				orderNotes.stream()
					.map(n -> new NoteResponse(n.getBody(), n.getCreatedAt(), names.getOrDefault(n.getAuthorId(), "—")))
					.toList(),
				allowed, order.getCancelReason());
	}

	/**
	 * @param carrier / trackingNumber required for SHIP
	 * @param reason required for CANCEL (shown to the customer in the cancellation email)
	 */
	@Transactional
	public AdminOrderDetail act(String code, Action action, String carrier, String trackingNumber, String reason,
			UUID actorId) {
		return act(code, action, carrier, trackingNumber, reason, null, actorId);
	}

	/**
	 * "Xác nhận đơn" after contacting the customer: the result is written as an internal note (who and when are on
	 * the note). UNREACHABLE only records the note; the order stays PENDING.
	 */
	@Transactional
	public AdminOrderDetail confirm(String code, ContactResult contact, String note, UUID actorId) {
		Order order = orders.findWithLockByCode(code).orElseThrow(AdminOrderService::notFound);
		String body = contact.note + (StringUtils.hasText(note) ? ": " + note.trim() : "");
		notes.save(new OrderNote(order.getId(), actorId, body.length() > 1000 ? body.substring(0, 1000) : body));
		if (contact == ContactResult.UNREACHABLE) {
			audit.record(actorId, "ORDER_CONTACT_FAILED", "ORDER", code, null, Map.of("note", body));
			return detail(code);
		}
		return act(code, Action.CONFIRM, null, null, null, null, actorId);
	}

	/** @param cancelReason required for CANCEL; a SHIPPING order only accepts REFUSED_DELIVERY */
	@Transactional
	public AdminOrderDetail act(String code, Action action, String carrier, String trackingNumber, String reason,
			CancelReason cancelReason, UUID actorId) {
		// Lock first, then read the status: a concurrent identical click waits here and then fails the transition
		Order order = orders.findWithLockByCode(code).orElseThrow(AdminOrderService::notFound);
		AuditView before = AuditView.of(order);
		String historyReason = switch (action) {
			case CONFIRM -> "Đã xác nhận đơn";
			case SHIP -> {
				if (!StringUtils.hasText(carrier) || !StringUtils.hasText(trackingNumber)) {
					throw new ApiException(HttpStatus.BAD_REQUEST, "SHIPMENT_REQUIRED",
							"Vui lòng nhập đơn vị vận chuyển và mã vận đơn");
				}
				if (order.getStatus().canTransitionTo(OrderStatus.SHIPPING)) {
					order.setShipment(carrier.trim(), trackingNumber.trim());
				}
				yield "Giao cho " + carrier.trim() + " (" + trackingNumber.trim() + ")";
			}
			case COMPLETE -> "Giao hàng thành công";
			case CANCEL -> {
				if (!StringUtils.hasText(reason)) {
					throw new ApiException(HttpStatus.BAD_REQUEST, "REASON_REQUIRED", "Vui lòng nhập lý do huỷ đơn");
				}
				yield reason.trim();
			}
		};
		if (action == Action.CANCEL && cancelReason == null) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "REASON_REQUIRED", "Vui lòng chọn lý do huỷ đơn");
		}
		orderService.transition(order, action.target, actorId,
				action == Action.CANCEL ? cancelReason.label() + ": " + historyReason : historyReason, cancelReason);
		audit.record(actorId, "ORDER_" + action.name(), "ORDER", code, before, AuditView.of(order));
		return detail(code);
	}

	@Transactional
	public AdminOrderDetail addNote(String code, String body, UUID actorId) {
		Order order = orders.findByCode(code).orElseThrow(AdminOrderService::notFound);
		notes.save(new OrderNote(order.getId(), actorId, body.trim()));
		audit.record(actorId, "ORDER_NOTE_ADDED", "ORDER", code, null, Map.of("note", body.trim()));
		return detail(code);
	}

	private static ApiException notFound() {
		return new ApiException(HttpStatus.NOT_FOUND, OrderService.ORDER_NOT_FOUND, "Không tìm thấy đơn hàng");
	}
}
