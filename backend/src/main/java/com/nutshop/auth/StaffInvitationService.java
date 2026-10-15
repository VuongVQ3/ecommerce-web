package com.nutshop.auth;

import com.nutshop.audit.AuditLog;
import com.nutshop.common.ApiException;
import com.nutshop.common.SecureTokens;
import com.nutshop.mail.EmailMessage;
import com.nutshop.mail.EmailSender;
import com.nutshop.site.SiteProperties;
import com.nutshop.user.User;
import com.nutshop.user.UserRepository;
import com.nutshop.user.UserStatusCache;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.TaskExecutor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.util.HtmlUtils;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * New staff accounts. An admin enters a name and an email; the account is created without a password and the person
 * receives a single-use link (48 hours, only its hash is stored) to choose their own. Admins never set or see
 * passwords.
 */
@Service
public class StaffInvitationService {

	public static final Duration TTL = Duration.ofHours(48);
	private static final Logger log = LoggerFactory.getLogger(StaffInvitationService.class);

	private final UserRepository users;
	private final PasswordResetTokenRepository tokens;
	private final PasswordEncoder passwordEncoder;
	private final EmailVerificationService verification;
	private final UserStatusCache statuses;
	private final AuditLog audit;
	private final EmailSender emailSender;
	private final TaskExecutor executor;
	private final SiteProperties site;
	private final Clock clock;

	public StaffInvitationService(UserRepository users, PasswordResetTokenRepository tokens,
			PasswordEncoder passwordEncoder, EmailVerificationService verification, UserStatusCache statuses,
			AuditLog audit, EmailSender emailSender, @Qualifier("applicationTaskExecutor") TaskExecutor executor,
			SiteProperties site, Clock clock) {
		this.users = users;
		this.tokens = tokens;
		this.passwordEncoder = passwordEncoder;
		this.verification = verification;
		this.statuses = statuses;
		this.audit = audit;
		this.emailSender = emailSender;
		this.executor = executor;
		this.site = site;
		this.clock = clock;
	}

	@Transactional
	public User invite(String fullName, String rawEmail, String reason, UUID actorId) {
		String email = rawEmail.trim().toLowerCase(Locale.ROOT);
		if (users.existsByEmail(email)) {
			throw new ApiException(HttpStatus.CONFLICT, AuthService.EMAIL_EXISTS,
					"Email này đã có tài khoản. Hãy đổi role của tài khoản đó trong danh sách người dùng.");
		}
		User user = users.saveAndFlush(User.invited(email, fullName.trim()));
		Instant now = clock.instant();
		String raw = SecureTokens.generate();
		tokens.save(new PasswordResetToken(user, SecureTokens.hash(raw), now, now.plus(TTL),
				PasswordResetToken.Purpose.INVITE));
		audit.entry("USER_INVITED", "USER", user.getId(), AuditLog.userLabel(user.getFullName(), email))
			.by(actorId)
			.changes(null, Map.of("email", email, "role", user.getRole().name()))
			.reason(reason)
			.record();
		EmailMessage message = email(user, site.absolute("/dat-mat-khau?token=" + raw));
		UUID userId = user.getId();
		TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
			@Override
			public void afterCommit() {
				executor.execute(() -> {
					try {
						emailSender.send(message);
					}
					catch (RuntimeException ex) {
						log.error("Could not send invitation email to user {}", userId, ex);
					}
				});
			}
		});
		return user;
	}

	/** Single use, 48 hours. Setting the password also proves the email and accepts the terms. */
	@Transactional
	public void accept(String rawToken, String newPassword) {
		Instant now = clock.instant();
		PasswordResetToken token = tokens.findByTokenHash(SecureTokens.hash(rawToken))
			.filter(t -> t.getPurpose() == PasswordResetToken.Purpose.INVITE && t.isUsable(now) && t.getUser().isActive())
			.orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "INVALID_LINK",
					"Liên kết mời không hợp lệ hoặc đã hết hạn. Vui lòng nhờ quản trị viên gửi lời mời mới."));
		User user = token.getUser();
		user.changePassword(passwordEncoder.encode(newPassword));
		user.acceptTerms(now);
		token.markUsed(now);
		tokens.invalidateUnused(user.getId(), now);
		verification.markVerified(user, "INVITATION");
		statuses.evict(user.getId());
	}

	private static EmailMessage email(User user, String link) {
		String name = HtmlUtils.htmlEscape(user.getFullName());
		String href = HtmlUtils.htmlEscape(link);
		String html = """
				<div style="font-family:Arial,sans-serif;font-size:15px;color:#292524;line-height:1.6;max-width:520px">
				  <p>Xin chào %s,</p>
				  <p>Bạn được mời làm nhân viên của cửa hàng Hạt Lành. Hãy đặt mật khẩu để bắt đầu dùng trang quản trị.</p>
				  <p><a href="%s" style="display:inline-block;background:#3d7130;color:#ffffff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:bold">Đặt mật khẩu</a></p>
				  <p>Liên kết có hiệu lực trong 48 giờ và chỉ dùng được một lần. Nếu bạn không mong đợi email này, hãy bỏ qua.</p>
				  <p style="color:#57534d;font-size:13px">Nếu nút không bấm được, hãy mở liên kết sau:<br>%s</p>
				</div>""".formatted(name, href, href);
		String text = """
				Xin chào %s,

				Bạn được mời làm nhân viên của cửa hàng Hạt Lành. Mở liên kết sau để đặt mật khẩu (hiệu lực 48 giờ, dùng một lần):

				%s

				Nếu bạn không mong đợi email này, hãy bỏ qua.""".formatted(user.getFullName(), link);
		return new EmailMessage(user.getEmail(), "Lời mời làm nhân viên Hạt Lành", html, text);
	}
}
