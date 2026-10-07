package com.nutshop.user;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class PhoneNumbersTest {

	@ParameterizedTest
	@CsvSource({
			"0912345678,       0912345678",
			"0912 345 678,     0912345678",
			"0912.345.678,     0912345678",
			"0912-345-678,     0912345678",
			"+84912345678,     0912345678",
			"+84 912 345 678,  0912345678",
			"84912345678,      0912345678",
			"84.912.345.678,   0912345678",
			"' 0912 345 678 ', 0912345678",
	})
	void normalizesCommonFormatsToTenDigits(String input, String expected) {
		String normalized = PhoneNumbers.normalize(input);
		assertThat(normalized).isEqualTo(expected);
		assertThat(PhoneNumbers.isValid(normalized)).isTrue();
	}

	@ParameterizedTest
	@ValueSource(strings = { "912345678", "09123456789", "1912345678", "0912abc678", "+1 555 123 4567", "849123456",
			"+840912345678", "84 0912 345 678" })
	void rejectsMalformedNumbers(String input) {
		assertThat(PhoneNumbers.isValid(PhoneNumbers.normalize(input))).isFalse();
	}

	@ParameterizedTest
	@NullAndEmptySource
	@ValueSource(strings = { "   ", " . " })
	void blankMeansNoPhone(String input) {
		assertThat(PhoneNumbers.normalize(input)).isNull();
	}

	@ParameterizedTest
	@ValueSource(strings = { "0849123456", "0841234567" })
	void doesNotStripEightyFourFromNumbersThatStartWithZero(String input) {
		assertThat(PhoneNumbers.normalize(input)).isEqualTo(input);
	}
}
