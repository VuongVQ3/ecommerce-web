package com.nutshop.order;

import com.nutshop.audit.AuditLog;
import com.nutshop.common.ApiException;
import com.nutshop.inventory.InventoryService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeSet;
import java.util.UUID;

/**
 * Deleting orders for good (ADMIN), meant for test orders placed on the live shop. Only a closed order can go
 * (CANCELLED or COMPLETED): an open one is cancelled first, which gives its reserved stock back. A COMPLETED order's
 * goods left on_hand when it shipped; {@code restock} adds them back with an ADJUST movement (a test order whose
 * parcel never left). The stock ledger keeps every row: the order's movements stay, with order_id NULL, so on_hand
 * still equals the sum of the ledger. Lines, history, notes and tracking links go with the order (ON DELETE CASCADE).
 * Phone flags are left as they are.
 */
@Service
public class OrderDeletionService {

	public static final String ORDER_NOT_CLOSED = "ORDER_NOT_CLOSED";

	/** Most codes one bulk request may name. */
	public static final int MAX_BULK = 100;

	static final String NOT_CLOSED_MESSAGE = "Huỷ đơn trước rồi mới xoá";

	public record Skipped(String code, String reason) {
	}

	public record BulkResult(List<String> deleted, List<Skipped> skipped) {
	}

	/** What the audit log keeps of a deleted order: no name, phone, email, address or note. */
	record DeletedOrder(String code, String status, Instant createdAt, long subtotal, long shippingFee, long total,
			List<Line> items, boolean restock) {
	}

	record Line(String product, int quantity) {
	}

	private final OrderRepository orders;
	private final InventoryService inventory;
	private final AuditLog audit;

	public OrderDeletionService(OrderRepository orders, InventoryService inventory, AuditLog audit) {
		this.orders = orders;
		this.inventory = inventory;
		this.audit = audit;
	}

	/** 404 ORDER_NOT_FOUND, 409 ORDER_NOT_CLOSED for an order that is not cancelled or completed. */
	@Transactional
	public void delete(String code, boolean restock, UUID actorId) {
		String refused = deleteOne(code, restock, actorId);
		if (refused == null) {
			return;
		}
		if (refused.equals(NOT_CLOSED_MESSAGE)) {
			throw new ApiException(HttpStatus.CONFLICT, ORDER_NOT_CLOSED, refused);
		}
		throw new ApiException(HttpStatus.NOT_FOUND, OrderService.ORDER_NOT_FOUND, refused);
	}

	/**
	 * Each code on its own rules; one that cannot go is skipped with the reason, the others are deleted. One
	 * transaction for the lot: skips are decided before anything is written, so the only way the request fails is an
	 * unexpected error, and then nothing is deleted (no half-done batch to make sense of). Rows are locked in code
	 * order, so two overlapping batches cannot deadlock.
	 */
	@Transactional
	public BulkResult deleteAll(List<String> codes, boolean restock, UUID actorId) {
		List<String> deleted = new ArrayList<>();
		List<Skipped> skipped = new ArrayList<>();
		for (String code : new TreeSet<>(codes.stream().map(String::trim).toList())) {
			String refused = deleteOne(code, restock, actorId);
			if (refused == null) {
				deleted.add(code);
			}
			else {
				skipped.add(new Skipped(code, refused));
			}
		}
		return new BulkResult(deleted, skipped);
	}

	/** @return null when deleted, else why not */
	private String deleteOne(String code, boolean restock, UUID actorId) {
		// Lock first: a click on "Giao thành công" or "Huỷ" in another tab waits, then finds nothing
		Order order = orders.findWithLockByCode(code).orElse(null);
		if (order == null) {
			return "Không tìm thấy đơn hàng";
		}
		OrderStatus status = order.getStatus();
		if (status != OrderStatus.CANCELLED && status != OrderStatus.COMPLETED) {
			return NOT_CLOSED_MESSAGE;
		}
		// Read everything before touching stock: its updates clear the persistence context
		List<OrderItem> lines = List.copyOf(order.getItems());
		boolean restocked = restock && status == OrderStatus.COMPLETED;
		DeletedOrder snapshot = new DeletedOrder(code, status.name(), order.getCreatedAt(), order.getSubtotal(),
				order.getShippingFee(), order.getTotal(),
				lines.stream().map(l -> new Line(l.getProductName(), l.getQuantity())).toList(), restocked);
		UUID id = order.getId();
		if (restocked) {
			for (OrderItem line : lines) {
				inventory.adjust(line.getProductId(), line.getQuantity(), "Hoàn kho khi xoá đơn test #" + code, actorId);
			}
		}
		orders.deleteRowById(id);
		audit.entry("ORDER_DELETED", "ORDER", code, code).by(actorId).changes(snapshot, null).record();
		return null;
	}
}
