package com.nutshop.auth;

import com.nutshop.audit.AuditLog;
import com.nutshop.common.ApiException;
import com.nutshop.common.SecureTokens;
import com.nutshop.mail.EmailMessage;
import com.nutshop.mail.EmailSender;
import com.nutshop.security.RateLimiter;
import com.nutshop.site.SiteProperties;
import com.nutshop.user.User;
import com.nutshop.user.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.TaskExecutor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.util.HtmlUtils;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * Proves an account owns its email: a single-use link valid for 24 hours. Verification is what allows guest orders
 * placed with that email to be attached to the account (see VerifiedEmailHook), so it is never inferred from a
 * phone number or from the account simply claiming the address.
 */
@Service
public class EmailVerificationService {

	public static final Duration TTL = Duration.ofHours(24);
	static final String INVALID_LINK = "INVALID_LINK";

	private static final Logger log = LoggerFactory.getLogger(EmailVerificationService.class);

	public record VerificationResult(String email, int attachedOrders) {
	}

	private final EmailVerificationTokenRepository tokens;
	private final UserRepository users;
	private final ObjectProvider<VerifiedEmailHook> hooks;
	private final AuditLog audit;
	private final EmailSender emailSender;
	private final TaskExecutor executor;
	private final RateLimiter resendLimiter;
	private final SiteProperties site;
	private final Clock clock;

	public EmailVerificationService(EmailVerificationTokenRepository tokens, UserRepository users,
			ObjectProvider<VerifiedEmailHook> hooks, AuditLog audit, EmailSender emailSender,
			@Qualifier("applicationTaskExecutor") TaskExecutor executor,
			@Qualifier("verificationEmailRateLimiter") RateLimiter resendLimiter, SiteProperties site, Clock clock) {
		this.tokens = tokens;
		this.users = users;
		this.hooks = hooks;
		this.audit = audit;
		this.emailSender = emailSender;
		this.executor = executor;
		this.resendLimiter = resendLimiter;
		this.site = site;
		this.clock = clock;
	}

	/** Emails a fresh link (earlier ones stop working). Sent after the surrounding transaction commits. */
	@Transactional
	public void sendLink(User user) {
		if (user.isEmailVerified()) {
			return;
		}
		Instant now = clock.instant();
		tokens.invalidateUnused(user.getId(), now);
		String raw = SecureTokens.generate();
		tokens.save(new EmailVerificationToken(user.getId(), SecureTokens.hash(raw), now, now.plus(TTL)));
		EmailMessage message = email(user, site.absolute("/xac-minh-email?token=" + raw));
		UUID userId = user.getId();
		TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
			@Override
			public void afterCommit() {
				executor.execute(() -> {
					try {
						emailSender.send(message);
					}
					catch (RuntimeException ex) {
						log.error("Could not send verification email to user {}", userId, ex);
					}
				});
			}
		});
	}

	/** "Gửi lại email xác minh" on the account page: 3 per 15 minutes per account. */
	@Transactional
	public void resend(UUID userId) {
		User user = users.findById(userId).filter(User::isActive)
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "Không tìm thấy tài khoản"));
		if (user.isEmailVerified()) {
			throw new ApiException(HttpStatus.CONFLICT, "ALREADY_VERIFIED", "Email của bạn đã được xác minh");
		}
		var retryAfter = resendLimiter.tryAcquire(userId.toString());
		if (retryAfter.isPresent()) {
			throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_REQUESTS",
					"Bạn vừa yêu cầu nhiều lần. Vui lòng kiểm tra hộp thư hoặc thử lại sau ít phút.");
		}
		sendLink(user);
	}

	/** Single use; an invalid, used or expired link gives the same error. */
	@Transactional
	public VerificationResult verify(String rawToken) {
		Instant now = clock.instant();
		EmailVerificationToken token = (rawToken == null || rawToken.isBlank() ? null
				: tokens.findByTokenHash(SecureTokens.hash(rawToken.trim())).filter(t -> t.isUsable(now)).orElse(null));
		User user = token == null ? null : users.findById(token.getUserId()).filter(User::isActive).orElse(null);
		if (user == null) {
			throw new ApiException(HttpStatus.BAD_REQUEST, INVALID_LINK,
					"Link xác minh không hợp lệ hoặc đã hết hạn. Bạn có thể gửi lại email xác minh trong trang Tài khoản.");
		}
		token.markUsed(now);
		tokens.invalidateUnused(user.getId(), now);
		return new VerificationResult(user.getEmail(), markVerified(user, "EMAIL_LINK"));
	}

	/**
	 * Marks the email verified (no-op if it already was) and lets the hooks attach what belongs to it.
	 *
	 * @param method how it was proven, for the audit log (EMAIL_LINK, GOOGLE)
	 * @return number of guest orders attached
	 */
	@Transactional
	public int markVerified(User user, String method) {
		if (!user.markEmailVerified(clock.instant())) {
			return 0;
		}
		audit.entry("USER_EMAIL_VERIFIED", "USER", user.getId(), AuditLog.userLabel(user.getFullName(), user.getEmail()))
			.byCustomer(user.getId())
			.changes(null, Map.of("method", method))
			.record();
		return hooks.orderedStream().mapToInt(h -> h.onEmailVerified(user.getId(), user.getEmail())).sum();
	}

	private static EmailMessage email(User user, String link) {
		String name = HtmlUtils.htmlEscape(user.getFullName());
		String href = HtmlUtils.htmlEscape(link);
		String html = """
				<div style="font-family:Arial,sans-serif;font-size:15px;color:#292524;line-height:1.6;max-width:520px">
				  <p>Xin chào %s,</p>
				  <p>Vui lòng xác minh email cho tài khoản Hạt Lành của bạn. Sau khi xác minh, các đơn hàng bạn đã đặt
				  bằng email này khi chưa đăng nhập sẽ được lưu vào tài khoản.</p>
				  <p><a href="%s" style="display:inline-block;background:#3d7130;color:#ffffff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:bold">Xác minh email</a></p>
				  <p>Liên kết có hiệu lực trong 24 giờ và chỉ dùng được một lần.</p>
				  <p>Nếu bạn không tạo tài khoản, hãy bỏ qua email này.</p>
				  <p style="color:#57534d;font-size:13px">Nếu nút không bấm được, hãy mở liên kết sau:<br>%s</p>
				</div>""".formatted(name, href, href);
		String text = """
				Xin chào %s,

				Vui lòng xác minh email cho tài khoản Hạt Lành của bạn (hiệu lực 24 giờ, dùng một lần):

				%s

				Sau khi xác minh, các đơn hàng bạn đã đặt bằng email này khi chưa đăng nhập sẽ được lưu vào tài khoản.
				Nếu bạn không tạo tài khoản, hãy bỏ qua email này.""".formatted(user.getFullName(), link);
		return new EmailMessage(user.getEmail(), "Xác minh email tài khoản Hạt Lành", html, text);
	}
}
