import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { BRAND, usePageMeta } from '../lib/usePageMeta'
import { telHref, useSiteInfo } from '../lib/siteInfo'

/**
 * Policy pages. DRAFTS: every <Fill> marks information only the shop owner can provide (shown highlighted as
 * "[CẦN ĐIỀN: …]"). Facts stated without a marker describe how the website actually works today.
 * Have the final text reviewed by someone qualified before taking real customers.
 */
function Fill({ children }: { children: ReactNode }) {
  return <mark className="rounded bg-amber-100 px-1 text-amber-950">[CẦN ĐIỀN: {children}]</mark>
}

function PolicyPage({
  title,
  intro,
  children,
  contactLink = true,
}: {
  title: string
  intro: string
  children: ReactNode
  contactLink?: boolean
}) {
  usePageMeta(`${title} | ${BRAND}`, intro)
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold text-stone-900">{title}</h1>
      <p className="mt-2 text-sm text-muted">Bản nháp – cập nhật lần cuối: <Fill>ngày áp dụng</Fill></p>
      <p className="mt-6 leading-relaxed text-stone-700">{intro}</p>
      <div className="mt-6 space-y-6 leading-relaxed text-stone-700 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-stone-900 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
      {contactLink && (
      <p className="mt-10 text-sm text-stone-600">
        Câu hỏi về chính sách? Xem trang{' '}
        <Link to="/lien-he" className="font-semibold text-brand-700 underline">
          Liên hệ
        </Link>
        .
      </p>
      )}
    </article>
  )
}

export function ReturnPolicyPage() {
  return (
    <PolicyPage
      title="Chính sách đổi trả"
      intro={`Điều kiện, thời hạn và cách đổi trả sản phẩm khi mua hàng tại ${BRAND}.`}
    >
      <section>
        <h2>1. Trường hợp được đổi trả</h2>
        <ul>
          <li>Sản phẩm giao sai loại, sai khối lượng hoặc thiếu so với đơn hàng.</li>
          <li>Bao bì bị rách, thủng, ẩm mốc hoặc sản phẩm hết hạn sử dụng khi nhận hàng.</li>
          <li>
            Trường hợp khác: <Fill>có nhận đổi trả khi khách đổi ý không, điều kiện kèm theo</Fill>
          </li>
        </ul>
      </section>
      <section>
        <h2>2. Thời hạn</h2>
        <p>
          Khách hàng thông báo trong vòng <Fill>số ngày</Fill> kể từ khi nhận hàng. Đơn thanh toán khi nhận hàng (COD) nên
          kiểm tra tình trạng bao bì trước khi thanh toán cho nhân viên giao hàng.
        </p>
      </section>
      <section>
        <h2>3. Cách yêu cầu đổi trả</h2>
        <ul>
          <li>Chuẩn bị mã đơn hàng (dạng HL…, có trong email xác nhận hoặc trang Tra cứu đơn hàng).</li>
          <li>Chụp ảnh sản phẩm, bao bì và tem/nhãn.</li>
          <li>
            Gửi yêu cầu qua <Fill>kênh tiếp nhận: hotline, email, Zalo…</Fill>
          </li>
        </ul>
      </section>
      <section>
        <h2>4. Hoàn tiền và chi phí</h2>
        <p>
          Hình thức hoàn tiền: <Fill>chuyển khoản / đổi sản phẩm mới</Fill>, trong vòng <Fill>số ngày</Fill> sau khi
          nhận lại hàng. Phí vận chuyển đổi trả: <Fill>ai chịu phí trong từng trường hợp</Fill>.
        </p>
      </section>
    </PolicyPage>
  )
}

