package com.nutshop.order;

import com.nutshop.address.AdminUnits;
import com.nutshop.cart.CartProperties;
import com.nutshop.cart.CartService;
import com.nutshop.common.ApiException;
import com.nutshop.common.PageResponse;
import com.nutshop.inventory.InventoryService;
import com.nutshop.mail.EmailSender;
import com.nutshop.order.OrderDtos.LineRequest;
import com.nutshop.order.OrderDtos.OrderItemResponse;
import com.nutshop.order.OrderDtos.OrderResponse;
import com.nutshop.order.OrderDtos.OrderSummary;
import com.nutshop.order.OrderDtos.PlaceOrderRequest;
import com.nutshop.order.OrderDtos.Shortage;
import com.nutshop.order.OrderDtos.StatusChange;
import com.nutshop.product.PricingService;
import com.nutshop.product.PricingService.Price;
import com.nutshop.product.Product;
import com.nutshop.product.ProductRepository;
import com.nutshop.user.PhoneNumbers;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.TaskExecutor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Cash-on-delivery orders. Placing an order prices it from the database, reserves stock with conditional updates
 * (all-or-nothing in one transaction) and is idempotent per idempotencyKey.
 */
@Service
public class OrderService {

	public static final String OUT_OF_STOCK = "OUT_OF_STOCK";
	public static final String ORDER_NOT_FOUND = "ORDER_NOT_FOUND";
	public static final String INVALID_ADDRESS = "INVALID_ADDRESS";
	public static final String QUANTITY_TOO_LARGE = "QUANTITY_TOO_LARGE";
	public static final String ORDER_NOT_CANCELLABLE = "ORDER_NOT_CANCELLABLE";
	public static final String INVALID_STATUS_TRANSITION = "INVALID_STATUS_TRANSITION";
	public static final String IDEMPOTENCY_CONFLICT = "IDEMPOTENCY_CONFLICT";

	static final String NOT_FOUND_MESSAGE = "Không tìm thấy đơn hàng. Vui lòng kiểm tra lại mã đơn và số điện thoại.";
	private static final String MISSING_PRODUCT = "Sản phẩm không còn tồn tại";
	private static final ZoneId VIETNAM = ZoneId.of("Asia/Ho_Chi_Minh");
	private static final DateTimeFormatter CODE_DATE = DateTimeFormatter.ofPattern("yyMMdd");
	/** No 0/O, 1/I/L: codes are read out over the phone. */
	private static final String CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
	private static final SecureRandom RANDOM = new SecureRandom();
	private static final Logger log = LoggerFactory.getLogger(OrderService.class);

	/** @param created false when an earlier request with the same idempotencyKey already created it */
	public record PlaceResult(OrderResponse order, boolean created) {
	}

	private final OrderRepository orders;
	private final OrderStatusHistoryRepository history;
	private final ProductRepository products;
	private final InventoryService inventory;
	private final CartService carts;
	private final CartProperties cartProps;
	private final AdminUnits adminUnits;
	private final OrderEmails emails;
	private final OrderAccessTokens accessTokens;
	private final PricingService pricing;
	private final EmailSender emailSender;
	private final TaskExecutor executor;
	private final TransactionTemplate tx;
	private final Clock clock;

	public OrderService(OrderRepository orders, OrderStatusHistoryRepository history, ProductRepository products,
			InventoryService inventory, CartService carts, CartProperties cartProps, AdminUnits adminUnits,
			OrderEmails emails, OrderAccessTokens accessTokens, PricingService pricing, EmailSender emailSender,
			@Qualifier("applicationTaskExecutor") TaskExecutor executor,
			PlatformTransactionManager txManager, Clock clock) {
		this.orders = orders;
		this.history = history;
		this.products = products;
		this.inventory = inventory;
		this.carts = carts;
		this.cartProps = cartProps;
		this.adminUnits = adminUnits;
		this.emails = emails;
		this.accessTokens = accessTokens;
		this.pricing = pricing;
		this.emailSender = emailSender;
		this.executor = executor;
		this.tx = new TransactionTemplate(txManager);
		this.clock = clock;
	}

	// ---- placing ----------------------------------------------------------------------------------------------

