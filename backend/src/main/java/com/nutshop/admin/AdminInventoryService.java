package com.nutshop.admin;

import com.nutshop.audit.AuditLog;
import com.nutshop.common.ApiException;
import com.nutshop.common.PageResponse;
import com.nutshop.inventory.InventoryMovement;
import com.nutshop.inventory.InventoryMovementRepository;
import com.nutshop.inventory.InventoryService;
import com.nutshop.order.Order;
import com.nutshop.order.OrderRepository;
import com.nutshop.product.Product;
import com.nutshop.product.ProductRepository;
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
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/** Warehouse view for STAFF/ADMIN: stock levels, goods received, physical counts and per-product history. */
@Service
public class AdminInventoryService {

	public record StockRow(Long id, String name, String slug, boolean active, int onHand, int reserved,
			int available, int lowStockThreshold, boolean lowStock) {

		static StockRow from(Product p) {
			return new StockRow(p.getId(), p.getName(), p.getSlug(), p.isActive(), p.getOnHand(), p.getReserved(),
					p.availableQuantity(), p.getLowStockThreshold(), p.isLowStock());
		}
	}

	public record MovementRow(UUID id, String type, int quantity, String note, Long unitCost, String supplier,
			String orderCode, String actorName, Instant createdAt) {
	}

	public record StocktakeResult(StockRow stock, int previousOnHand, int counted, int difference) {
	}

	private final ProductRepository products;
	private final InventoryService inventory;
	private final InventoryMovementRepository movements;
	private final OrderRepository orders;
	private final UserRepository users;
	private final AuditLog audit;

	public AdminInventoryService(ProductRepository products, InventoryService inventory,
			InventoryMovementRepository movements, OrderRepository orders, UserRepository users, AuditLog audit) {
		this.products = products;
		this.inventory = inventory;
		this.movements = movements;
		this.orders = orders;
		this.users = users;
		this.audit = audit;
	}

	/** @param lowOnly only products whose available stock is at or below their own threshold */
	@Transactional(readOnly = true)
	public PageResponse<StockRow> list(String q, boolean lowOnly, int page, int size) {
		Specification<Product> spec = (root, query, cb) -> {
			List<Predicate> where = new ArrayList<>();
			if (StringUtils.hasText(q)) {
				String like = "%" + q.trim().toLowerCase(Locale.ROOT).replaceAll("[%_]", "") + "%";
				where.add(cb.or(cb.like(cb.lower(root.get("name")), like), cb.like(root.get("slug"), like)));
			}
			if (lowOnly) {
				where.add(cb.le(cb.diff(root.<Integer>get("onHand"), root.<Integer>get("reserved")),
						root.<Integer>get("lowStockThreshold")));
			}
			return cb.and(where.toArray(Predicate[]::new));
		};
		var pageable = PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, 100), Sort.by("name"));
		return PageResponse.from(products.findAll(spec, pageable).map(StockRow::from));
	}

	@Transactional
	public StockRow importStock(long productId, int quantity, Long unitCost, String supplier, String note,
			UUID actorId) {
		Product product = product(productId);
		int before = product.getOnHand();
		InventoryMovement movement = inventory.importStock(productId, quantity, unitCost, trim(supplier), trim(note),
				actorId);
		product = product(productId); // stock columns are changed by SQL (which clears the context): reload
		Map<String, Object> after = new HashMap<>();
		after.put("onHand", product.getOnHand());
		after.put("quantity", quantity);
		after.put("unitCost", unitCost);
		after.put("supplier", trim(supplier));
		after.put("movementId", movement.getId());
		audit.entry("STOCK_IMPORTED", "PRODUCT", productId, product.getName())
			.by(actorId)
			.changes(Map.of("onHand", before), after)
			.reason(trim(note))
			.record();
		return StockRow.from(product);
	}

	@Transactional
	public StocktakeResult stocktake(long productId, int counted, String reason, UUID actorId) {
		if (!StringUtils.hasText(reason)) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "REASON_REQUIRED", "Vui lòng nhập lý do điều chỉnh");
		}
		Product product = product(productId);
		InventoryService.Stocktake result = inventory.stocktake(productId, counted, reason.trim(), actorId);
		product = product(productId);
		if (result.difference() != 0) {
			audit.entry("STOCK_ADJUSTED", "PRODUCT", productId, product.getName())
				.by(actorId)
				.changes(Map.of("onHand", result.previousOnHand()), Map.of("onHand", counted, "difference", result.difference()))
				.reason(reason)
				.record();
		}
		return new StocktakeResult(StockRow.from(product), result.previousOnHand(), counted, result.difference());
	}

	@Transactional(readOnly = true)
	public PageResponse<MovementRow> history(long productId, int page, int size) {
		product(productId);
		var result = movements.findByProductIdOrderByCreatedAtDesc(productId,
				PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, 100)));
		Set<UUID> orderIds = new HashSet<>();
		Set<UUID> actorIds = new HashSet<>();
		result.forEach(m -> {
			orderIds.add(m.getOrderId());
			actorIds.add(m.getActorId());
		});
		orderIds.remove(null);
		actorIds.remove(null);
		Map<UUID, String> codes = orders.findAllById(orderIds)
			.stream()
			.collect(Collectors.toMap(Order::getId, Order::getCode));
		Map<UUID, String> names = users.findAllById(actorIds)
			.stream()
			.collect(Collectors.toMap(User::getId, User::getFullName));
		return PageResponse.from(result.map(m -> new MovementRow(m.getId(), m.getType().name(), m.getQuantity(),
				m.getNote(), m.getUnitCost(), m.getSupplier(), codes.get(m.getOrderId()),
				m.getActorId() == null ? null : names.getOrDefault(m.getActorId(), "—"), m.getCreatedAt())));
	}

	private Product product(long id) {
		return products.findById(id)
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm"));
	}

	private static String trim(String value) {
		return StringUtils.hasText(value) ? value.trim() : null;
	}
}
