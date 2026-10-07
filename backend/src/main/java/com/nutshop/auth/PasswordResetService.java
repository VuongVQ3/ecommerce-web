package com.nutshop.auth;

import com.nutshop.mail.EmailMessage;
import com.nutshop.mail.EmailSender;
import com.nutshop.security.RateLimiter;
import com.nutshop.user.User;
import com.nutshop.user.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.task.TaskExecutor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.HtmlUtils;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;

/**
 * Forgot / reset password. The request endpoint behaves identically whether or not the email exists (same response,
 * email sent in the background after commit so timing does not differ by an outgoing HTTP call).
 */
@Service
public class PasswordResetService {

	static final String INVALID_LINK = "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu liên kết mới.";
	static final String TOO_MANY_REQUESTS = "Bạn đã yêu cầu quá nhiều lần. Vui lòng thử lại sau ít phút.";

	private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);

	private final UserRepository users;
	private final PasswordResetTokenRepository tokens;
	private final RefreshTokenService refreshTokens;
	private final PasswordEncoder passwordEncoder;
	private final EmailSender emailSender;
	private final TaskExecutor executor;
	private final RateLimiter perEmailLimiter;
	private final Clock clock;
	private final Duration ttl;
	private final String frontendUrl;

	public PasswordResetService(UserRepository users, PasswordResetTokenRepository tokens,
			RefreshTokenService refreshTokens, PasswordEncoder passwordEncoder, EmailSender emailSender,
			@Qualifier("applicationTaskExecutor") TaskExecutor executor,
			@Qualifier("passwordResetRateLimiter") RateLimiter perEmailLimiter, Clock clock,
			@Value("${app.password-reset.ttl}") Duration ttl, @Value("${app.frontend-url}") String frontendUrl) {
		this.users = users;
		this.tokens = tokens;
		this.refreshTokens = refreshTokens;
		this.passwordEncoder = passwordEncoder;
		this.emailSender = emailSender;
		this.executor = executor;
		this.perEmailLimiter = perEmailLimiter;
		this.clock = clock;
		this.ttl = ttl;
		this.frontendUrl = frontendUrl.replaceAll("/+$", "");
	}

	/**
	 * Emails a reset link if an active account has this email. Limited per email address (whether or not it exists,
	 * so the limit reveals nothing).
	 */
	@Transactional
	public void requestReset(String rawEmail) {
		String email = rawEmail.trim().toLowerCase(Locale.ROOT);
		if (perEmailLimiter.tryAcquire(email).isPresent()) {
			throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, TOO_MANY_REQUESTS);
		}
		users.findByEmail(email).filter(User::isActive).ifPresent(user -> {
			Instant now = clock.instant();
			tokens.invalidateUnused(user.getId(), now);
			String raw = SecureTokens.generate();
			tokens.save(new PasswordResetToken(user, SecureTokens.hash(raw), now, now.plus(ttl)));
			EmailMessage message = resetEmail(user, frontendUrl + "/dat-lai-mat-khau?token=" + raw);
			afterCommit(() -> {
				try {
					emailSender.send(message);
				}
				catch (RuntimeException ex) {
					log.error("Could not send password reset email to user {}", user.getId(), ex);
				}
			});
		});
	}

	/** Single use. On success every refresh token of the user is revoked, so all other sessions end. */
	@Transactional
	public void resetPassword(String rawToken, String newPassword) {
		Instant now = clock.instant();
		PasswordResetToken token = tokens.findByTokenHash(SecureTokens.hash(rawToken))
			.filter(t -> t.isUsable(now) && t.getUser().isActive())
			.orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, INVALID_LINK));
		User user = token.getUser();
		user.changePassword(passwordEncoder.encode(newPassword));
		token.markUsed(now);
		tokens.invalidateUnused(user.getId(), now);
		refreshTokens.revokeAll(user.getId());
	}

	private void afterCommit(Runnable task) {
		TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
			@Override
			public void afterCommit() {
				executor.execute(task);
			}
		});
	}

	private EmailMessage resetEmail(User user, String link) {
		long minutes = ttl.toMinutes();
		String name = HtmlUtils.htmlEscape(user.getFullName());
		String href = HtmlUtils.htmlEscape(link);
		String html = """
				<div style="font-family:Arial,sans-serif;font-size:15px;color:#292524;line-height:1.6;max-width:520px">
				  <p>Xin chào %s,</p>
				  <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản Hạt Lành của bạn.</p>
				  <p><a href="%s" style="display:inline-block;background:#3d7130;color:#ffffff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:bold">Đặt lại mật khẩu</a></p>
				  <p>Liên kết có hiệu lực trong %d phút và chỉ dùng được một lần.</p>
				  <p>Nếu bạn không yêu cầu, hãy bỏ qua email này, mật khẩu của bạn vẫn giữ nguyên.</p>
				  <p style="color:#57534d;font-size:13px">Nếu nút không bấm được, hãy mở liên kết sau:<br>%s</p>
				</div>""".formatted(name, href, minutes, href);
		String text = """
				Xin chào %s,

				Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản Hạt Lành của bạn.
				Mở liên kết sau để đặt mật khẩu mới (hiệu lực %d phút, chỉ dùng một lần):

				%s

				Nếu bạn không yêu cầu, hãy bỏ qua email này.""".formatted(user.getFullName(), minutes, link);
		return new EmailMessage(user.getEmail(), "Đặt lại mật khẩu tài khoản Hạt Lành", html, text);
	}
}
