package com.nutshop.admin;

import com.nutshop.user.PersonName;
import com.nutshop.admin.AdminUserService.Actor;
import com.nutshop.admin.AdminUserService.AuditRow;
import com.nutshop.admin.AdminUserService.UserDetail;
import com.nutshop.admin.AdminUserService.UserRow;
import com.nutshop.common.PageResponse;
import com.nutshop.security.Roles;
import com.nutshop.user.Role;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Accounts and the audit log: ADMIN only (docs/admin.md). */
@RestController
@RequestMapping("/api/admin")
@Roles(Role.ADMIN)
public class AdminUserController {

	public record RoleRequest(@NotNull(message = "Vui lòng chọn role") Role role,
			@NotBlank(message = "Vui lòng nhập lý do") @Size(max = 500, message = "Lý do tối đa 500 ký tự") String reason) {
	}

	public record ActiveRequest(@NotNull Boolean active,
			@NotBlank(message = "Vui lòng nhập lý do") @Size(max = 500, message = "Lý do tối đa 500 ký tự") String reason) {
	}

	public record InviteRequest(
			@NotBlank(message = "Vui lòng nhập họ tên") @PersonName String fullName,
			@NotBlank(message = "Vui lòng nhập email") @Email(message = "Email không hợp lệ") @Size(max = 255) String email,
			@NotBlank(message = "Vui lòng nhập lý do") @Size(max = 500, message = "Lý do tối đa 500 ký tự") String reason) {
	}

	private final AdminUserService users;

	public AdminUserController(AdminUserService users) {
		this.users = users;
	}

	@GetMapping("/users")
	public PageResponse<UserRow> list(@RequestParam(required = false) String q, @RequestParam(required = false) Role role,
			@RequestParam(required = false) Boolean active, @RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "20") int size) {
		return users.list(q, role, active, page, size);
	}

	@GetMapping("/users/{id}")
	public UserDetail detail(@PathVariable UUID id) {
		return users.detail(id);
	}

	@PostMapping("/users/{id}/role")
	public UserRow changeRole(@PathVariable UUID id, @Valid @RequestBody RoleRequest req, @AuthenticationPrincipal Jwt jwt) {
		return users.changeRole(id, req.role(), req.reason(), AdminController.userId(jwt));
	}

	@PostMapping("/users/{id}/active")
	public UserRow setActive(@PathVariable UUID id, @Valid @RequestBody ActiveRequest req, @AuthenticationPrincipal Jwt jwt) {
		return users.setActive(id, req.active(), req.reason(), AdminController.userId(jwt));
	}

	/** New STAFF account: the person receives a single-use link (48 hours) to choose their password. */
	@PostMapping("/users/invitations")
	@ResponseStatus(HttpStatus.CREATED)
	public UserRow invite(@Valid @RequestBody InviteRequest req, @AuthenticationPrincipal Jwt jwt) {
		return users.inviteStaff(req.fullName(), req.email(), req.reason(), AdminController.userId(jwt));
	}

	@GetMapping("/audit-logs")
	public PageResponse<AuditRow> auditLog(@RequestParam(required = false) UUID actorId,
			@RequestParam(required = false) String entityType, @RequestParam(required = false) String action,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
			@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "50") int size) {
		return users.auditLog(actorId, entityType, action, from, to, page, size);
	}

	@GetMapping("/audit-logs/actors")
	public List<Actor> auditActors() {
		return users.auditActors();
	}
}
