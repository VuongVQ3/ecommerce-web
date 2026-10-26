package com.nutshop.mail;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Regression for run-2 lead 7: with no Resend key the app used to fall back to the log-only sender, which writes
 * reset/invite/verification/tracking links to the service logs. Production must fail fast instead. The log-only
 * sender is allowed only behind an explicit dev flag.
 */
class MailConfigFailFastTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withUserConfiguration(MailConfig.class).withPropertyValues("app.mail.from=shop@example.com");

	@Test
	void emptyKeyWithoutDevFlagFailsStartup() {
		runner.withPropertyValues("app.mail.resend-api-key=", "app.mail.allow-logging-sender=false").run(context -> {
			assertThat(context).hasFailed();
			assertThat(context).getFailure().rootCause().hasMessageContaining("RESEND_API_KEY must be set");
		});
	}

	@Test
	void emptyKeyWithDevFlagUsesLoggingSender() {
		runner.withPropertyValues("app.mail.resend-api-key=", "app.mail.allow-logging-sender=true").run(context -> {
			assertThat(context).hasNotFailed();
			assertThat(context).getBean(EmailSender.class).isInstanceOf(LoggingEmailSender.class);
		});
	}

	@Test
	void keyPresentUsesResend() {
		runner.withPropertyValues("app.mail.resend-api-key=re_dummy_key").run(context -> {
			assertThat(context).hasNotFailed();
			assertThat(context).getBean(EmailSender.class).isInstanceOf(ResendEmailSender.class);
		});
	}
}
