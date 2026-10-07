package com.nutshop.cart;

import com.nutshop.cart.CartDtos.CartLine;
import com.nutshop.cart.CartDtos.CartMutationResponse;
import com.nutshop.cart.CartDtos.CartView;
import com.nutshop.cart.CartDtos.CartWarning;
import com.nutshop.cart.CartDtos.LineRequest;
import com.nutshop.cart.CartDtos.LineStatus;
import com.nutshop.cart.CartDtos.MergeResponse;
import com.nutshop.cart.CartDtos.SkippedLine;
import com.nutshop.common.ApiException;
import com.nutshop.product.Product;
import com.nutshop.product.ProductRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Carts store only product ids and quantities. Every response is "enriched" from the products table (current price,
 * name, stock), so a client can never set a price. Adding to a cart does not reserve stock.
 */
@Service
public class CartService {

	public static final String PRODUCT_NOT_FOUND = "PRODUCT_NOT_FOUND";
	public static final String PRODUCT_UNAVAILABLE = "PRODUCT_UNAVAILABLE";
	public static final String OUT_OF_STOCK = "OUT_OF_STOCK";
	public static final String QTY_LIMITED = "QTY_LIMITED";

	private static final String MISSING_PRODUCT_NAME = "Sản phẩm không còn tồn tại";

	private final CartRepository carts;
	private final CartItemRepository items;
	private final ProductRepository products;
	private final CartProperties props;

	public CartService(CartRepository carts, CartItemRepository items, ProductRepository products,
			CartProperties props) {
		this.carts = carts;
		this.items = items;
		this.products = products;
		this.props = props;
	}

	@Transactional(readOnly = true)
	public CartView get(UUID userId) {
		return carts.findIdByUserId(userId).map(this::view).orElseGet(() -> enrich(List.of()));
	}

	/** Adds to the existing quantity; caps at what can be bought and warns when it had to. */
	@Transactional
	public CartMutationResponse add(UUID userId, long productId, int quantity) {
		Product product = requirePurchasable(productId);
		UUID cartId = cartIdFor(userId);
		int cap = cap(product);
		int before = items.findQuantity(cartId, productId).orElse(0);
		items.addCapped(cartId, productId, quantity, cap, product.getPrice());
		carts.touch(cartId);
		CartWarning warning = before + quantity > cap ? limited(product, cap) : null;
		return new CartMutationResponse(view(cartId), warning);
	}

	/** Sets the quantity; 0 removes the line. */
	@Transactional
	public CartMutationResponse setQuantity(UUID userId, long productId, int quantity) {
		if (quantity == 0) {
			return new CartMutationResponse(remove(userId, productId), null);
		}
		Product product = requirePurchasable(productId);
		UUID cartId = cartIdFor(userId);
		int cap = cap(product);
		items.setQuantity(cartId, productId, Math.min(quantity, cap), product.getPrice());
		carts.touch(cartId);
		return new CartMutationResponse(view(cartId), quantity > cap ? limited(product, cap) : null);
	}

	@Transactional
	public CartView remove(UUID userId, long productId) {
		return carts.findIdByUserId(userId).map(cartId -> {
			items.deleteLine(cartId, productId);
			carts.touch(cartId);
			return view(cartId);
		}).orElseGet(() -> enrich(List.of()));
	}

	@Transactional
	public CartView clear(UUID userId) {
		carts.findIdByUserId(userId).ifPresent(cartId -> {
			items.deleteAllLines(cartId);
			carts.touch(cartId);
		});
		return enrich(List.of());
	}

	/**
	 * Merges a guest cart after sign-in: adds quantities, caps them, skips products that cannot be bought.
	 * Idempotent per mergeKey: a retry returns the current cart without adding again.
	 */
	@Transactional
	public MergeResponse merge(UUID userId, String mergeKey, List<LineRequest> lines) {
		UUID cartId = cartIdFor(userId);
		if (carts.recordMerge(cartId, mergeKey.trim()) == 0) {
			return new MergeResponse(view(cartId), List.of(), true);
		}
		Map<Long, Integer> requested = sumByProduct(lines);
		Map<Long, Product> found = loadProducts(requested.keySet());
		List<SkippedLine> skipped = new ArrayList<>();
		requested.forEach((productId, quantity) -> {
			Product product = found.get(productId);
			Optional<ApiException> problem = purchaseProblem(productId, product);
			if (problem.isPresent()) {
				skipped.add(new SkippedLine(productId, problem.get().getCode(), problem.get().getMessage()));
				return;
			}
			items.addCapped(cartId, productId, quantity, cap(product), product.getPrice());
		});
		carts.touch(cartId);
		return new MergeResponse(view(cartId), skipped, false);
	}

	/** Guest carts (public): same enriched shape as a stored cart, without price-change detection. */
	@Transactional(readOnly = true)
	public CartView validate(List<LineRequest> lines) {
		List<LineInput> inputs = sumByProduct(lines).entrySet()
			.stream()
			.map(e -> new LineInput(e.getKey(), e.getValue(), null))
			.toList();
		return enrich(inputs);
	}

