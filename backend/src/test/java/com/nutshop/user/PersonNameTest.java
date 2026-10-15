package com.nutshop.user;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class PersonNameTest {

	@Test
	void acceptsNamesInAnyLanguageWithTheUsualPunctuation() {
		assertThat(PersonName.Validator.valid("Võ Quốc Vương")).isTrue();
		assertThat(PersonName.Validator.valid("  Nguyễn Thị Ánh  ")).isTrue();
		assertThat(PersonName.Validator.valid("Mary-Jane O'Neil Jr.")).isTrue();
		// Accents typed as combining marks (decomposed)
		assertThat(PersonName.Validator.valid("Võ Quốc")).isTrue();
		assertThat(PersonName.Validator.valid("Lê")).isTrue();
	}

	@Test
	void rejectsDigitsSymbolsAndWrongLengths() {
		assertThat(PersonName.Validator.valid("2222")).isFalse();
		assertThat(PersonName.Validator.valid("Nam 2")).isFalse();
		assertThat(PersonName.Validator.valid("Hạt@")).isFalse();
		assertThat(PersonName.Validator.valid("A")).isFalse();
		assertThat(PersonName.Validator.valid(" .- ")).isFalse();
		assertThat(PersonName.Validator.valid("a".repeat(61))).isFalse();
		assertThat(PersonName.Validator.valid("a".repeat(60))).isTrue();
		assertThat(PersonName.Validator.valid(null)).isFalse();
	}
}
