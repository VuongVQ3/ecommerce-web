package com.nutshop.media;

import com.cloudinary.Cloudinary;
import com.cloudinary.Uploader;
import com.nutshop.media.AssetTypes.AssetType;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
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

/** DAM file types and the Cloudinary asset store (uploader mocked, no network). */
class AssetMediaTest {

	static byte[] realImage(String format) throws IOException {
		var out = new ByteArrayOutputStream();
		ImageIO.write(new BufferedImage(4, 3, BufferedImage.TYPE_INT_RGB), format, out);
		return out.toByteArray();
	}

	static final byte[] PDF = """
			%PDF-1.4
			1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
			2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj
			trailer << /Root 1 0 R >>
			%%EOF
			""".getBytes(StandardCharsets.US_ASCII);

	static final byte[] WEBP = "RIFF\0\0\0\0WEBPVP8 ....".getBytes(StandardCharsets.US_ASCII);

	@Test
	void realFilesAreRecognisedByTheirContent() throws IOException {
		assertThat(AssetTypes.detect(realImage("jpg"))).contains(AssetType.IMAGE_JPEG);
		assertThat(AssetTypes.detect(realImage("png"))).contains(AssetType.IMAGE_PNG);
		assertThat(AssetTypes.detect(WEBP)).contains(AssetType.IMAGE_WEBP);
		assertThat(AssetTypes.detect(PDF)).contains(AssetType.PDF);
		assertThat(AssetType.PDF.kind()).isEqualTo(AssetTypes.Kind.PDF);
		assertThat(AssetType.IMAGE_WEBP.mime()).isEqualTo("image/webp");
	}

	@Test
	void namesMustAgreeWithTheContent() throws IOException {
		assertThat(AssetTypes.check(realImage("jpg"), "Ảnh bìa.JPEG")).contains(AssetType.IMAGE_JPEG);
		assertThat(AssetTypes.check(PDF, "Bảng giá 2026.pdf")).contains(AssetType.PDF);
		assertThat(AssetTypes.check(realImage("png"), "khong-duoi")).contains(AssetType.IMAGE_PNG);
		// A PDF renamed to .jpg, a text file or a program renamed to .pdf, an image claiming another image type
		assertThat(AssetTypes.check(PDF, "bang-gia.jpg")).isEmpty();
		assertThat(AssetTypes.check("chỉ là chữ".getBytes(StandardCharsets.UTF_8), "ghi-chu.pdf")).isEmpty();
		assertThat(AssetTypes.check(new byte[] { 'M', 'Z', (byte) 0x90, 0 }, "setup.pdf")).isEmpty();
		assertThat(AssetTypes.check(realImage("png"), "anh.jpg")).isEmpty();
		assertThat(AssetTypes.check(new byte[0], "rong.pdf")).isEmpty();
		assertThat(AssetTypes.detect(null)).isEmpty();
		assertThat(AssetTypes.detect("%PD".getBytes(StandardCharsets.US_ASCII))).isEmpty();
	}

	@Test
	void extensions() {
		assertThat(AssetTypes.extension("Bảng giá.PDF")).isEqualTo("pdf");
		assertThat(AssetTypes.extension("C:\\Users\\a\\anh.webp")).isEqualTo("webp");
		assertThat(AssetTypes.extension(".hidden")).isEmpty();
		assertThat(AssetTypes.extension("cham-cuoi.")).isEmpty();
		assertThat(AssetTypes.extension(null)).isEmpty();
	}

	// ---- CloudinaryAssetStorage -----------------------------------------------------------------------------

	private static final String URL = "cloudinary://123456789012345:s3cr3t-Value_x@demo";

	private static CloudinaryAssetStorage storage(Uploader uploader) {
		Cloudinary cloudinary = spy(new Cloudinary(CloudinaryImageStorage.normalize(URL)));
		doReturn(uploader).when(cloudinary).uploader();
		return new CloudinaryAssetStorage(cloudinary);
	}

