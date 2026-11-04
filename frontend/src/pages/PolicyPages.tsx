import { useEffect, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { SHOP } from '../lib/shopContact'
import { UPDATED } from '../lib/policyDates'
import { formatPolicyVersion } from '../lib/siteInfo'
import { BRAND, usePageMeta } from '../lib/usePageMeta'

/**
 * Policy pages, word for word from docs/chinh-sach-noi-dung.md (first agreed with the shop owner on 02/11/2026; its
 * "Lịch sử sửa đổi" lists later changes). Change the wording there first, then here, then move that page's date in
 * UPDATED (lib/policyDates.ts). Bump PolicyVersion.CURRENT (backend) as well only when customers must agree again
 * (the privacy policy, part B of the terms): it is the version consents are recorded against, and an account that
 * agreed to an older one is asked again at checkout.
 */

const linkClass = 'font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800'

function PolicyPage({
  title,
  description,
  updatedAt,
  children,
  contactLink = true,
}: {
  title: string
  description: string
  /** ISO date, from UPDATED */
  updatedAt: string
  children: ReactNode
  contactLink?: boolean
}) {
  usePageMeta(`${title} | ${BRAND}`, description)
  const updated = formatPolicyVersion(updatedAt)
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold text-stone-900">{title}</h1>
      <p className="mt-2 min-h-5 text-sm text-muted">{updated && `Cập nhật lần cuối: ${updated}`}</p>
      <div className="mt-8 space-y-8 leading-relaxed text-stone-700 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-stone-900 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-stone-900 [&_li]:pl-1 [&_p]:mt-2 [&_strong]:font-semibold [&_strong]:text-stone-900 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {children}
      </div>
      {contactLink && (
        <p className="mt-12 border-t border-stone-200 pt-6 text-sm text-stone-600">
          Câu hỏi về chính sách? Xem trang{' '}
          <Link to="/lien-he" className={linkClass}>
            Liên hệ
          </Link>
          .
        </p>
      )}
    </article>
  )
}

function Phone() {
  return (
    <a href={SHOP.phoneHref} className={`${linkClass} whitespace-nowrap`}>
      {SHOP.phone}
    </a>
  )
}

function Email() {
  return (
    <a href={`mailto:${SHOP.email}`} className={`${linkClass} break-all`}>
      {SHOP.email}
    </a>
  )
}

/** The fanpage in a new tab; children replace the address as the link text */
function Fanpage({ children }: { children?: ReactNode }) {
  return (
    // Only the bare address may break anywhere (it has no spaces); a worded link wraps between words
    <a href={SHOP.fanpage} target="_blank" rel="noopener noreferrer" className={`${linkClass} ${children ? '' : 'break-all'}`}>
      {children ?? SHOP.fanpage}
      <span className="sr-only"> (mở trong tab mới)</span>
    </a>
  )
}

function To({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={linkClass}>
      {children}
    </Link>
  )
}

// ---- Trang 1 ---------------------------------------------------------------------------------------------------

