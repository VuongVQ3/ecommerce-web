package com.nutshop.notify;

import com.nutshop.order.CancelReason;
import com.nutshop.order.Order;
import com.nutshop.site.SiteProperties;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;

/** The text of the shop's Telegram alerts: products and quantities, never the customer. */
class OrderTelegramAlertsTest {

	private final OrderTelegramAlerts alerts = new OrderTelegramAlerts(null, null,
			new SiteProperties("https://hat-lanh.com", null, null));

	private static Order order() {
		return new Order("HL123", "key", null, new Order.Delivery("Nguyễn Khách", "0912345678", "khach@example.com",
				"Hà Nội", "Phường Ba Đình", "12 Phố Test"), "Gọi trước khi giao");
	}

	private static Order twoLines() {
		Order order = order();
		order.addItem(1L, "Mắc ca size 22-25", 199_000, 199_000, 500, 2);
		order.addItem(2L, "Hạt điều vỏ lụa sấy", 200_000, 200_000, 500, 1);
		order.setTotals(598_000, 0);
		return order;
	}

	private static void assertNoPersonalData(String message) {
		assertThat(message).doesNotContain("Nguyễn", "0912345678", "khach@example.com", "Phố Test", "Ba Đình",
				"Gọi trước");
	}

	@Test
	void newOrderListsProductsPacksTotalAndLink() {
		String message = alerts.placedMessage(twoLines());

		assertThat(message).isEqualTo("""
				🛒 <b>Đơn mới #HL123</b>
				• Mắc ca size 22-25 × 2
				• Hạt điều vỏ lụa sấy × 1
				📦 3 gói
				💰 <b>598.000₫</b>
				🔗 https://hat-lanh.com/admin/don-hang/HL123""");
		assertNoPersonalData(message);
	}

	@Test
	void customerCancelShowsTheFixedReasonAndProductsButNotTheNote() {
		Order order = order();
		order.addItem(1L, "Mắc ca size 22-25", 199_000, 199_000, 500, 2);
		order.setTotals(398_000, 0);
		ReflectionTestUtils.setField(order, "cancelReason", CancelReason.OTHER);
		ReflectionTestUtils.setField(order, "cancelReasonNote", "Nhà tôi ở 12 Phố Test, gọi 0912345678");

		String message = alerts.cancelledMessage(order);

		assertThat(message).isEqualTo("""
				❌ <b>Khách huỷ đơn #HL123</b> – lý do: Lý do khác
				• Mắc ca size 22-25 × 2
				📦 2 gói
				💰 398.000₫
				🔗 https://hat-lanh.com/admin/don-hang/HL123""");
		assertNoPersonalData(message);
	}

	@Test
	void listsTenLinesAndCountsTheRest() {
		Order order = order();
		for (int i = 1; i <= 12; i++) {
			order.addItem((long) i, "Sản phẩm " + i, 10_000, 10_000, 100, 1);
		}
		order.setTotals(120_000, 0);

		String message = alerts.placedMessage(order);

		assertThat(message).contains("• Sản phẩm 1 × 1\n", "• Sản phẩm 10 × 1\n• … và 2 sản phẩm khác\n📦 12 gói\n");
		assertThat(message).doesNotContain("Sản phẩm 11", "Sản phẩm 12");
		assertThat(message.lines().filter(l -> l.startsWith("• "))).hasSize(11);
	}

	@Test
	void escapesProductNames() {
		Order order = order();
		order.addItem(1L, "Mix <b>& hạt</b>", 50_000, 50_000, 200, 3);
		order.setTotals(150_000, 0);

		assertThat(alerts.placedMessage(order)).contains("• Mix &lt;b&gt;&amp; hạt&lt;/b&gt; × 3\n")
			.doesNotContain("<b>&", "</b> × 3");
	}

	@Test
	void cutsLongProductNames() {
		Order order = order();
		order.addItem(1L, "A".repeat(75) + "&".repeat(45), 50_000, 50_000, 200, 1);
		order.setTotals(50_000, 0);

		// 80 characters kept, cut before escaping so no entity is split
		assertThat(alerts.placedMessage(order)).contains("• " + "A".repeat(75) + "&amp;".repeat(5) + "… × 1\n");
	}
}
