package com.nutshop.media;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class MediaTest {

	private static final Clock CLOCK = Clock.fixed(Instant.ofEpochSecond(1315060510), ZoneOffset.UTC);

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

	/** Example from https://cloudinary.com/documentation/authentication_signatures */
	@Test
	void signsLikeCloudinaryDocuments() {
		var storage = new CloudinaryImageStorage(RestClient.builder(), "cloudinary://key:abcd@demo", CLOCK);
		assertThat(storage.sign(Map.of("timestamp", "1315060510", "public_id", "sample_image", "eager",
				"w_400,h_300,c_pad|w_260,h_200,c_crop")))
			.isEqualTo("bfd09f95f331f558cbd1320e67aa8d488770583e");
	}

	@Test
	void uploadsToTheConfiguredCloud() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		server.expect(requestTo("https://api.cloudinary.com/v1_1/demo/image/upload"))
			.andExpect(method(HttpMethod.POST))
			.andRespond(withSuccess("""
					{"public_id":"hat-lanh/products/abc","secure_url":"https://res.cloudinary.com/demo/image/upload/v1/hat-lanh/products/abc.png","width":640,"height":480}""",
					MediaType.APPLICATION_JSON));
		var storage = new CloudinaryImageStorage(builder, "cloudinary://key:secret@demo", CLOCK);

		var stored = storage.upload(new byte[] { 1, 2, 3 }, ImageTypes.ImageType.PNG);

		assertThat(stored.publicId()).isEqualTo("hat-lanh/products/abc");
		assertThat(stored.width()).isEqualTo(640);
		server.verify();
	}

	@Test
	void rejectsMalformedUrl() {
		assertThatThrownBy(() -> new CloudinaryImageStorage(RestClient.builder(), "https://demo", CLOCK))
			.isInstanceOf(IllegalStateException.class);
	}
}
