package com.nutshop.inventory;

import com.nutshop.inventory.InventoryMovement.Type;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Stock changes as single conditional UPDATEs (see StockUpdateRepository), so concurrent orders can never
 * oversell: PostgreSQL row-locks the product and re-checks the condition for the second writer. Each change is
 * logged in inventory_movements. Must run inside the caller's transaction.
 */
@Service
@Transactional(propagation = Propagation.MANDATORY)
public class InventoryService {

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
}
