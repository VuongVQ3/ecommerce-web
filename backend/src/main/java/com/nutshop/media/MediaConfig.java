package com.nutshop.media;

import com.nutshop.common.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.util.StringUtils;


@Configuration(proxyBeanMethods = false)
public class MediaConfig {

	private static final Logger log = LoggerFactory.getLogger(MediaConfig.class);

	@Bean
	ImageStorage imageStorage(@Value("${app.cloudinary-url:}") String cloudinaryUrl) {
		if (StringUtils.hasText(cloudinaryUrl)) {
			return new CloudinaryImageStorage(cloudinaryUrl);
		}
		log.warn("CLOUDINARY_URL is not set: product image uploads are disabled");
		return new ImageStorage() {
			@Override
			public boolean isEnabled() {
				return false;
			}

			@Override
			public StoredImage upload(byte[] bytes, ImageTypes.ImageType type) {
				throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "IMAGE_UPLOAD_DISABLED",
						"Chưa cấu hình nơi lưu ảnh (CLOUDINARY_URL). Liên hệ quản trị kỹ thuật.");
			}

			@Override
			public void delete(String publicId) {
			}
		};
	}
}
