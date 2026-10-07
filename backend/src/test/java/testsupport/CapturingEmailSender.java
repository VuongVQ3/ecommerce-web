package testsupport;

import com.nutshop.mail.EmailMessage;
import com.nutshop.mail.EmailSender;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

import java.time.Duration;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/** Records outgoing emails instead of sending them. Emails are sent asynchronously, so tests poll with a timeout. */
public class CapturingEmailSender implements EmailSender {

	private final BlockingQueue<EmailMessage> sent = new LinkedBlockingQueue<>();

	@Override
	public void send(EmailMessage message) {
		sent.add(message);
	}

	public EmailMessage next(Duration timeout) throws InterruptedException {
		return sent.poll(timeout.toMillis(), TimeUnit.MILLISECONDS);
	}

	public void clear() {
		sent.clear();
	}

	@TestConfiguration(proxyBeanMethods = false)
	public static class Config {

		@Bean
		@Primary
		CapturingEmailSender capturingEmailSender() {
			return new CapturingEmailSender();
		}
	}
}