export function ReturnPolicyPage() {
  return (
    <PolicyPage title="Chính sách đổi trả và Đồng kiểm" updatedAt={UPDATED.returns} description={`Đồng kiểm khi nhận hàng, điều kiện, thời hạn và cách đổi trả sản phẩm tại ${BRAND}.`}>
      <section>
        <h2>1. Chính sách Đồng kiểm</h2>
        <p>Nhằm đảm bảo quyền lợi, Hạt Lành khuyến khích khách hàng đồng kiểm cùng nhân viên giao hàng ngay tại thời điểm nhận.</p>
        <ul>
          <li>
            <strong>Được phép:</strong> Kiểm tra số lượng, loại sản phẩm, tình trạng nguyên vẹn của hộp/túi đóng gói bên ngoài.
          </li>
          <li>
            <strong>Không được phép:</strong> Bóc màng seal (lớp màng nhôm/ni-lông niêm phong miệng hộp), xé rách bao bì hút chân
            không hoặc ăn thử sản phẩm.
          </li>
        </ul>
        <p>
          <strong>Lưu ý quan trọng:</strong> Khách hàng quay lại video quá trình mở thùng hàng để Hạt Lành có cơ sở hỗ trợ nhanh nhất
          khi phát sinh sự cố.
        </p>
      </section>
      <section>
        <h2>2. Điều kiện chấp nhận đổi/trả sản phẩm</h2>
        <p>Vì đặc thù ngành hàng thực phẩm, Hạt Lành CHỈ chấp nhận đổi mới hoặc hoàn tiền trong các trường hợp sau:</p>
        <ul>
          <li>
            Sản phẩm bị hư hỏng do vận chuyển: Hộp bị nứt vỡ, màng seal bị rách, bao bì móp méo nghiêm trọng ảnh hưởng đến chất lượng
            hạt bên trong.
          </li>
          <li>Sản phẩm bị lỗi từ quá trình sản xuất: Hạt bị mốc, hôi dầu, có dị vật, mọt, bọ hoặc có mùi vị bất thường.</li>
          <li>Sản phẩm giao sai mã, sai quy cách (trọng lượng) hoặc thiếu số lượng so với đơn đặt hàng.</li>
          <li>Sản phẩm đã hết hạn sử dụng tại thời điểm khách hàng nhận hàng.</li>
        </ul>
      </section>
      <section>
        <h2>3. Điều kiện TỪ CHỐI đổi trả</h2>
        <ul>
          <li>Khách hàng thay đổi ý định mua hàng (không muốn mua nữa).</li>
          <li>
            Sản phẩm đã bị bóc màng seal, sử dụng một phần nhưng không có bằng chứng chứng minh sản phẩm bị lỗi chất lượng (mốc, hôi
            dầu...).
          </li>
          <li>
            Sản phẩm bị hư hỏng do khách hàng bảo quản sai cách (để hở miệng túi/hộp, để nơi ẩm ướt, nhiệt độ cao, tiếp xúc trực tiếp
            ánh nắng mặt trời) sau khi nhận hàng.
          </li>
        </ul>
      </section>
      <section>
        <h2>4. Thời gian tiếp nhận khiếu nại</h2>
        <p>Thời hạn tiếp nhận yêu cầu đổi trả tùy theo loại sự cố:</p>
        <ul>
          <li>
            <strong>Hư hỏng do vận chuyển, giao sai mã/sai quy cách, thiếu số lượng hoặc sản phẩm đã hết hạn sử dụng khi nhận:</strong>{' '}
            trong vòng 03 ngày (72 giờ) kể từ thời điểm hệ thống vận chuyển cập nhật trạng thái "Giao hàng thành công". Qua thời hạn
            này, Hạt Lành xin phép từ chối giải quyết các trường hợp này.
          </li>
          <li>
            <strong>Lỗi chất lượng từ quá trình sản xuất</strong> (hạt bị mốc, hôi dầu, có dị vật, mọt, bọ hoặc mùi vị bất thường): Hạt
            Lành tiếp nhận cho đến hết hạn sử dụng in trên bao bì, kể cả khi đã bóc màng seal, với điều kiện sản phẩm được bảo quản đúng
            hướng dẫn (xem mục 3).
          </li>
        </ul>
      </section>
      <section>
        <h2>5. Quy trình xử lý và Chi phí</h2>
        <ul>
          <li>
            <strong>Bước 1:</strong> Khách hàng liên hệ qua Zalo/Hotline: <Phone /> hoặc <Fanpage>Fanpage Hạt Lành</Fanpage>, gửi kèm
            hình ảnh/video rõ nét tình trạng hàng hóa và mã đơn hàng.
          </li>
          <li>
            <strong>Bước 2:</strong> Hạt Lành xác minh và phản hồi phương án xử lý (Đổi hàng mới hoặc Hoàn tiền) trong tối đa 24 giờ
            làm việc.
          </li>
          <li>
            <strong>Bước 3:</strong> Khách hàng gửi lại hàng lỗi về kho Hạt Lành tại địa chỉ: {SHOP.address}.
          </li>
        </ul>
        <p>
          <strong>Chi phí:</strong> Hạt Lành chịu 100% chi phí vận chuyển 2 chiều (gửi hàng lỗi về kho và gửi hàng mới cho khách) đối
          với mọi đơn hàng phát sinh lỗi từ phía Hạt Lành hoặc đơn vị vận chuyển.
        </p>
      </section>
    </PolicyPage>
  )
}

// ---- Trang 2 ---------------------------------------------------------------------------------------------------

