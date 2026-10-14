package com.nutshop.order;

import com.nutshop.mail.EmailMessage;
import com.nutshop.site.SiteProperties;
import org.springframework.stereotype.Component;
import org.springframework.web.util.HtmlUtils;

import java.text.NumberFormat;
import java.util.Locale;
import java.util.stream.Collectors;

/**
 * Order emails (HTML + plain text). Every customer-provided value is HTML-escaped. Each email carries a link to the
 * order: a tracking link for guests, "my orders" for account holders (see OrderAccessTokens#linkFor).
 */
@Component
class OrderEmails {

	private static final NumberFormat VND = NumberFormat.getIntegerInstance(Locale.forLanguageTag("vi-VN"));
	private static final String WRAP = "<div style=\"font-family:Arial,sans-serif;font-size:15px;color:#292524;"
			+ "line-height:1.6;max-width:560px\">%s</div>";

	private final SiteProperties site;

	OrderEmails(SiteProperties site) {
		this.site = site;
	}

	EmailMessage confirmation(Order order, String link) {
		String rowsHtml = order.getItems()
			.stream()
			.map(i -> "<tr><td style=\"padding:6px 0\">%s × %d</td><td style=\"padding:6px 0;text-align:right\">%s</td></tr>"
				.formatted(esc(i.getProductName()), i.getQuantity(), money(i.getLineTotal())))
			.collect(Collectors.joining());
		String rowsText = order.getItems()
			.stream()
			.map(i -> "- %s × %d: %s".formatted(i.getProductName(), i.getQuantity(), money(i.getLineTotal())))
			.collect(Collectors.joining("\n"));
		String address = address(order);

		String html = WRAP.formatted("""
				<p>Xin chào %s,</p>
				<p>Cảm ơn bạn đã đặt hàng tại Hạt Lành. Mã đơn của bạn là <strong>%s</strong>.</p>
				<table style="width:100%%;border-collapse:collapse;border-top:1px solid #e7e5e4">%s
				  <tr><td style="padding:6px 0;border-top:1px solid #e7e5e4">Phí giao hàng</td><td style="padding:6px 0;text-align:right;border-top:1px solid #e7e5e4">%s</td></tr>
				  <tr><td style="padding:6px 0"><strong>Tổng thanh toán khi nhận hàng</strong></td><td style="padding:6px 0;text-align:right"><strong>%s</strong></td></tr>
				</table>
				<p>Giao tới: %s, %s<br>%s</p>
				%s""".formatted(esc(order.getCustomerName()), esc(order.getCode()), rowsHtml,
				money(order.getShippingFee()), money(order.getTotal()), esc(order.getCustomerName()),
				esc(order.getPhone()), esc(address), button(order, link)));
		String text = """
				Xin chào %s,

				Cảm ơn bạn đã đặt hàng tại Hạt Lành. Mã đơn: %s

				%s
				Phí giao hàng: %s
				Tổng thanh toán khi nhận hàng: %s

				Giao tới: %s, %s
				%s

				%s""".formatted(order.getCustomerName(), order.getCode(), rowsText, money(order.getShippingFee()),
				money(order.getTotal()), order.getCustomerName(), order.getPhone(), address, linkText(order, link));
		return new EmailMessage(order.getEmail(), "Xác nhận đơn hàng " + order.getCode() + " - Hạt Lành", html, text);
	}

