package com.nutshop.dam;

import com.nutshop.common.ApiException;
import com.nutshop.media.AssetTypes.Kind;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Renditions, tags, stable links and folder names: rules that need no database. */
class DamUnitTest {

	private static final String IMAGE = "https://res.cloudinary.com/demo/image/upload/v17/hat-lanh/dam/abc.png";
	private static final String PDF = "https://res.cloudinary.com/demo/image/upload/v17/hat-lanh/dam/gia.pdf";

	@Test
	void imageRenditionsInsertTheirPresetAfterUpload() {
		assertThat(AssetRenditions.of(IMAGE, Kind.IMAGE)).containsExactly(
				java.util.Map.entry("thumb", "https://res.cloudinary.com/demo/image/upload/w_240,h_240,c_fill,f_auto,q_auto/v17/hat-lanh/dam/abc.png"),
				java.util.Map.entry("card", "https://res.cloudinary.com/demo/image/upload/w_600,c_limit,f_auto,q_auto/v17/hat-lanh/dam/abc.png"),
				java.util.Map.entry("hero", "https://res.cloudinary.com/demo/image/upload/w_1600,c_limit,f_auto,q_auto/v17/hat-lanh/dam/abc.png"),
				java.util.Map.entry("og", "https://res.cloudinary.com/demo/image/upload/w_1200,h_630,c_fill,f_jpg,q_auto/v17/hat-lanh/dam/abc.png"));
	}

	@Test
	void pdfRenditionsArePictureOfPageOneAsJpg() {
		var renditions = AssetRenditions.of(PDF, Kind.PDF);
		assertThat(renditions).containsOnlyKeys("thumb", "card");
		assertThat(renditions.get("thumb"))
			.isEqualTo("https://res.cloudinary.com/demo/image/upload/pg_1,w_240,h_240,c_fill,f_auto,q_auto/v17/hat-lanh/dam/gia.jpg");
		assertThat(renditions.get("card"))
			.isEqualTo("https://res.cloudinary.com/demo/image/upload/pg_1,w_600,c_limit,f_auto,q_auto/v17/hat-lanh/dam/gia.jpg");
	}

	@Test
	void aUrlThatIsNotCloudinaryIsLeftAlone() {
		assertThat(AssetRenditions.url("https://example.org/a.png", Kind.IMAGE, "thumb")).isEqualTo("https://example.org/a.png");
		assertThatThrownBy(() -> AssetRenditions.url(IMAGE, Kind.IMAGE, "huge")).isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void tagsAreTrimmedLowercasedAndUnique() {
		assertThat(DamAssetService.normalizeTags(Arrays.asList("  Tết ", "tết", "Banner  Chính", "", null)))
			.containsExactly("tết", "banner chính");
		assertThat(DamAssetService.normalizeTags(null)).isEmpty();
		List<String> twenty = IntStream.range(0, 20).mapToObj(i -> "tag" + i).toList();
		assertThat(DamAssetService.normalizeTags(twenty)).hasSize(20);
		List<String> tooMany = IntStream.range(0, 21).mapToObj(i -> "tag" + i).toList();
		assertThatThrownBy(() -> DamAssetService.normalizeTags(tooMany)).isInstanceOf(ApiException.class)
			.extracting("code").isEqualTo("TOO_MANY_TAGS");
		assertThatThrownBy(() -> DamAssetService.normalizeTags(List.of("x".repeat(41)))).isInstanceOf(ApiException.class)
			.extracting("code").isEqualTo("TAG_TOO_LONG");
	}

	@Test
	void stableLinksCarryAReadableSlugOfTheFileName() {
		UUID id = UUID.fromString("00000000-0000-0000-0000-000000000001");
		assertThat(DamAssetService.stableUrl(id, "Bảng giá sỉ 2026.pdf")).isEqualTo("/files/" + id + "/bang-gia-si-2026.pdf");
		assertThat(DamAssetService.stableUrl(id, "Ảnh.JPG")).isEqualTo("/files/" + id + "/anh.jpg");
		assertThat(DamAssetService.stableUrl(id, "!!!.png")).isEqualTo("/files/" + id + "/file.png");
	}

	@Test
	void folderNamesAreSlugs() {
		assertThat(DamFolderService.slugName("Khuyến mãi Tết")).isEqualTo("khuyen-mai-tet");
		assertThatThrownBy(() -> DamFolderService.slugName("***")).isInstanceOf(ApiException.class)
			.extracting("code").isEqualTo("INVALID_FOLDER_NAME");
		assertThatThrownBy(() -> DamFolderService.slugName("a".repeat(81))).isInstanceOf(ApiException.class);
	}
}