	// ---- internals --------------------------------------------------------------------------------------------

	private record LineInput(Long productId, int quantity, Long priceAtAdd) {
	}

	private CartView view(UUID cartId) {
		List<LineInput> inputs = items.findByCartIdOrderByCreatedAtAscProductIdAsc(cartId)
			.stream()
			.map(i -> new LineInput(i.getProductId(), i.getQuantity(), i.getPriceAtAdd()))
			.toList();
		return enrich(inputs);
	}

	/** All products in one query, then per-line status and totals. */
	private CartView enrich(List<LineInput> inputs) {
		Map<Long, Product> found = loadProducts(inputs.stream().map(LineInput::productId).toList());
		List<CartLine> lines = inputs.stream().map(in -> line(in, found.get(in.productId()))).toList();

		long subtotal = lines.stream().mapToLong(CartLine::lineTotal).sum();
		int totalQuantity = lines.stream().mapToInt(CartLine::requestedQuantity).sum();
		boolean freeShipping = subtotal == 0 || subtotal >= props.freeShippingThreshold();
		long shippingFee = freeShipping ? 0 : props.shippingFee();
		long amountToFree = freeShipping ? 0 : props.freeShippingThreshold() - subtotal;
		boolean blocked = lines.stream()
			.anyMatch(l -> l.status() == LineStatus.OUT_OF_STOCK || l.status() == LineStatus.UNAVAILABLE);
		return new CartView(lines, totalQuantity, subtotal, shippingFee, amountToFree, props.freeShippingThreshold(),
				subtotal + shippingFee, !lines.isEmpty() && !blocked);
	}

	private CartLine line(LineInput in, Product p) {
		if (p == null) {
			return new CartLine(in.productId(), MISSING_PRODUCT_NAME, null, null, null, null, 0, in.priceAtAdd(), 0,
					in.quantity(), 0, 0, LineStatus.UNAVAILABLE);
		}
		int max = p.isActive() ? cap(p) : 0;
		LineStatus status;
		if (!p.isActive()) {
			status = LineStatus.UNAVAILABLE;
		}
		else if (max == 0) {
			status = LineStatus.OUT_OF_STOCK;
		}
		else if (in.quantity() > max) {
			status = LineStatus.QTY_REDUCED;
		}
		else if (in.priceAtAdd() != null && !in.priceAtAdd().equals(p.getPrice())) {
			status = LineStatus.PRICE_CHANGED;
		}
		else {
			status = LineStatus.OK;
		}
		int counted = Math.min(in.quantity(), max);
		return new CartLine(p.getId(), p.getName(), p.getSlug(), p.getImageUrl(), p.getCategory().getSlug(),
				p.getWeightGrams(), p.getPrice(), in.priceAtAdd(), counted, in.quantity(), max,
				Math.multiplyExact(p.getPrice(), (long) counted), status);
	}

	private UUID cartIdFor(UUID userId) {
		carts.createIfAbsent(userId);
		return carts.findIdByUserId(userId).orElseThrow();
	}

	private int cap(Product p) {
		return Math.min(p.availableQuantity(), props.maxQtyPerItem());
	}

	private Product requirePurchasable(long productId) {
		Product product = products.findById(productId).orElse(null);
		purchaseProblem(productId, product).ifPresent(problem -> {
			throw problem;
		});
		return product;
	}

	private Optional<ApiException> purchaseProblem(long productId, Product product) {
		if (product == null) {
			return Optional.of(new ApiException(HttpStatus.NOT_FOUND, PRODUCT_NOT_FOUND, "Không tìm thấy sản phẩm"));
		}
		if (!product.isActive()) {
			return Optional.of(new ApiException(HttpStatus.CONFLICT, PRODUCT_UNAVAILABLE,
					"Sản phẩm \"" + product.getName() + "\" đã ngừng kinh doanh"));
		}
		if (cap(product) == 0) {
			return Optional.of(new ApiException(HttpStatus.CONFLICT, OUT_OF_STOCK,
					"Sản phẩm \"" + product.getName() + "\" đã hết hàng"));
		}
		return Optional.empty();
	}

	private static CartWarning limited(Product product, int cap) {
		return new CartWarning(QTY_LIMITED, "Chỉ còn " + cap + " sản phẩm", product.getId(), cap);
	}

	private Map<Long, Product> loadProducts(java.util.Collection<Long> ids) {
		if (ids.isEmpty()) {
			return Map.of();
		}
		return products.findByIdIn(ids).stream().collect(Collectors.toMap(Product::getId, Function.identity()));
	}

	/** Same product listed twice in a request counts once, with quantities added up (capped at the ceiling). */
	private static Map<Long, Integer> sumByProduct(List<LineRequest> lines) {
		Map<Long, Integer> sums = new LinkedHashMap<>();
		for (LineRequest line : lines) {
			sums.merge(line.productId(), line.quantity(), (a, b) -> Math.min(a + b, CartDtos.QTY_CEILING));
		}
		return sums;
	}
}
