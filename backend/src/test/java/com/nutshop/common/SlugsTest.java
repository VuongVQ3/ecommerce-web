package com.nutshop.common;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SlugsTest {

	@Test
	void stripsVietnameseAccents() {
		assertThat(Slugs.from("Hạt Điều Rang Muối")).isEqualTo("hat-dieu-rang-muoi");
		assertThat(Slugs.from("  Óc chó (Mỹ) – 500g!! ")).isEqualTo("oc-cho-my-500g");
		assertThat(Slugs.from("Đậu phộng đường")).isEqualTo("dau-phong-duong");
		assertThat(Slugs.from("!!!")).isEmpty();
	}

	@Test
	void validatesSlugs() {
		assertThat(Slugs.isValid("hat-dieu-500g")).isTrue();
		assertThat(Slugs.isValid("Hat-dieu")).isFalse();
		assertThat(Slugs.isValid("hat--dieu")).isFalse();
		assertThat(Slugs.isValid("-hat")).isFalse();
		assertThat(Slugs.isValid("hạt")).isFalse();
		assertThat(Slugs.isValid("")).isFalse();
	}
}
