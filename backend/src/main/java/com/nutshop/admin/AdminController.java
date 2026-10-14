package com.nutshop.admin;

import com.nutshop.admin.AdminDtos.CancelRequest;
import com.nutshop.admin.AdminDtos.ConfirmRequest;
import com.nutshop.admin.AdminDtos.PhoneFlagRequest;
import com.nutshop.admin.AdminDtos.ReasonRequest;
import com.nutshop.admin.AdminDtos.ImportRequest;
import com.nutshop.admin.AdminDtos.NoteRequest;
import com.nutshop.admin.AdminDtos.ShipRequest;
import com.nutshop.admin.AdminDtos.StocktakeRequest;
import com.nutshop.common.PageResponse;
import com.nutshop.order.AdminOrderService;
import com.nutshop.order.AdminOrderService.Action;
import com.nutshop.order.AdminOrderService.AdminOrderDetail;
import com.nutshop.order.AdminOrderService.OrderList;
import com.nutshop.order.OrderStatus;
import com.nutshop.order.PhoneFlag;
import com.nutshop.order.PhoneFlagService;
import com.nutshop.security.Roles;
import com.nutshop.user.Role;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.UUID;

/** Orders, inventory and dashboard: STAFF and ADMIN. */
@RestController
@RequestMapping("/api/admin")
@Roles({ Role.STAFF, Role.ADMIN })
public class AdminController {

	private final AdminOrderService orders;
	private final AdminInventoryService inventory;
	private final DashboardService dashboard;
	private final PhoneFlagService phoneFlags;

	public AdminController(AdminOrderService orders, AdminInventoryService inventory, DashboardService dashboard,
			PhoneFlagService phoneFlags) {
		this.phoneFlags = phoneFlags;
		this.orders = orders;
		this.inventory = inventory;
		this.dashboard = dashboard;
	}

	@GetMapping("/dashboard")
	public DashboardService.Dashboard dashboard() {
		return dashboard.get();
	}

	// ---- orders -----------------------------------------------------------------------------------------------

	@GetMapping("/orders")
	public OrderList orders(@RequestParam(required = false) OrderStatus status,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
			@RequestParam(required = false) String q, @RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "20") int size) {
		return orders.list(status, from, to, q, page, size);
	}

	@GetMapping("/orders/{code}")
	public AdminOrderDetail order(@PathVariable String code) {
		return orders.detail(code);
	}

	/** With the result of contacting the customer; UNREACHABLE only adds a note (the order stays PENDING). */
	@PostMapping("/orders/{code}/confirm")
	public AdminOrderDetail confirm(@PathVariable String code, @Valid @RequestBody ConfirmRequest req,
			@AuthenticationPrincipal Jwt jwt) {
		return orders.confirm(code, req.contact(), req.note(), userId(jwt));
	}

	@PostMapping("/orders/{code}/ship")
	public AdminOrderDetail ship(@PathVariable String code, @Valid @RequestBody ShipRequest req,
			@AuthenticationPrincipal Jwt jwt) {
		return orders.act(code, Action.SHIP, req.carrier(), req.trackingNumber(), null, userId(jwt));
	}

	@PostMapping("/orders/{code}/complete")
	public AdminOrderDetail complete(@PathVariable String code, @AuthenticationPrincipal Jwt jwt) {
		return orders.act(code, Action.COMPLETE, null, null, null, userId(jwt));
	}

	@PostMapping("/orders/{code}/cancel")
	public AdminOrderDetail cancel(@PathVariable String code, @Valid @RequestBody CancelRequest req,
			@AuthenticationPrincipal Jwt jwt) {
		return orders.act(code, Action.CANCEL, null, null, req.reason(), req.reasonCode(), userId(jwt));
	}

	@PostMapping("/orders/{code}/notes")
	public AdminOrderDetail addNote(@PathVariable String code, @Valid @RequestBody NoteRequest req,
			@AuthenticationPrincipal Jwt jwt) {
		return orders.addNote(code, req.body(), userId(jwt));
	}

	// ---- customers by phone ---------------------------------------------------------------------------------

	/** Order history of a phone number; {@code exclude} = the order being looked at (not counted as "first"). */
	@GetMapping("/customers/by-phone/{phone}/stats")
	public PhoneFlagService.CustomerStats customerStats(@PathVariable String phone,
			@RequestParam(required = false) String exclude) {
		return phoneFlags.stats(phone, exclude);
	}

	@GetMapping("/phone-flags")
	public PageResponse<PhoneFlagService.FlagView> phoneFlagList(@RequestParam(required = false) PhoneFlag.Level level,
			@RequestParam(required = false) String q, @RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "50") int size) {
		return phoneFlags.list(level, q, page, size);
	}

	/** STAFF: add WATCH only. ADMIN: any level, also change an existing flag. */
	@PutMapping("/phone-flags/{phone}")
	public PhoneFlagService.FlagView setPhoneFlag(@PathVariable String phone, @Valid @RequestBody PhoneFlagRequest req,
			@AuthenticationPrincipal Jwt jwt) {
		return phoneFlags.set(phone, req.level(), req.reason(), userId(jwt));
	}

	/** ADMIN only. */
	@PostMapping("/phone-flags/{phone}/remove")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void removePhoneFlag(@PathVariable String phone, @Valid @RequestBody ReasonRequest req,
			@AuthenticationPrincipal Jwt jwt) {
		phoneFlags.remove(phone, req.reason(), userId(jwt));
	}

	// ---- inventory --------------------------------------------------------------------------------------------

	@GetMapping("/inventory")
	public PageResponse<AdminInventoryService.StockRow> inventory(@RequestParam(required = false) String q,
			@RequestParam(defaultValue = "false") boolean low, @RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "50") int size) {
		return inventory.list(q, low, page, size);
	}

	@PostMapping("/inventory/{productId}/import")
	public AdminInventoryService.StockRow importStock(@PathVariable long productId,
			@Valid @RequestBody ImportRequest req, @AuthenticationPrincipal Jwt jwt) {
		return inventory.importStock(productId, req.quantity(), req.unitCost(), req.supplier(), req.note(),
				userId(jwt));
	}

	@PostMapping("/inventory/{productId}/stocktake")
	public AdminInventoryService.StocktakeResult stocktake(@PathVariable long productId,
			@Valid @RequestBody StocktakeRequest req, @AuthenticationPrincipal Jwt jwt) {
		return inventory.stocktake(productId, req.counted(), req.reason(), userId(jwt));
	}

	@GetMapping("/inventory/{productId}/movements")
	public PageResponse<AdminInventoryService.MovementRow> movements(@PathVariable long productId,
			@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
		return inventory.history(productId, page, size);
	}

	static UUID userId(Jwt jwt) {
		return UUID.fromString(jwt.getSubject());
	}
}
