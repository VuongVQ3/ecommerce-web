package com.nutshop.media;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;

/**
 * Minimal Cloudinary client (signed upload + destroy) over its REST API, configured from
 * CLOUDINARY_URL = cloudinary://API_KEY:API_SECRET@CLOUD_NAME. The secret never leaves the server.
 * https://cloudinary.com/documentation/authentication_signatures
 */
public class CloudinaryImageStorage implements ImageStorage {

	static final String FOLDER = "hat-lanh/products";

	private final RestClient client;
	private final String apiKey;
	private final String apiSecret;
	private final Clock clock;

	public CloudinaryImageStorage(String cloudinaryUrl, Clock clock) {
		this(RestClient.builder().requestFactory(timeouts()), cloudinaryUrl, clock);
	}

	/** For tests: the builder may be bound to a MockRestServiceServer. */
	CloudinaryImageStorage(RestClient.Builder builder, String cloudinaryUrl, Clock clock) {
		URI uri = URI.create(cloudinaryUrl.trim());
		if (!"cloudinary".equals(uri.getScheme()) || uri.getUserInfo() == null || !uri.getUserInfo().contains(":")) {
			throw new IllegalStateException("CLOUDINARY_URL must look like cloudinary://API_KEY:API_SECRET@CLOUD_NAME");
		}
		String[] credentials = uri.getUserInfo().split(":", 2);
		this.apiKey = credentials[0];
		this.apiSecret = credentials[1];
		this.client = builder.baseUrl("https://api.cloudinary.com/v1_1/" + uri.getHost()).build();
		this.clock = clock;
	}

	@Override
	public boolean isEnabled() {
		return true;
	}

	@Override
	public StoredImage upload(byte[] bytes, ImageTypes.ImageType type) {
		Map<String, String> signed = new TreeMap<>(Map.of("folder", FOLDER, "timestamp", timestamp()));
		var form = new LinkedMultiValueMap<String, Object>();
		signed.forEach(form::add);
		form.add("api_key", apiKey);
		form.add("signature", sign(signed));
		form.add("file", new ByteArrayResource(bytes) {
			@Override
			public String getFilename() {
				return "upload." + type.name().toLowerCase();
			}
		});
		Map<?, ?> result = client.post()
			.uri("/image/upload")
			.contentType(MediaType.MULTIPART_FORM_DATA)
			.body(form)
			.retrieve()
			.body(Map.class);
		if (result == null || result.get("public_id") == null || result.get("secure_url") == null) {
			throw new IllegalStateException("Unexpected Cloudinary upload response");
		}
		return new StoredImage((String) result.get("public_id"), (String) result.get("secure_url"),
				number(result.get("width")), number(result.get("height")));
	}

	@Override
	public void delete(String publicId) {
		Map<String, String> signed = new TreeMap<>(Map.of("public_id", publicId, "timestamp", timestamp()));
		var form = new LinkedMultiValueMap<String, String>();
		signed.forEach(form::add);
		form.add("api_key", apiKey);
		form.add("signature", sign(signed));
		client.post().uri("/image/destroy").contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve().toBodilessEntity();
	}

	/** SHA-1 of the alphabetically sorted "key=value" pairs joined by "&", followed by the API secret. */
	String sign(Map<String, String> params) {
		String toSign = new TreeMap<>(params).entrySet()
			.stream()
			.map(e -> e.getKey() + "=" + e.getValue())
			.collect(Collectors.joining("&")) + apiSecret;
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-1").digest(toSign.getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException ex) {
			throw new IllegalStateException(ex);
		}
	}

	private String timestamp() {
		return String.valueOf(clock.instant().getEpochSecond());
	}

	private static Integer number(Object value) {
		return value instanceof Number n ? n.intValue() : null;
	}

	private static SimpleClientHttpRequestFactory timeouts() {
		var factory = new SimpleClientHttpRequestFactory();
		factory.setConnectTimeout(Duration.ofSeconds(10));
		factory.setReadTimeout(Duration.ofSeconds(60));
		return factory;
	}
}