	/** The order left the warehouse: carrier and tracking number so the customer can follow it. */
	EmailMessage shipped(Order order, String link) {
		String html = WRAP.formatted("""
				<p>Xin chào %s,</p>
				<p>Đơn hàng <strong>%s</strong> đã được giao cho đơn vị vận chuyển.</p>
				<p>Đơn vị vận chuyển: <strong>%s</strong><br>Mã vận đơn: <strong>%s</strong></p>
				<p>Vui lòng chuẩn bị <strong>%s</strong> để thanh toán khi nhận hàng.</p>
				%s""".formatted(esc(order.getCustomerName()), esc(order.getCode()), esc(order.getCarrier()),
				esc(order.getTrackingNumber()), money(order.getTotal()), button(order, link)));
		String text = """
				Xin chào %s,

				Đơn hàng %s đã được giao cho đơn vị vận chuyển.
				Đơn vị vận chuyển: %s
				Mã vận đơn: %s

				Vui lòng chuẩn bị %s để thanh toán khi nhận hàng.

				%s""".formatted(order.getCustomerName(), order.getCode(), order.getCarrier(), order.getTrackingNumber(),
				money(order.getTotal()), linkText(order, link));
		return new EmailMessage(order.getEmail(), "Đơn hàng " + order.getCode() + " đang được giao - Hạt Lành", html,
				text);
	}

	EmailMessage completed(Order order, String link) {
		String html = WRAP.formatted("""
				<p>Xin chào %s,</p>
				<p>Đơn hàng <strong>%s</strong> đã được giao thành công. Cảm ơn bạn đã mua hàng tại Hạt Lành!</p>
				%s""".formatted(esc(order.getCustomerName()), esc(order.getCode()), button(order, link)));
		String text = """
				Xin chào %s,

				Đơn hàng %s đã được giao thành công. Cảm ơn bạn đã mua hàng tại Hạt Lành!

				%s""".formatted(order.getCustomerName(), order.getCode(), linkText(order, link));
		return new EmailMessage(order.getEmail(), "Đơn hàng " + order.getCode() + " đã giao thành công - Hạt Lành",
				html, text);
	}

	EmailMessage cancelled(Order order, String reason, String link) {
		String html = WRAP.formatted("""
				<p>Xin chào %s,</p>
				<p>Đơn hàng <strong>%s</strong> đã được huỷ.</p>
				<p>Lý do: %s</p>
				<p>%s</p>
				%s""".formatted(esc(order.getCustomerName()), esc(order.getCode()), esc(reason), esc(contactLine()),
				button(order, link)));
		String text = """
				Xin chào %s,

				Đơn hàng %s đã được huỷ.
				Lý do: %s

				%s

				%s""".formatted(order.getCustomerName(), order.getCode(), reason, contactLine(), linkText(order, link));
		return new EmailMessage(order.getEmail(), "Đơn hàng " + order.getCode() + " đã được huỷ - Hạt Lành", html,
				text);
	}

	private static String button(Order order, String link) {
		String label = order.getUserId() == null ? "Theo dõi đơn hàng" : "Xem đơn hàng";
		String note = order.getUserId() == null
				? "<p style=\"font-size:13px;color:#6b625a\">Link này dành riêng cho đơn của bạn, vui lòng không chia sẻ.</p>"
				: "";
		return """
				<p><a href="%s" style="display:inline-block;background:#3d7130;color:#ffffff;text-decoration:none;\
				padding:10px 20px;border-radius:999px;font-weight:bold">%s</a></p>%s""".formatted(esc(link), label, note);
	}

	private static String linkText(Order order, String link) {
		return (order.getUserId() == null ? "Theo dõi đơn hàng (link riêng, vui lòng không chia sẻ): " : "Xem đơn hàng: ")
				+ link;
	}

	/** Real contact details only (never sample values): the configured hotline, otherwise the contact page. */
	private String contactLine() {
		String hotline = site.business().filled().get("hotline");
		return hotline != null ? "Nếu bạn cần hỗ trợ, vui lòng gọi " + hotline + "."
				: "Nếu bạn cần hỗ trợ, vui lòng xem trang " + site.absolute("/lien-he") + ".";
	}

	private static String address(Order order) {
		return "%s, %s, %s".formatted(order.getAddressLine(), order.getWard(), order.getProvince());
	}

	private static String money(long amount) {
		return VND.format(amount) + "₫";
	}

	private static String esc(String value) {
		return HtmlUtils.htmlEscape(value == null ? "" : value);
	}
}
