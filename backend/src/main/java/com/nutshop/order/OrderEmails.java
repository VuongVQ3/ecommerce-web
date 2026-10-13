package com.nutshop.order;

import com.nutshop.mail.EmailMessage;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.util.HtmlUtils;

import java.text.NumberFormat;
import java.util.Locale;
import java.util.stream.Collectors;

/** Order confirmation email (HTML + plain text). Every customer-provided value is HTML-escaped. */
@Component
class OrderEmails {

	private static final NumberFormat VND = NumberFormat.getIntegerInstance(Locale.forLanguageTag("vi-VN"));

	private final String frontendUrl;

	OrderEmails(@Value("${app.frontend-url}") String frontendUrl) {
		this.frontendUrl = frontendUrl.replaceAll("/+$", "");
	}

	EmailMessage confirmation(Order order) {
		String lookup = frontendUrl + "/tra-cuu-don-hang";
		String rowsHtml = order.getItems()
			.stream()
			.map(i -> "<tr><td style=\"padding:6px 0\">%s × %d</td><td style=\"padding:6px 0;text-align:right\">%s</td></tr>"
				.formatted(esc(i.getProductName()), i.getQuantity(), money(i.getLineTotal())))
			.collect(Collectors.joining());
		String rowsText = order.getItems()
			.stream()
			.map(i -> "- %s × %d: %s".formatted(i.getProductName(), i.getQuantity(), money(i.getLineTotal())))
			.collect(Collectors.joining("\n"));
		String address = "%s, %s, %s".formatted(order.getAddressLine(), order.getWard(), order.getProvince());

		String html = """
				<div style="font-family:Arial,sans-serif;font-size:15px;color:#292524;line-height:1.6;max-width:560px">
				  <p>Xin chào %s,</p>
				  <p>Cảm ơn bạn đã đặt hàng tại Hạt Lành. Mã đơn của bạn là <strong>%s</strong>.</p>
				  <table style="width:100%%;border-collapse:collapse;border-top:1px solid #e7e5e4">%s
				    <tr><td style="padding:6px 0;border-top:1px solid #e7e5e4">Phí giao hàng</td><td style="padding:6px 0;text-align:right;border-top:1px solid #e7e5e4">%s</td></tr>
				    <tr><td style="padding:6px 0"><strong>Tổng thanh toán khi nhận hàng</strong></td><td style="padding:6px 0;text-align:right"><strong>%s</strong></td></tr>
				  </table>
				  <p>Giao tới: %s, %s<br>%s</p>
				  <p>Bạn có thể tra cứu đơn tại <a href="%s">%s</a> bằng mã đơn và số điện thoại.</p>
				</div>""".formatted(esc(order.getCustomerName()), esc(order.getCode()), rowsHtml,
				money(order.getShippingFee()), money(order.getTotal()), esc(order.getCustomerName()),
				esc(order.getPhone()), esc(address), esc(lookup), esc(lookup));
		String text = """
				Xin chào %s,

				Cảm ơn bạn đã đặt hàng tại Hạt Lành. Mã đơn: %s

				%s
				Phí giao hàng: %s
				Tổng thanh toán khi nhận hàng: %s

				Giao tới: %s, %s
				%s

				Tra cứu đơn: %s""".formatted(order.getCustomerName(), order.getCode(), rowsText,
				money(order.getShippingFee()), money(order.getTotal()), order.getCustomerName(), order.getPhone(),
				address, lookup);
		return new EmailMessage(order.getEmail(), "Xác nhận đơn hàng " + order.getCode() + " - Hạt Lành", html, text);
	}

	/** The order left the warehouse: carrier and tracking number so the customer can follow it. */
	EmailMessage shipped(Order order) {
		String html = """
				<div style="font-family:Arial,sans-serif;font-size:15px;color:#292524;line-height:1.6;max-width:560px">
				  <p>Xin chào %s,</p>
				  <p>Đơn hàng <strong>%s</strong> đã được giao cho đơn vị vận chuyển.</p>
				  <p>Đơn vị vận chuyển: <strong>%s</strong><br>Mã vận đơn: <strong>%s</strong></p>
				  <p>Vui lòng chuẩn bị <strong>%s</strong> để thanh toán khi nhận hàng.</p>
				</div>""".formatted(esc(order.getCustomerName()), esc(order.getCode()), esc(order.getCarrier()),
				esc(order.getTrackingNumber()), money(order.getTotal()));
		String text = """
				Xin chào %s,

				Đơn hàng %s đã được giao cho đơn vị vận chuyển.
				Đơn vị vận chuyển: %s
				Mã vận đơn: %s

				Vui lòng chuẩn bị %s để thanh toán khi nhận hàng.""".formatted(order.getCustomerName(),
				order.getCode(), order.getCarrier(), order.getTrackingNumber(), money(order.getTotal()));
		return new EmailMessage(order.getEmail(), "Đơn hàng " + order.getCode() + " đang được giao - Hạt Lành", html,
				text);
	}

	EmailMessage cancelled(Order order, String reason) {
		String html = """
				<div style="font-family:Arial,sans-serif;font-size:15px;color:#292524;line-height:1.6;max-width:560px">
				  <p>Xin chào %s,</p>
				  <p>Đơn hàng <strong>%s</strong> đã được huỷ.</p>
				  <p>Lý do: %s</p>
				  <p>Nếu bạn cần hỗ trợ, vui lòng liên hệ hotline 0900 000 000.</p>
				</div>""".formatted(esc(order.getCustomerName()), esc(order.getCode()), esc(reason));
		String text = """
				Xin chào %s,

				Đơn hàng %s đã được huỷ.
				Lý do: %s

				Nếu bạn cần hỗ trợ, vui lòng liên hệ hotline 0900 000 000.""".formatted(order.getCustomerName(),
				order.getCode(), reason);
		return new EmailMessage(order.getEmail(), "Đơn hàng " + order.getCode() + " đã được huỷ - Hạt Lành", html,
				text);
	}

	private static String money(long amount) {
		return VND.format(amount) + "₫";
	}

	private static String esc(String value) {
		return HtmlUtils.htmlEscape(value);
	}
}
