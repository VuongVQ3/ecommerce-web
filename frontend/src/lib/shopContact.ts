/**
 * The shop's public contact details, as published in the policy pages (docs/chinh-sach-noi-dung.md, 02/11/2026).
 * The one source for the policy pages, the footer and the floating contact button.
 * Owner name and tax / business registration number are not published yet: they come from the server config
 * (BUSINESS_*) and stay hidden until set.
 */
export const SHOP = {
  phone: '0898 98 68 21',
  phoneHref: 'tel:0898986821',
  email: 'hatlanhstore@gmail.com',
  address: 'Chung cư Đạt Gia - Số 43, đường Cây Keo, Phường Tam Bình, Tp Hồ Chí Minh',
  hours: 'Thứ 2 - Thứ 7, 08:30 - 17:00',
  fanpage: 'https://www.facebook.com/profile.php?id=61596137600993',
  zalo: 'https://zalo.me/0898986821',
} as const

/**
 * Shown under the title of every policy page. Same date as PolicyVersion.CURRENT in the backend (stored with each
 * privacy consent): change both together.
 */
export const POLICY_UPDATED = '03/11/2026'
