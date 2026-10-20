package com.nutshop.media;

import com.cloudinary.Cloudinary;
import com.cloudinary.Uploader;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MediaTest {

	@Test
	void detectsImagesByContentNotName() {
		assertThat(ImageTypes.detect(new byte[] { (byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 0 }))
			.contains(ImageTypes.ImageType.JPEG);
		assertThat(ImageTypes.detect(new byte[] { (byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n' }))
			.contains(ImageTypes.ImageType.PNG);
		assertThat(ImageTypes.detect("RIFF\0\0\0\0WEBPVP8 ".getBytes())).contains(ImageTypes.ImageType.WEBP);
		assertThat(ImageTypes.detect("GIF89a....".getBytes())).isEmpty();
		assertThat(ImageTypes.detect("%PDF-1.7".getBytes())).isEmpty();
		assertThat(ImageTypes.detect("RIFF\0\0\0\0WAVE".getBytes())).isEmpty();
		assertThat(ImageTypes.detect(new byte[0])).isEmpty();
		assertThat(ImageTypes.detect(null)).isEmpty();
	}

	private static final String URL = "cloudinary://123456789012345:s3cr3t-Value_x@demo";

	/** A real SDK configuration whose uploader is a mock (no network). */
	private static CloudinaryImageStorage storage(Uploader uploader) {
		Cloudinary cloudinary = spy(new Cloudinary(CloudinaryImageStorage.normalize(URL)));
		doReturn(uploader).when(cloudinary).uploader();
		return new CloudinaryImageStorage(cloudinary);
	}

	@Test
	void acceptsTheUrlAsPastedFromTheConsoleOrADotEnvLine() {
		assertThat(CloudinaryImageStorage.normalize("  " + URL + "\n")).isEqualTo(URL);
		assertThat(CloudinaryImageStorage.normalize("CLOUDINARY_URL=" + URL)).isEqualTo(URL);
		assertThat(CloudinaryImageStorage.normalize("\"" + URL + "\"")).isEqualTo(URL);
		// Percent-encoded secret: kept for the SDK, which decodes it
		Cloudinary cloudinary = new Cloudinary(CloudinaryImageStorage.normalize("cloudinary://key:a%2Fb@demo"));
		assertThat(cloudinary.config.apiSecret).isEqualTo("a/b");
		assertThat(cloudinary.config.cloudName).isEqualTo("demo");
	}

	@Test
	void rejectsMalformedUrlWithoutEchoingIt() {
		for (String bad : new String[] { "https://demo", "cloudinary://onlykey@demo", "cloudinary://key:@demo", "" }) {
			assertThatThrownBy(() -> CloudinaryImageStorage.normalize(bad)).isInstanceOf(IllegalStateException.class)
				.hasMessageNotContaining("onlykey");
		}
	}

	@Test
	void uploadsIntoTheProductsFolderAndReturnsTheSecureUrl() throws Exception {
		Uploader uploader = mock(Uploader.class);
		when(uploader.upload(any(), any())).thenReturn(Map.of("public_id", "hat-lanh/products/abc", "secure_url",
				"https://res.cloudinary.com/demo/image/upload/v1/hat-lanh/products/abc.png", "width", 640, "height", 480));

		var stored = storage(uploader).upload(new byte[] { 1, 2, 3 }, ImageTypes.ImageType.PNG);

		assertThat(stored.publicId()).isEqualTo("hat-lanh/products/abc");
		assertThat(stored.url()).startsWith("https://res.cloudinary.com/");
		assertThat(stored.width()).isEqualTo(640);
		@SuppressWarnings("unchecked")
		org.mockito.ArgumentCaptor<Map<String, Object>> options = org.mockito.ArgumentCaptor.forClass(Map.class);
		verify(uploader).upload(eq(new byte[] { 1, 2, 3 }), options.capture());
		assertThat(options.getValue()).containsEntry("folder", "hat-lanh/products").containsEntry("resource_type", "image");
	}

	@Test
	void aRefusedSignatureBecomesAClearMessageAndTheSecretIsNotLogged() throws Exception {
		Uploader uploader = mock(Uploader.class);
		when(uploader.upload(any(), any())).thenReturn(Map.of("error",
				Map.of("http_code", 401, "message", "Invalid api_key 123456789012345")));
		var logs = new ch.qos.logback.core.read.ListAppender<ch.qos.logback.classic.spi.ILoggingEvent>();
		var logger = (ch.qos.logback.classic.Logger) org.slf4j.LoggerFactory.getLogger(CloudinaryImageStorage.class);
		logs.start();
		logger.addAppender(logs);
		try {
			assertThatThrownBy(() -> storage(uploader).upload(new byte[] { 1 }, ImageTypes.ImageType.PNG))
				.isInstanceOf(ImageStorageException.class)
				.hasMessage("Kho ảnh từ chối xác thực, kiểm tra cấu hình CLOUDINARY_URL")
				.extracting("code").isEqualTo(ImageStorageException.AUTH_FAILED);
		}
		finally {
			logger.detachAppender(logs);
		}
		assertThat(logs.list).extracting(e -> e.getFormattedMessage())
			.anySatisfy(m -> assertThat(m).contains("HTTP 401").contains("Invalid api_key ****2345"))
			.anySatisfy(m -> assertThat(m).contains("cloud_name=demo"))
			.allSatisfy(m -> assertThat(m).doesNotContain("s3cr3t").doesNotContain("123456789012345"));
	}

	@Test
	void otherFailuresAreAGenericTryAgain() throws Exception {
		Uploader uploader = mock(Uploader.class);
		when(uploader.upload(any(), any())).thenThrow(new java.io.IOException("connect timed out"));
		assertThatThrownBy(() -> storage(uploader).upload(new byte[] { 1 }, ImageTypes.ImageType.PNG))
			.isInstanceOf(ImageStorageException.class)
			.extracting("code").isEqualTo(ImageStorageException.FAILED);
	}
}