	@SuppressWarnings("unchecked")
	private static Map<String, Object> options(Uploader uploader, byte[] bytes) throws IOException {
		ArgumentCaptor<Map<String, Object>> options = ArgumentCaptor.forClass(Map.class);
		verify(uploader).upload(eq(bytes), options.capture());
		return options.getValue();
	}

	@Test
	void aPdfGoesIntoTheDamFolderAsAnImageResourceAndReportsItsPages() throws Exception {
		Uploader uploader = mock(Uploader.class);
		when(uploader.upload(any(), any())).thenReturn(Map.of("public_id", "hat-lanh/dam/abc", "secure_url",
				"https://res.cloudinary.com/demo/image/upload/v17/hat-lanh/dam/abc.pdf", "version", 17L, "pages", 4,
				"width", 595, "height", 842, "bytes", 1234));

		var stored = storage(uploader).upload(PDF, AssetTypes.Kind.PDF);

		assertThat(stored.publicId()).isEqualTo("hat-lanh/dam/abc");
		assertThat(stored.version()).isEqualTo(17L);
		assertThat(stored.pages()).isEqualTo(4);
		assertThat(stored.bytes()).isEqualTo(1234L);
		assertThat(options(uploader, PDF)).containsEntry("folder", "hat-lanh/dam")
			.containsEntry("resource_type", "image")
			.containsEntry("return_error", true);
	}

	@Test
	void replacingOverwritesTheSamePublicIdAndInvalidatesTheCdn() throws Exception {
		Uploader uploader = mock(Uploader.class);
		when(uploader.upload(any(), any())).thenReturn(Map.of("public_id", "hat-lanh/dam/abc", "secure_url",
				"https://res.cloudinary.com/demo/image/upload/v18/hat-lanh/dam/abc.png", "version", 18L));
		byte[] png = realImage("png");

		var stored = storage(uploader).replace("hat-lanh/dam/abc", png, AssetTypes.Kind.IMAGE);

		assertThat(stored.version()).isEqualTo(18L);
		assertThat(options(uploader, png)).containsEntry("public_id", "hat-lanh/dam/abc")
			.containsEntry("overwrite", true)
			.containsEntry("invalidate", true)
			.doesNotContainKey("folder");
	}

	@Test
	void refusalsBecomeClearMessagesWithTheKeyMasked() throws Exception {
		Uploader uploader = mock(Uploader.class);
		when(uploader.upload(any(), any())).thenReturn(Map.of("error",
				Map.of("http_code", 401, "message", "Invalid api_key 123456789012345")));
		var logs = new ch.qos.logback.core.read.ListAppender<ch.qos.logback.classic.spi.ILoggingEvent>();
		var logger = (ch.qos.logback.classic.Logger) org.slf4j.LoggerFactory.getLogger(CloudinaryAssetStorage.class);
		logs.start();
		logger.addAppender(logs);
		try {
			assertThatThrownBy(() -> storage(uploader).upload(PDF, AssetTypes.Kind.PDF))
				.isInstanceOf(AssetStorageException.class)
				.extracting("code").isEqualTo(AssetStorageException.AUTH_FAILED);
		}
		finally {
			logger.detachAppender(logs);
		}
		assertThat(logs.list).extracting(e -> e.getFormattedMessage())
			.anySatisfy(m -> assertThat(m).contains("HTTP 401").contains("****2345"))
			.allSatisfy(m -> assertThat(m).doesNotContain("s3cr3t").doesNotContain("123456789012345"));

		when(uploader.upload(any(), any())).thenThrow(new IOException("connect timed out"));
		assertThatThrownBy(() -> storage(uploader).replace("x", PDF, AssetTypes.Kind.PDF))
			.isInstanceOf(AssetStorageException.class)
			.extracting("code").isEqualTo(AssetStorageException.FAILED);
	}

	@Test
	void deletingIsBestEffort() throws Exception {
		Uploader uploader = mock(Uploader.class);
		when(uploader.destroy(any(), any())).thenThrow(new IOException("down"));
		storage(uploader).delete("hat-lanh/dam/abc");
		verify(uploader).destroy(eq("hat-lanh/dam/abc"), any());
	}
}
