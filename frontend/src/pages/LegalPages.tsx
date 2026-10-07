import type { ReactNode } from 'react'

/** Placeholder until the real legal text is written (should be reviewed by someone qualified before launch). */
function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold text-stone-900">{title}</h1>
      <p className="mt-2 text-sm text-muted">Bản nháp, nội dung chính thức đang được soạn thảo.</p>
      <div className="mt-6 space-y-4 leading-relaxed text-stone-700">{children}</div>
    </article>
  )
}

export function TermsPage() {
  return (
    <LegalPage title="Điều khoản sử dụng">
      <p>
        Trang này sẽ trình bày các điều khoản khi bạn sử dụng website và mua hàng tại Hạt Lành: tài khoản, đặt hàng,
        thanh toán, giao hàng, đổi trả và trách nhiệm của các bên.
      </p>
      <p>Mọi thắc mắc vui lòng liên hệ hotline 0900 000 000 hoặc email hello@hatlanh.vn.</p>
    </LegalPage>
  )
}

export function PrivacyPage() {
  return (
    <LegalPage title="Chính sách bảo mật">
      <p>
        Trang này sẽ trình bày cách Hạt Lành thu thập, sử dụng và bảo vệ dữ liệu cá nhân của bạn (họ tên, email, số
        điện thoại, địa chỉ giao hàng), thời gian lưu trữ và quyền của bạn đối với dữ liệu của mình.
      </p>
      <p>
        Bạn chỉ nhận email khuyến mãi khi đã đồng ý, và có thể huỷ đăng ký bất cứ lúc nào. Email về đơn hàng và tài
        khoản (ví dụ đặt lại mật khẩu) vẫn được gửi khi cần.
      </p>
    </LegalPage>
  )
}
