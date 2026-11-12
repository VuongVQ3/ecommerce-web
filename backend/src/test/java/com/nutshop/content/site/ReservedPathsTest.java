package com.nutshop.content.site;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** The fixed routes a top-level CMS page may not take, read from the controllers. */
class ReservedPathsTest {

	private final ReservedPaths reserved = new ReservedPaths();

	@Test
	void everyFixedRouteOfTheAppIsReserved() {
		assertThat(reserved.segments()).contains("san-pham", "danh-muc", "blog", "gio-hang", "thanh-toan", "admin", "author",
				"tai-khoan", "dang-nhap", "dang-ky", "don-hang", "lien-he", "files", "api", "assets", "robots.txt");
		assertThat(reserved.isReserved("/san-pham")).isTrue();
		assertThat(reserved.isReserved("/blog/bai-moi")).isTrue();
		assertThat(reserved.isReserved("/gioi-thieu")).isFalse();
		assertThat(reserved.isReserved("/khuyen-mai-tet/san-pham")).isFalse();
	}

	@Test
	void firstSegments() {
		assertThat(ReservedPaths.firstSegment("/san-pham/{slug}")).isEqualTo("san-pham");
		assertThat(ReservedPaths.firstSegment("/admin/**")).isEqualTo("admin");
		assertThat(ReservedPaths.firstSegment("/")).isEmpty();
	}
}