	/**
	 * Same idempotencyKey (and phone) → the existing order, created=false. Two identical requests racing each other
	 * both reach the INSERT; the unique key makes one fail and roll back, and it then returns the winner's order.
	 */
	public PlaceResult place(PlaceOrderRequest req, UUID userId) {
		String key = req.idempotencyKey().trim();
		String phone = PhoneNumbers.normalize(req.phone());
		Optional<OrderResponse> existing = replay(key, phone);
		if (existing.isPresent()) {
			return new PlaceResult(existing.get(), false);
		}
		try {
			return new PlaceResult(tx.execute(status -> create(req, key, phone, userId)), true);
		}
		catch (DataIntegrityViolationException ex) {
			return replay(key, phone).map(order -> new PlaceResult(order, false)).orElseThrow(() -> ex);
		}
	}

	/**
	 * A repeated request gets the original order back. Raw tracking tokens are never stored, so a guest replay is
	 * handed a NEW tracking token (added next to the first one, which keeps working): the client that retried may
	 * never have received the first response.
	 */
	private Optional<OrderResponse> replay(String key, String phone) {
		return tx.execute(status -> orders.findByIdempotencyKey(key).map(order -> {
			// A key is only meaningful to the person who created it: never hand someone else's order back
			if (!order.getPhone().equals(phone)) {
				throw new ApiException(HttpStatus.CONFLICT, IDEMPOTENCY_CONFLICT,
						"Yêu cầu đặt hàng không hợp lệ. Vui lòng tải lại trang thanh toán.");
			}
			return withTracking(order, toResponse(order));
		}));
	}

	/** Guest orders: issue a tracking link and put it in the response (the only place the raw token is shown). */
	private OrderResponse withTracking(Order order, OrderResponse response) {
		if (order.getUserId() != null) {
			return response;
		}
		String token = accessTokens.issue(order);
		return response.withTracking(token, accessTokens.trackingUrl(order, token));
	}

