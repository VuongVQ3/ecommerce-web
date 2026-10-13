package com.nutshop.address;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class AdminUnitsTest {

	private final AdminUnits units = new AdminUnits(JsonMapper.builder().build());

	@Test
	void resolvesCodesOfTheCurrentTwoLevelStructure() {
		assertThat(units.provinceCount()).isEqualTo(34);
		assertThat(units.resolve(1, 4)).contains(new AdminUnits.Address("Thành phố Hà Nội", "Phường Ba Đình"));
	}

	@Test
	void rejectsAWardFromAnotherProvinceOrUnknownCodes() {
		assertThat(units.resolve(79, 4)).isEmpty();
		assertThat(units.resolve(1, 99_999_999)).isEmpty();
		assertThat(units.resolve(999, 4)).isEmpty();
	}

	/** The frontend dropdowns and the backend validation must use exactly the same data. */
	@Test
	void backendCopyMatchesTheFrontendFile() throws Exception {
		Path frontend = Path.of("..", "frontend", "src", "data", "vn-admin-units.json");
		Path backend = Path.of("src", "main", "resources", "vn-admin-units.json");
		assertThat(Files.readAllBytes(backend)).isEqualTo(Files.readAllBytes(frontend));
	}
}