export function ShippingPolicyPage() {
  return (
    <PolicyPage title="Chính sách vận chuyển" intro={`Phí giao hàng, thời gian giao và khu vực giao hàng của ${BRAND}.`}>
      <section>
        <h2>1. Khu vực giao hàng</h2>
        <p>Giao hàng đến địa chỉ tại 34 tỉnh, thành phố trên toàn quốc (theo đơn vị hành chính mới).</p>
      </section>
      <section>
        <h2>2. Phí giao hàng</h2>
        <p>
          Phí giao hàng được tính và hiển thị rõ trong giỏ hàng và trang thanh toán trước khi bạn đặt hàng. Hiện tại: đồng
          giá 30.000₫ mỗi đơn, miễn phí cho đơn từ 500.000₫. <Fill>xác nhận mức phí hoặc cập nhật nếu thay đổi</Fill>
        </p>
      </section>
      <section>
        <h2>3. Thời gian giao hàng</h2>
        <ul>
          <li>
            Thời gian xử lý đơn: <Fill>ví dụ trong 1 ngày làm việc</Fill>
          </li>
          <li>
            Nội thành: <Fill>số ngày</Fill>; tỉnh khác: <Fill>số ngày</Fill>
          </li>
          <li>
            Đơn vị vận chuyển: <Fill>tên các đơn vị hợp tác</Fill>
          </li>
        </ul>
        <p className="mt-2">
          Khi đơn được giao cho đơn vị vận chuyển, bạn nhận email kèm mã vận đơn (nếu đã để lại email) và có thể theo
          dõi trạng thái tại trang{' '}
          <Link to="/tra-cuu-don-hang" className="font-semibold text-brand-700 underline">
            Tra cứu đơn hàng
          </Link>
          .
        </p>
      </section>
      <section>
        <h2>4. Thanh toán</h2>
        <p>Hiện chỉ hỗ trợ thanh toán tiền mặt khi nhận hàng (COD). Bạn có thể huỷ đơn khi đơn còn ở trạng thái chờ xác nhận.</p>
      </section>
    </PolicyPage>
  )
}

export function PrivacyPage() {
  return (
    <PolicyPage
      title="Chính sách bảo mật"
      intro={`Cách ${BRAND} thu thập, sử dụng và bảo vệ thông tin cá nhân của khách hàng.`}
    >
      <section>
        <h2>1. Đơn vị chịu trách nhiệm</h2>
        <p>
          <Fill>tên chủ sở hữu / doanh nghiệp, địa chỉ, email liên hệ về dữ liệu cá nhân</Fill>
        </p>
      </section>
      <section>
        <h2>2. Thông tin chúng tôi thu thập</h2>
        <ul>
          <li>Khi đăng ký: họ tên, email, số điện thoại (không bắt buộc), mật khẩu (chỉ lưu dạng mã hoá một chiều).</li>
          <li>Khi đăng nhập bằng Google: họ tên, email và mã định danh tài khoản Google.</li>
          <li>Khi đặt hàng: họ tên người nhận, số điện thoại, email (không bắt buộc), địa chỉ giao hàng, ghi chú.</li>
          <li>Nhật ký kỹ thuật: địa chỉ IP và trình duyệt khi đăng nhập, dùng để bảo vệ tài khoản.</li>
        </ul>
      </section>
      <section>
        <h2>3. Mục đích sử dụng</h2>
        <ul>
          <li>Xử lý, giao hàng và hỗ trợ đơn hàng; gửi email xác nhận, giao hàng, huỷ đơn.</li>
          <li>Quản lý tài khoản, đặt lại mật khẩu, chống gian lận và spam.</li>
          <li>Gửi email khuyến mãi chỉ khi bạn đã đồng ý; bạn có thể huỷ đăng ký bất cứ lúc nào.</li>
        </ul>
      </section>
      <section>
        <h2>4. Cookie và lưu trữ trên trình duyệt</h2>
        <p>
          Phiên đăng nhập dùng cookie bảo mật (httpOnly), trang web không đọc được bằng JavaScript. Giỏ hàng của khách
          chưa đăng nhập được lưu trong trình duyệt của bạn. Chúng tôi không dùng cookie quảng cáo. <Fill>bổ sung nếu sau
          này dùng công cụ phân tích như Google Analytics</Fill>
        </p>
      </section>
      <section>
        <h2>5. Bên thứ ba xử lý dữ liệu</h2>
        <ul>
          <li>Lưu trữ máy chủ và cơ sở dữ liệu: Render, Neon (máy chủ tại Singapore).</li>
          <li>Gửi email: Resend. Chống bot ở form đăng ký: Cloudflare Turnstile. Đăng nhập Google: Google.</li>
          <li>
            Đơn vị vận chuyển nhận tên, số điện thoại, địa chỉ để giao hàng: <Fill>tên đơn vị</Fill>
          </li>
        </ul>
      </section>
      <section>
        <h2>6. Thời gian lưu trữ và quyền của bạn</h2>
        <p>
          Thời gian lưu dữ liệu tài khoản và đơn hàng: <Fill>thời hạn, theo quy định kế toán/thuế</Fill>. Bạn có quyền
          xem, sửa, yêu cầu xoá dữ liệu hoặc rút lại sự đồng ý bằng cách liên hệ <Fill>kênh tiếp nhận yêu cầu</Fill>.
        </p>
      </section>
    </PolicyPage>
  )
}