export function ShippingPolicyPage() {
  return (
    <PolicyPage title="Chính sách vận chuyển và Giao nhận" updatedAt={UPDATED.shipping} description={`Phương thức, thời gian, phí giao hàng và chính sách freeship của ${BRAND}.`}>
      <section>
        <h2>1. Phương thức và Thời gian giao hàng</h2>
        <p>
          Hạt Lành (xuất kho từ TP.HCM) hiện cung cấp 2 phương thức giao hàng chính để đảm bảo chất lượng hạt và thực phẩm luôn ở trạng
          thái tốt nhất:
        </p>
        <h3 className="mt-4">Giao hàng Hỏa tốc (Khu vực nội thành TP.HCM):</h3>
        <ul>
          <li>Áp dụng qua các đối tác: Grab, XanhSM, Ahamove,...</li>
          <li>Thời gian nhận hàng: Từ 1 - 4 giờ kể từ khi xác nhận đơn.</li>
          <li>
            Thời gian chốt đơn hỏa tốc trong ngày: Các đơn đặt trước 17:00 sẽ được giao ngay trong ngày. Đơn sau giờ này có thể được
            chuyển sang sáng hôm sau.
          </li>
        </ul>
        <h3 className="mt-4">Giao hàng Tiêu chuẩn (Toàn quốc):</h3>
        <ul>
          <li>Áp dụng qua các đối tác: Giao Hàng Tiết Kiệm (GHTK), Viettel Post, Giao Hàng Nhanh (GHN),...</li>
          <li>Khu vực ngoại thành TP.HCM và các tỉnh miền Nam: 2 - 3 ngày làm việc.</li>
          <li>Khu vực miền Trung và miền Bắc: 3 - 4 ngày làm việc.</li>
        </ul>
        <p>
          <strong>Lưu ý:</strong> Thời gian giao hàng không tính Chủ nhật và các ngày Lễ, Tết theo quy định.
        </p>
      </section>
      <section>
        <h2>2. Chi phí vận chuyển (Phí Ship)</h2>
        <ul>
          <li>
            <strong>Giao Hỏa tốc:</strong> Phí vận chuyển tính theo cước phí thực tế của ứng dụng giao hàng tại thời điểm đặt. Nhân
            viên Hạt Lành sẽ gọi điện thông báo chính xác cước phí cho quý khách trước khi gửi.
          </li>
          {/* What CartProperties#shippingFeeFor charges: nothing since 11/2026 (cart.shipping-fee=0). Switching a fee back on
              (CART_SHIPPING_FEE / CART_FREE_SHIPPING_THRESHOLD) means rewriting this item and section 3, and SHIPPING_PROMISE
              in lib/siteInfo.ts. */}
          <li>
            <strong>Giao Tiêu chuẩn toàn quốc:</strong> MIỄN PHÍ cho mọi đơn hàng, không phân biệt giá trị đơn, khối lượng hay địa chỉ
            nhận hàng. Bước Thanh toán hiển thị "Phí giao hàng: Miễn phí" trước khi quý khách bấm "Đặt hàng".
          </li>
        </ul>
      </section>
      <section>
        <h2>3. Chính sách Miễn phí vận chuyển (Freeship)</h2>
        <p>
          Hạt Lành miễn phí giao hàng tiêu chuẩn toàn quốc cho mọi đơn hàng, không cần đạt giá trị tối thiểu. Quý khách chỉ thanh
          toán đúng số tiền hiển thị ở bước Thanh toán, không trả thêm phí giao hàng khi nhận hàng.
        </p>
        <p>
          Giao hỏa tốc nội thành TP.HCM không nằm trong chương trình này: phí tính theo cước thực tế như mục 2, nhân viên Hạt Lành
          gọi báo phí trước khi gửi.
        </p>
      </section>
      <section>
        <h2>4. Tiêu chuẩn đóng gói an toàn thực phẩm</h2>
        <p>
          Mọi đơn hàng tại Hạt Lành (từ hạt nguyên, nhân mắc ca, ngũ cốc đến bánh thuyền) trước khi giao cho đơn vị vận chuyển đều
          được:
        </p>
        <ul>
          <li>Niêm phong bao bì/hũ PET đúng quy cách, đảm bảo kín khí.</li>
          <li>Quấn màng xốp hơi (bubble wrap) chống sốc nhiều lớp đối với các sản phẩm hũ, lon, hoặc hàng dễ vỡ nát.</li>
          <li>Đóng gói cố định trong thùng carton, dán băng keo niêm phong chữ thập.</li>
        </ul>
      </section>
      <section>
        <h2>5. Trách nhiệm xử lý rủi ro hàng hóa</h2>
        <ul>
          <li>
            Hạt Lành chịu hoàn toàn trách nhiệm về rủi ro hàng hóa (móp méo hũ hộp, mất mát, rách bao bì ảnh hưởng đến thực phẩm) trong
            suốt quá trình vận chuyển từ kho đến tận tay khách hàng.
          </li>
          <li>
            Khách hàng vui lòng tham khảo <To to="/chinh-sach-doi-tra">Chính sách đổi trả và Đồng kiểm</To> để được hướng dẫn xử lý
            ngay lập tức nếu nhận phải thùng hàng có dấu hiệu hư hại.
          </li>
        </ul>
      </section>
    </PolicyPage>
  )
}