	private OrderResponse create(PlaceOrderRequest req, String key, String phone, UUID userId) {
		AdminUnits.Address address = adminUnits.resolve(req.provinceCode(), req.wardCode())
			.orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, INVALID_ADDRESS,
					"Vui lòng chọn đúng tỉnh/thành phố và phường/xã"));
		String name = req.customerName().trim().replaceAll("\\s+", " ");
		if (name.length() < 2) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_NAME", "Họ tên phải từ 2 đến 100 ký tự");
		}

		// Same product twice in the request counts once; TreeMap = reserve in id order (no deadlocks between orders)
		Map<Long, Integer> wanted = new TreeMap<>();
		for (LineRequest line : req.items()) {
			wanted.merge(line.productId(), line.quantity(), Integer::sum);
		}
		Map<Long, Product> found = products.findByIdIn(wanted.keySet())
			.stream()
			.collect(Collectors.toMap(Product::getId, Function.identity()));
		Map<Long, Price> prices = pricing.pricesOf(found.values());
		wanted.forEach((productId, quantity) -> {
			if (quantity > cartProps.maxQtyPerItem()) {
				Product p = found.get(productId);
				throw new ApiException(HttpStatus.BAD_REQUEST, QUANTITY_TOO_LARGE, "Mỗi sản phẩm chỉ được mua tối đa "
						+ cartProps.maxQtyPerItem() + (p == null ? "" : " (" + p.getName() + ")"));
			}
		});

		var delivery = new Order.Delivery(name, phone, blankToNull(req.email()), address.province(), address.ward(),
				req.addressLine().trim());
		Order order = new Order(newCode(), key, userId, delivery, blankToNull(req.note()));
		List<Shortage> shortages = new ArrayList<>();
		long subtotal = 0;
		for (var entry : wanted.entrySet()) {
			Product p = found.get(entry.getKey());
			if (p == null || !p.isActive()) {
				shortages.add(new Shortage(entry.getKey(), p == null ? MISSING_PRODUCT : p.getName(), entry.getValue(), 0));
				continue;
			}
			// The server's price at this moment (sale price during a promotion); anything the client sent is ignored
			Price price = prices.get(p.getId());
			order.addItem(p.getId(), p.getName(), price.price(), price.regularPrice(), p.getWeightGrams(),
					entry.getValue());
			subtotal += Math.multiplyExact(price.price(), (long) entry.getValue());
		}
		order.setTotals(subtotal, cartProps.shippingFeeFor(subtotal));
		orders.saveAndFlush(order);
		UUID orderId = order.getId();
		List<OrderItemResponse> lines = order.getItems().stream().map(OrderItemResponse::from).toList();

		for (OrderItemResponse line : lines) {
			if (!inventory.reserve(line.productId(), line.quantity(), orderId, userId)) {
				shortages.add(new Shortage(line.productId(), line.productName(), line.quantity(), 0));
			}
		}
		if (!shortages.isEmpty()) {
			// Thrown inside the transaction: the order and every reservation made above roll back
			throw outOfStock(shortages);
		}

		history.save(new OrderStatusHistory(orderId, null, OrderStatus.PENDING, userId, "Đặt hàng"));
		if (userId != null) {
			carts.clear(userId);
		}
		OrderResponse placed = response(order, lines, List.of(new StatusChange(OrderStatus.PENDING.name(),
				OrderStatus.PENDING.label(), order.getCreatedAt(), "Đặt hàng")));
		placed = withTracking(order, placed);
		if (delivery.email() != null) {
			Order snapshot = order;
			String link = placed.trackingUrl() != null ? placed.trackingUrl() : accessTokens.linkFor(order);
			afterCommit(() -> sendConfirmation(snapshot, link));
		}
		return placed;
	}

	/** Shortages report what is available right now (fresh read), so the cart can show it. */
	private ApiException outOfStock(List<Shortage> shortages) {
		Map<Long, Product> now = products.findByIdIn(shortages.stream().map(Shortage::productId).toList())
			.stream()
			.collect(Collectors.toMap(Product::getId, Function.identity()));
		List<Shortage> report = shortages.stream().map(s -> {
			Product p = now.get(s.productId());
			int available = p == null || !p.isActive() ? 0 : Math.min(p.availableQuantity(), cartProps.maxQtyPerItem());
			return new Shortage(s.productId(), s.name(), s.requested(), available);
		}).toList();
		return new ApiException(HttpStatus.CONFLICT, OUT_OF_STOCK, "Một số sản phẩm không còn đủ hàng")
			.withProperty("items", report);
	}

	private String newCode() {
		String date = clock.instant().atZone(VIETNAM).format(CODE_DATE);
		for (int attempt = 0; attempt < 20; attempt++) {
			StringBuilder code = new StringBuilder("HL").append(date);
			for (int i = 0; i < 4; i++) {
				code.append(CODE_ALPHABET.charAt(RANDOM.nextInt(CODE_ALPHABET.length())));
			}
			if (!orders.existsByCode(code.toString())) {
				return code.toString();
			}
		}
		throw new IllegalStateException("Could not generate a unique order code");
	}

	// ---- reading ----------------------------------------------------------------------------------------------

	@Transactional(readOnly = true)
	public PageResponse<OrderSummary> myOrders(UUID userId, int page, int size) {
		var result = orders.findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, 50)));
		return PageResponse.from(result.map(OrderSummary::from));
	}

	@Transactional(readOnly = true)
	public OrderResponse myOrder(UUID userId, String code) {
		return orders.findByCode(code)
			.filter(o -> userId.equals(o.getUserId()))
			.map(this::toResponse)
			.orElseThrow(OrderService::notFound);
	}

	/** Guests: code + phone must both match; any mismatch gives the same 404 (no hint which part was wrong). */
	@Transactional(readOnly = true)
	public OrderResponse lookup(String code, String phone) {
		String normalized = PhoneNumbers.normalize(phone);
		if (!StringUtils.hasText(code) || !PhoneNumbers.isValid(normalized)) {
			throw notFound();
		}
		return orders.findByCode(code.trim().toUpperCase())
			.filter(o -> o.getPhone().equals(normalized))
			.map(this::toResponse)
			.orElseThrow(OrderService::notFound);
	}

	// ---- status changes ---------------------------------------------------------------------------------------

	/** The customer cancels their own order; only while it is still PENDING. Reserved stock is released. */
	@Transactional
	public OrderResponse cancelMine(UUID userId, String code) {
		Order order = orders.findWithLockByCodeAndUserId(code, userId).orElseThrow(OrderService::notFound);
		if (order.getStatus() != OrderStatus.PENDING) {
			throw new ApiException(HttpStatus.CONFLICT, ORDER_NOT_CANCELLABLE,
					"Đơn hàng đã được xác nhận nên không thể tự huỷ. Vui lòng liên hệ cửa hàng.");
		}
		transition(order, OrderStatus.CANCELLED, userId, "Khách huỷ đơn");
		return toResponse(orders.findByCode(code).orElseThrow());
	}

	/**
	 * The only way to change an order's status: rejects moves that are not allowed, applies the stock effect
	 * (CANCELLED releases reserved stock, SHIPPING takes it out of on_hand) and records history. Used by the admin
	 * screens later.
	 */
	@Transactional
	public void transition(Order order, OrderStatus next, UUID actorId, String reason) {
		OrderStatus from = order.getStatus();
		if (!from.canTransitionTo(next)) {
			throw new ApiException(HttpStatus.CONFLICT, INVALID_STATUS_TRANSITION,
					"Không thể chuyển đơn từ \"" + from.label() + "\" sang \"" + next.label() + "\"");
		}
		// Copy lines first: stock updates clear the persistence context
		List<OrderItem> lines = List.copyOf(order.getItems());
		order.changeStatus(next);
		history.save(new OrderStatusHistory(order.getId(), from, next, actorId, reason));
		// Tell the customer when the parcel leaves, arrives or the order is cancelled (after commit, best effort).
		// Guests get a fresh tracking link in each email; links sent earlier stay valid.
		if (order.getEmail() != null && (next == OrderStatus.SHIPPING || next == OrderStatus.CANCELLED
				|| next == OrderStatus.COMPLETED)) {
			String link = accessTokens.linkFor(order);
			var mail = switch (next) {
				case SHIPPING -> emails.shipped(order, link);
				case COMPLETED -> emails.completed(order, link);
				default -> emails.cancelled(order, reason, link);
			};
			afterCommit(() -> {
				try {
					emailSender.send(mail);
				}
				catch (RuntimeException ex) {
					log.error("Could not send {} email for order {}", next, order.getCode(), ex);
				}
			});
		}
		for (OrderItem line : lines) {
			if (next == OrderStatus.CANCELLED) {
				inventory.release(line.getProductId(), line.getQuantity(), order.getId(), actorId, reason);
			}
			else if (next == OrderStatus.SHIPPING) {
				inventory.ship(line.getProductId(), line.getQuantity(), order.getId(), actorId);
			}
		}
	}

	// ---- helpers ----------------------------------------------------------------------------------------------

	OrderResponse toResponse(Order order) {
		List<StatusChange> changes = history.findByOrderIdOrderByCreatedAtAsc(order.getId())
			.stream()
			.map(h -> new StatusChange(h.getToStatus().name(), h.getToStatus().label(), h.getCreatedAt(), h.getReason()))
			.toList();
		return response(order, order.getItems().stream().map(OrderItemResponse::from).toList(), changes);
	}

	private static OrderResponse response(Order o, List<OrderItemResponse> lines, List<StatusChange> changes) {
		return new OrderResponse(o.getCode(), o.getStatus().name(), o.getStatus().label(),
				o.getStatus() == OrderStatus.PENDING, o.getCreatedAt(), o.getCustomerName(), o.getPhone(), o.getEmail(),
				o.getProvince(), o.getWard(), o.getAddressLine(), o.getNote(), o.getPaymentMethod(), lines,
				o.getSubtotal(), o.getShippingFee(), o.getTotal(), changes, null, null);
	}

	private void sendConfirmation(Order order, String link) {
		try {
			emailSender.send(emails.confirmation(order, link));
		}
		catch (RuntimeException ex) {
			// The order stands; only the email failed
			log.error("Could not send confirmation email for order {}", order.getCode(), ex);
		}
	}

	private void afterCommit(Runnable task) {
		TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
			@Override
			public void afterCommit() {
				executor.execute(task);
			}
		});
	}

	private static ApiException notFound() {
		return new ApiException(HttpStatus.NOT_FOUND, ORDER_NOT_FOUND, NOT_FOUND_MESSAGE);
	}

	private static String blankToNull(String value) {
		return StringUtils.hasText(value) ? value.trim() : null;
	}
}
