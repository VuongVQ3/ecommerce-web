package com.nutshop.product;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ShortDescriptionTest {

	@Test
	void takesTheFirstParagraphSkippingTheSectionHeading() {
		assertThat(ShortDescription.fromDescription("""
				Giới thiệu:
				Hạt điều rang muối giòn tan.
				Rang mộc, không dầu.

				Bảo quản:
				Nơi khô ráo.""")).isEqualTo("Hạt điều rang muối giòn tan.");
		// A one-line first section is a paragraph, not a heading
		assertThat(ShortDescription.fromDescription("Mắc ca nguyên vỏ.\n\nBảo quản:\nNơi khô ráo."))
			.isEqualTo("Mắc ca nguyên vỏ.");
		// No blank line: one paragraph, line breaks read as spaces
		assertThat(ShortDescription.fromDescription("  Óc chó đỏ\r\nnhập khẩu   Mỹ.  ")).isEqualTo("Óc chó đỏ nhập khẩu Mỹ.");
		assertThat(ShortDescription.fromDescription("\n \n")).isNull();
		assertThat(ShortDescription.fromDescription(null)).isNull();
	}

	@Test
	void cutsAt160CharactersOnAWordBoundaryWithAnEllipsis() {
		String words = "Hạt điều rang muối giòn tan, ".repeat(10);
		String cut = ShortDescription.fromDescription(words);
		assertThat(cut).hasSizeLessThanOrEqualTo(ShortDescription.MAX).endsWith("…");
		String kept = cut.substring(0, cut.length() - 1);
		assertThat(words).startsWith(kept);
		// Whole words only, and no dangling comma before the "…"
		assertThat(words.charAt(kept.length())).isIn(' ', ',');
		assertThat(kept).doesNotEndWith(",").doesNotEndWith(" ");

		String exact = "a".repeat(ShortDescription.MAX);
		assertThat(ShortDescription.fromDescription(exact)).isEqualTo(exact);
		// One huge word: cut mid-word rather than return nothing
		assertThat(ShortDescription.fromDescription("x".repeat(500))).isEqualTo("x".repeat(159) + "…");
	}
}
