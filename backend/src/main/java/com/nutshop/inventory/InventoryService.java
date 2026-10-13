package com.nutshop.inventory;

import com.nutshop.common.ApiException;
import com.nutshop.inventory.InventoryMovement.Type;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Stock changes as single conditional UPDATEs (see StockUpdateRepository), so concurrent orders can never
 * oversell: PostgreSQL row-locks the product and re-checks the condition for the second writer. Each change is
 * logged in inventory_movements, which keeps these invariants for every product:
 * <pre>
 *   on_hand  = SUM(IMPORT, ADJUST, ORDER_SHIP)
 *   reserved = SUM(ORDER_RESERVE, ORDER_CANCEL, ORDER_SHIP)
 * </pre>
 * Must run inside the caller's transaction.
 */
@Service
@Transactional(propagation = Propagation.MANDATORY)
public class InventoryService {

	public record Stocktake(int previousOnHand, int counted, int difference, InventoryMovement movement) {
	}

	private final StockUpdateRepository stock;
	private final InventoryMovementRepository movements;

	public InventoryService(StockUpdateRepository stock, InventoryMovementRepository movements) {
		this.stock = stock;
		this.movements = movements;
	}

	/** @return false when there is not enough available stock (nothing changed for this product) */
	public boolean reserve(long productId, int quantity, UUID orderId, UUID actorId) {
		if (stock.reserve(productId, quantity) == 0) {
			return false;
		}
		movements.save(new InventoryMovement(productId, quantity, Type.ORDER_RESERVE, orderId, actorId, null));
		return true;
	}

	/** Gives reserved stock back (order cancelled). */
	public void release(long productId, int quantity, UUID orderId, UUID actorId, String note) {
		if (stock.release(productId, quantity) == 0) {
			throw new IllegalStateException("Reserved stock of product " + productId + " is lower than " + quantity);
		}
		movements.save(new InventoryMovement(productId, -quantity, Type.ORDER_CANCEL, orderId, actorId, note));
	}

	/** Stock leaves the warehouse (order shipped): on_hand and reserved both drop. */
	public void ship(long productId, int quantity, UUID orderId, UUID actorId) {
		if (stock.ship(productId, quantity) == 0) {
			throw new IllegalStateException("Cannot ship " + quantity + " of product " + productId);
		}
		movements.save(new InventoryMovement(productId, -quantity, Type.ORDER_SHIP, orderId, actorId, null));
	}

	/** Goods received from a supplier. */
	public InventoryMovement importStock(long productId, int quantity, Long unitCost, String supplier, String note,
			UUID actorId) {
		if (quantity <= 0 || stock.changeOnHand(productId, quantity) == 0) {
			throw new ApiException(HttpStatus.NOT_FOUND, "PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm");
		}
		return movements.save(InventoryMovement.imported(productId, quantity, unitCost, supplier, note, actorId));
	}

	/**
	 * Physical count: on_hand becomes {@code counted}; the difference is recorded as one ADJUST movement. The row
	 * is locked first so a concurrent order cannot slip in between reading and writing.
	 */
	public Stocktake stocktake(long productId, int counted, String reason, UUID actorId) {
		List<Object[]> rows = stock.lockStock(productId);
		if (rows.isEmpty()) {
			throw new ApiException(HttpStatus.NOT_FOUND, "PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm");
		}
		int onHand = ((Number) rows.getFirst()[0]).intValue();
		int reserved = ((Number) rows.getFirst()[1]).intValue();
		if (counted < reserved) {
			throw new ApiException(HttpStatus.CONFLICT, "COUNT_BELOW_RESERVED", "Số đếm (" + counted
					+ ") thấp hơn số đang giữ cho các đơn chưa giao (" + reserved + "). Hãy xử lý các đơn đó trước.");
		}
		int difference = counted - onHand;
		if (difference == 0) {
			return new Stocktake(onHand, counted, 0, null);
		}
		stock.changeOnHand(productId, difference);
		InventoryMovement movement = movements
			.save(new InventoryMovement(productId, difference, Type.ADJUST, null, actorId, reason));
		return new Stocktake(onHand, counted, difference, movement);
	}
}
