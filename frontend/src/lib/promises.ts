/**
 * The one-line promises under "Thêm vào giỏ hàng" on the product page, each linking to the policy it sums up (the
 * same pages as in the footer). Edit the wording here. No figures (fees, number of days): the codebase has no
 * source for them yet (the policy pages still mark them as to be filled in).
 */
export const PURCHASE_PROMISES: readonly { label: string; to: string }[] = [
  { label: 'Giao hàng toàn quốc', to: '/chinh-sach-van-chuyen' },
  { label: 'Đổi trả', to: '/chinh-sach-doi-tra' },
  // Cash on delivery is described on the shipping policy page
  { label: 'Thanh toán khi nhận hàng', to: '/chinh-sach-van-chuyen' },
]