// ---- Trang 3 ---------------------------------------------------------------------------------------------------

/** Terms of sale (A) and privacy policy (B, #bao-mat) on one page. /dieu-khoan-su-dung and /chinh-sach-bao-mat lead here. */
export function TermsPage() {
  const { hash } = useLocation()
  // The router restores the scroll on navigation but does not follow #bao-mat: do it once the page is drawn
  useEffect(() => {
    if (hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView()
  }, [hash])
  return (
    <PolicyPage
      updatedAt={UPDATED.terms}
      title="Điều khoản giao dịch chung và Chính sách bảo mật"
      description={`Điều khoản đặt hàng, thanh toán, huỷ đơn, khiếu nại và cách ${BRAND} thu thập, sử dụng, bảo vệ thông tin cá nhân.`}
    >
      <section aria-labelledby="dieu-khoan" className="space-y-6">
        <h2 id="dieu-khoan" className="scroll-mt-24">
          Phần A. Điều khoản giao dịch chung
        </h2>
        <div>
          <h3>1. Giới thiệu chung và Phạm vi áp dụng</h3>
          <p>
            Chào mừng quý khách đến với website mua sắm trực tuyến Hạt Lành. Các Điều khoản giao dịch chung này áp dụng cho các đơn hàng
            đặt tại website. Quý khách xác nhận đã đọc và đồng ý với các điều khoản này khi bấm nút "Đặt hàng" (bên cạnh nút có đường
            dẫn tới trang này). Việc đồng ý với <a href="#bao-mat" className={linkClass}>Chính sách bảo mật</a> (Phần B) được thực hiện
            riêng, bằng ô đánh dấu khi đăng ký tài khoản hoặc khi đặt hàng.
          </p>
          <p>
            Các điều khoản này có thể được cập nhật để tuân thủ pháp luật hiện hành (bao gồm Luật Thương mại điện tử số 122/2025/QH15 và
            Nghị định 248/2026/NĐ-CP). Khi có thay đổi, Hạt Lành sẽ thông báo trên website kèm ngày có hiệu lực của bản mới. Nội dung thay
            đổi chỉ áp dụng cho các đơn hàng đặt từ ngày có hiệu lực đó trở đi; đơn hàng đã đặt trước đó tiếp tục áp dụng điều khoản tại
            thời điểm đặt hàng.
          </p>
        </div>
        <div>
          <h3>2. Tài khoản</h3>
          <p>
            Quý khách chịu trách nhiệm giữ bí mật mật khẩu. Hạt Lành có thể tạm khoá tài khoản có dấu hiệu gian lận hoặc lạm dụng. Quý
            khách vẫn có thể đặt hàng mà không cần tài khoản.
          </p>
        </div>
        <div>
          <h3>3. Đặt hàng và Xác lập giao dịch</h3>
          <ul>
            <li>
              <strong>Trạng thái chờ xác nhận:</strong> Khi quý khách bấm "Đặt hàng", hệ thống sẽ ghi nhận yêu cầu. Đây chỉ là bước tiếp
              nhận thông tin, chưa phải là xác lập hợp đồng mua bán chính thức.
            </li>
            <li>
              <strong>Trạng thái đã xác nhận:</strong> Đơn hàng chỉ được xác nhận thành công và có hiệu lực khi nhân viên Hạt Lành gọi
              điện thoại/nhắn tin xác nhận trực tiếp, hoặc hệ thống cập nhật trạng thái đơn thành "Đã xác nhận".
            </li>
            <li>
              <strong>Quyền từ chối đơn hàng:</strong> Hạt Lành có quyền từ chối hoặc hủy đơn hàng của quý khách vì các lý do kỹ thuật
              (lỗi hiển thị giá), hết hàng lưu kho, hoặc phát hiện dấu hiệu gian lận. Trong trường hợp này, nhân viên sẽ liên hệ thông
              báo trực tiếp.
            </li>
          </ul>
        </div>
        <div>
          <h3>4. Giá bán và Thanh toán</h3>
          <ul>
            <li>
              <strong>Giá bán:</strong> Toàn bộ giá niêm yết trên website được tính bằng Việt Nam Đồng (VNĐ). Hạt Lành cam kết giữ đúng
              mức giá tại thời điểm quý khách đặt hàng cho đơn hàng đó.
            </li>
            <li>
              <strong>Thanh toán:</strong> Hiện tại, Hạt Lành chỉ hỗ trợ một phương thức duy nhất: Thanh toán tiền mặt khi nhận hàng
              (COD). Quý khách thanh toán trực tiếp cho nhân viên giao hàng sau khi hoàn tất bước đồng kiểm.
            </li>
          </ul>
        </div>
        <div>
          <h3>5. Thông tin sản phẩm</h3>
          <p>
            Giá trị dinh dưỡng mang tính tham khảo, tính trên 100g sản phẩm. Sản phẩm không phải là thuốc và không có tác dụng thay thế
            thuốc chữa bệnh. Sản phẩm chứa các loại hạt; người có tiền sử dị ứng với hạt cần cân nhắc trước khi sử dụng.
          </p>
        </div>
        <div>
          <h3>6. Hủy đơn hàng</h3>
          <p>
            <strong>Từ phía khách hàng:</strong>
          </p>
          <ul>
            <li>
              Đối với khách hàng có tài khoản: Quý khách có thể chủ động hủy đơn hàng trực tiếp trên hệ thống website tại mục "Đơn hàng
              của bạn" khi đơn đang ở trạng thái "Chờ xác nhận".
            </li>
            <li>
              Đối với khách hàng mua ẩn danh (không có tài khoản): Quý khách vui lòng liên hệ Hotline/Zalo: <Phone /> để được nhân viên
              hỗ trợ hủy đơn trước khi đơn được xác nhận.
            </li>
            <li>
              Lưu ý chung: Nếu đơn hàng đã chuyển sang trạng thái "Đã xác nhận" hoặc "Đang giao", yêu cầu hủy đơn trên website sẽ bị vô
              hiệu hóa. Trong trường hợp này, nếu quý khách từ chối nhận hàng khi shipper giao đến, quý khách vui lòng thanh toán phí
              vận chuyển 2 chiều.
            </li>
          </ul>
          <p>
            <strong>Từ phía Hạt Lành:</strong>
          </p>
          <p>
            Hạt Lành tự động hủy đơn nếu không thể liên lạc xác nhận qua số điện thoại quý khách cung cấp quá 03 lần, hoặc sản phẩm
            ngừng kinh doanh đột xuất do lỗi lô hàng để đảm bảo an toàn thực phẩm.
          </p>
        </div>
        <div>
          <h3>7. Vận chuyển và Trả hàng</h3>
          <ul>
            <li>
              Quy định về cước phí, thời gian giao nhận được áp dụng theo <To to="/chinh-sach-van-chuyen">Chính sách vận chuyển</To>.
            </li>
            <li>
              Quy định về đồng kiểm, đổi mới sản phẩm lỗi hoặc hoàn tiền được áp dụng theo{' '}
              <To to="/chinh-sach-doi-tra">Chính sách đổi trả và Đồng kiểm</To>.
            </li>
          </ul>
        </div>
        <div>
          <h3>8. Giải quyết khiếu nại</h3>
          <p>
            Hạt Lành luôn đề cao sự minh bạch và bảo vệ quyền lợi hợp pháp của người tiêu dùng đối với các sản phẩm hạt dinh dưỡng, thực
            phẩm an toàn.
          </p>
          <ul>
            <li>
              <strong>Kênh tiếp nhận:</strong> Mọi thắc mắc hoặc khiếu nại về chất lượng sản phẩm, dịch vụ vận chuyển, quý khách vui
              lòng liên hệ trực tiếp qua Zalo/Hotline: <Phone />, email <Email /> hoặc Fanpage chính thức Hạt Lành: <Fanpage />
            </li>
            <li>
              <strong>Thời gian xử lý:</strong> Chúng tôi cam kết tiếp nhận và đưa ra phương án phản hồi trong vòng tối đa 24 giờ làm
              việc kể từ thời điểm nhận được thông tin.
            </li>
          </ul>
        </div>
        <div>
          <h3>9. Thông tin đơn vị vận hành</h3>
          {/* Owner name and tax / business registration number: not published until the owner provides them */}
          <ul>
            <li>Tên cửa hàng: Hạt Lành</li>
            <li>Địa chỉ kho: {SHOP.address}.</li>
            <li>
              Hotline/Zalo: <Phone /> · Email: <Email />
            </li>
          </ul>
        </div>
      </section>

      <section aria-labelledby="bao-mat" className="space-y-6 border-t border-stone-200 pt-8">
        <h2 id="bao-mat" className="scroll-mt-24">
          Phần B. Chính sách bảo mật
        </h2>
        <div>
          <h3>1. Đơn vị chịu trách nhiệm</h3>
          <p>
            Hạt Lành, địa chỉ: {SHOP.address}. Liên hệ về dữ liệu cá nhân: <Email />.
          </p>
        </div>
        <div>
          <h3>2. Thông tin chúng tôi thu thập</h3>
          <ul>
            <li>Khi đăng ký: họ tên, email, số điện thoại (không bắt buộc), mật khẩu (chỉ lưu dạng mã hoá một chiều).</li>
            <li>
              Khi đăng nhập bằng Google: Google gửi cho chúng tôi họ tên, email (đã được Google xác minh) và ảnh đại diện. Chúng tôi chỉ
              lưu họ tên, email và mã định danh tài khoản Google, không lưu ảnh đại diện. Chúng tôi không bao giờ nhận hay biết mật khẩu
              Google của bạn.
            </li>
            <li>Khi đặt hàng: họ tên người nhận, số điện thoại, email (không bắt buộc), địa chỉ giao hàng, ghi chú.</li>
            <li>Nhật ký kỹ thuật: địa chỉ IP và trình duyệt khi đăng nhập, dùng để bảo vệ tài khoản.</li>
          </ul>
        </div>
        <div>
          <h3>3. Mục đích sử dụng</h3>
          <ul>
            <li>Xử lý, giao hàng và hỗ trợ đơn hàng; gửi email xác nhận, giao hàng, huỷ đơn.</li>
            <li>Quản lý tài khoản, đặt lại mật khẩu, chống gian lận và spam.</li>
          </ul>
        </div>
        <div>
          <h3>4. Cookie và lưu trữ trên trình duyệt</h3>
          <p>
            Phiên đăng nhập dùng cookie bảo mật (httpOnly), trang web không đọc được bằng JavaScript. Giỏ hàng của khách chưa đăng nhập
            được lưu trong trình duyệt của bạn. Chúng tôi không dùng cookie quảng cáo.
          </p>
        </div>
        <div>
          <h3>5. Bên thứ ba xử lý dữ liệu</h3>
          <ul>
            <li>Lưu trữ máy chủ và cơ sở dữ liệu: Render, Neon (máy chủ tại Singapore).</li>
            <li>Lưu trữ ảnh sản phẩm: Cloudinary.</li>
            <li>Gửi email: Resend. Chống bot ở form đăng ký: Cloudflare Turnstile. Đăng nhập Google: Google.</li>
            {/* Not listed: Telegram order alerts carry only the order code, the products and quantities, the total and the admin link
                (notify/OrderTelegramAlerts). List it again if customer details are ever sent there. */}
            <li>
              Đơn vị vận chuyển (Giao Hàng Tiết Kiệm, Viettel Post, Giao Hàng Nhanh, Grab, XanhSM, Ahamove...) nhận tên, số điện thoại,
              địa chỉ để giao hàng.
            </li>
          </ul>
        </div>
        <div>
          <h3>6. Thời gian lưu trữ</h3>
          {/* TODO(owner): the periods below (24 tháng, 10 năm, 90 ngày) are proposals, see the TODO in
              docs/chinh-sach-noi-dung.md. privacy.DataRetentionJob applies 90 ngày and 24 tháng (app.retention.*);
              orders are never deleted automatically. */}
          <ul>
            <li>
              Tài khoản (họ tên, email, số điện thoại, mật khẩu đã mã hoá): lưu cho đến khi bạn yêu cầu xoá tài khoản, hoặc tối đa 24 tháng
              kể từ lần đăng nhập cuối cùng.
            </li>
            <li>
              Đơn hàng (thông tin người nhận, sản phẩm, số tiền): 10 năm kể từ ngày đặt hàng, theo quy định về lưu trữ chứng từ kế toán,
              thuế. Khi bạn xoá tài khoản, đơn hàng vẫn được giữ đến hết thời hạn này nhưng không còn gắn với tài khoản.
            </li>
            <li>Nhật ký kỹ thuật khi đăng nhập (địa chỉ IP, trình duyệt): 90 ngày.</li>
            <li>
              Thời điểm bạn đồng ý với Chính sách bảo mật và phiên bản chính sách: lưu cùng tài khoản hoặc đơn hàng tương ứng, trong cùng
              thời hạn.
            </li>
            <li>
              Giỏ hàng của khách chưa đăng nhập: chỉ nằm trong trình duyệt của bạn, mất đi khi bạn đặt hàng hoặc xoá dữ liệu trình duyệt.
            </li>
          </ul>
        </div>
        <div>
          <h3>7. Quyền của bạn</h3>
          <p>Bạn có các quyền sau đối với dữ liệu cá nhân của mình:</p>
          <ul>
            <li>Được biết và xem dữ liệu chúng tôi đang lưu về bạn.</li>
            <li>Yêu cầu chỉnh sửa dữ liệu không chính xác.</li>
            <li>Yêu cầu xoá dữ liệu (trừ dữ liệu pháp luật buộc phải lưu giữ, xem mục 6).</li>
            <li>
              Rút lại sự đồng ý. Việc rút lại không ảnh hưởng đến việc xử lý đã thực hiện trước đó; đơn hàng đang giao có thể không hoàn tất
              được nếu bạn rút lại sự đồng ý trước khi nhận hàng.
            </li>
            <li>Yêu cầu hạn chế xử lý dữ liệu.</li>
            <li>Phản đối việc xử lý dữ liệu.</li>
            <li>
              Khiếu nại về cách chúng tôi xử lý dữ liệu của bạn. Nếu không đồng ý với kết quả giải quyết, bạn có quyền khiếu nại, tố cáo
              hoặc khởi kiện tới cơ quan nhà nước có thẩm quyền theo quy định của pháp luật.
            </li>
          </ul>
          <p>
            <strong>Cách gửi yêu cầu:</strong> email <Email /> hoặc Zalo <Phone />. Để bảo vệ bạn, chúng tôi có thể đề nghị xác minh
            bằng email hoặc số điện thoại đã dùng khi đăng ký hoặc đặt hàng.
          </p>
          <p>
            <strong>Thời hạn phản hồi</strong> (kể từ khi nhận được yêu cầu):
          </p>
          <ul>
            <li>Xác nhận đã nhận yêu cầu: trong 02 ngày làm việc.</li>
            <li>Xem, chỉnh sửa dữ liệu: trong 10 ngày.</li>
            <li>Rút lại sự đồng ý, hạn chế xử lý hoặc phản đối xử lý: trong 15 ngày.</li>
            <li>Xoá dữ liệu: trong 20 ngày.</li>
          </ul>
        </div>
      </section>
    </PolicyPage>
  )
}

// ---- Trang 4 ---------------------------------------------------------------------------------------------------

export function ContactPage() {
  return (
    <PolicyPage title="Liên hệ" updatedAt={UPDATED.contact} contactLink={false} description={`Địa chỉ, hotline/Zalo, email, giờ làm việc và fanpage của ${BRAND}.`}>
      <section>
        <ul>
          <li>Địa chỉ kho: {SHOP.address}.</li>
          <li>
            Hotline/Zalo: <Phone />
          </li>
          <li>
            Email: <Email />
          </li>
          <li>Khung giờ làm việc: {SHOP.hours}.</li>
          <li>
            Fanpage Facebook: <Fanpage />
          </li>
          <li>
            Về đơn hàng: Kiểm tra tình trạng đơn bằng mã đơn và số điện thoại tại <To to="/tra-cuu-don-hang">Tra cứu đơn hàng</To>. Khi
            liên hệ, vui lòng cho biết mã đơn (dạng HL…).
          </li>
        </ul>
      </section>
    </PolicyPage>
  )
}