export function TermsPage() {
  return (
    <PolicyPage title="Điều khoản sử dụng" intro={`Điều khoản khi sử dụng website và mua hàng tại ${BRAND}.`}>
      <section>
        <h2>1. Thông tin người bán</h2>
        <p>
          <Fill>tên chủ sở hữu / doanh nghiệp, mã số đăng ký kinh doanh, địa chỉ</Fill>
        </p>
      </section>
      <section>
        <h2>2. Tài khoản</h2>
        <p>
          Bạn chịu trách nhiệm giữ bí mật mật khẩu. Chúng tôi có thể tạm khoá tài khoản có dấu hiệu gian lận hoặc lạm
          dụng. Bạn vẫn có thể đặt hàng mà không cần tài khoản.
        </p>
      </section>
      <section>
        <h2>3. Đặt hàng, giá và thanh toán</h2>
        <ul>
          <li>Giá hiển thị bằng VND, đã gồm <Fill>VAT hay chưa</Fill>. Giá tại thời điểm đặt hàng được giữ cho đơn đó.</li>
          <li>Đơn hàng được xác nhận khi cửa hàng xác nhận (trạng thái "Đã xác nhận"); có thể huỷ nếu hết hàng.</li>
          <li>Thanh toán tiền mặt khi nhận hàng (COD).</li>
        </ul>
      </section>
      <section>
        <h2>4. Thông tin sản phẩm</h2>
        <p>
          Giá trị dinh dưỡng mang tính tham khảo, tính trên 100g sản phẩm. Sản phẩm không phải là thuốc và không có tác
          dụng thay thế thuốc chữa bệnh. <Fill>nguồn số liệu dinh dưỡng, cảnh báo dị ứng</Fill>
        </p>
      </section>
      <section>
        <h2>5. Giải quyết khiếu nại</h2>
        <p>
          Khiếu nại được tiếp nhận qua <Fill>kênh tiếp nhận</Fill> và phản hồi trong <Fill>số ngày làm việc</Fill>. Xem
          thêm{' '}
          <Link to="/chinh-sach-doi-tra" className="font-semibold text-brand-700 underline">
            Chính sách đổi trả
          </Link>
          .
        </p>
      </section>
    </PolicyPage>
  )
}

/** Contact details come from the server config (BUSINESS_*); unconfigured fields are hidden, never invented. */
export function ContactPage() {
  const site = useSiteInfo()
  const b = site?.business ?? {}
  const any = Boolean(b.hotline || b.email || b.address)
  return (
    <PolicyPage title="Liên hệ" contactLink={false} intro={`Thông tin liên hệ và hỗ trợ khách hàng của ${BRAND}.`}>
      <section>
        <h2>Kênh liên hệ</h2>
        {site && !any ? (
          <p>Thông tin liên hệ đang được cập nhật.</p>
        ) : (
          <dl className="mt-2 space-y-2">
            {b.hotline && (
              <div>
                <dt className="inline font-semibold">Hotline: </dt>
                <dd className="inline">
                  <a href={telHref(b.hotline)} className="font-semibold text-brand-700 underline">
                    {b.hotline}
                  </a>
                </dd>
              </div>
            )}
            {b.email && (
              <div>
                <dt className="inline font-semibold">Email: </dt>
                <dd className="inline select-text">{b.email}</dd>
              </div>
            )}
            {b.address && (
              <div>
                <dt className="inline font-semibold">Địa chỉ: </dt>
                <dd className="inline">{b.address}</dd>
              </div>
            )}
          </dl>
        )}
        <p className="mt-3">
          Giờ hỗ trợ: <Fill>giờ làm việc</Fill>
        </p>
      </section>
      <section>
        <h2>Về đơn hàng</h2>
        <p>
          Kiểm tra tình trạng đơn bằng mã đơn và số điện thoại tại{' '}
          <Link to="/tra-cuu-don-hang" className="font-semibold text-brand-700 underline">
            Tra cứu đơn hàng
          </Link>
          . Khi liên hệ, vui lòng cho biết mã đơn (dạng HL…).
        </p>
      </section>
      {(b.ownerName || b.registrationNumber) && (
        <section>
          <h2>Thông tin người bán</h2>
          {b.ownerName && <p>Chủ sở hữu: {b.ownerName}</p>}
          {b.registrationNumber && <p>Mã số đăng ký kinh doanh: {b.registrationNumber}</p>}
        </section>
      )}
    </PolicyPage>
  )
}
