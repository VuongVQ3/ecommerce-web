package com.nutshop.site;

import com.nutshop.site.SiteProperties.Business;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SitePropertiesTest {

	private static Business business(String hotline, String zalo, String messenger) {
		return new Business(null, null, null, hotline, null, null, zalo, messenger);
	}

	@Test
	void contactLinksFromValidSettings() {
		var contact = business("0912 345 678", "+84 912-345-678", "hatlanh.vn").contact();
		assertThat(contact.zaloUrl()).isEqualTo("https://zalo.me/0912345678");
		assertThat(contact.messengerUrl()).isEqualTo("https://m.me/hatlanh.vn");
		assertThat(contact.hotline()).isEqualTo("0912 345 678");
	}

	@Test
	void socialLinksMustBeHttpsOnTheirOwnDomain() {
		var social = new SiteProperties.Social("https://www.facebook.com/hatlanh", " https://shopee.vn/hatlanh ",
				"https://www.tiktok.com/@hatlanh");
		assertThat(social.facebookUrl()).isEqualTo("https://www.facebook.com/hatlanh");
		assertThat(social.shopeeUrl()).isEqualTo("https://shopee.vn/hatlanh");
		assertThat(social.tiktokUrl()).isEqualTo("https://www.tiktok.com/@hatlanh");

		var bad = new SiteProperties.Social("http://facebook.com/x", "https://evil-shopee.vn/x", "javascript:alert(1)");
		assertThat(bad.facebookUrl()).isNull();
		assertThat(bad.shopeeUrl()).isNull();
		assertThat(bad.tiktokUrl()).isNull();

		var site = new SiteProperties(null, business(null, "0912345678", null), social);
		assertThat(site.socialLinks().zaloUrl()).isEqualTo("https://zalo.me/0912345678");
		assertThat(site.socialLinks().facebookUrl()).isEqualTo("https://www.facebook.com/hatlanh");
	}

	@Test
	void invalidOrMissingSettingsAreDroppedNotFatal() {
		var contact = business(" ", "12345", "hat lanh/../x").contact();
		assertThat(contact.zaloUrl()).isNull();
		assertThat(contact.messengerUrl()).isNull();
		assertThat(contact.hotline()).isNull();
		assertThat(business(null, null, null).contact()).isEqualTo(new SiteProperties.Contact(null, null, null));
	}
}
