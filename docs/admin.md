# Trang quản trị (back office)

Khu vực `/admin` dành cho nhân viên (STAFF) và quản trị viên (ADMIN). Từ 1024px có sidebar; nhỏ hơn thì có thanh
trên cùng (tên trang + nút menu mở ngăn kéo). Mã nguồn: `frontend/src/admin/*`, `backend/src/main/java/com/nutshop/admin/*`,
`order/AdminOrderService`, `order/PhoneFlagService`, `product/AdminProductService`.

## Phân quyền

| Chức năng | STAFF | ADMIN |
|---|---|---|
| Tổng quan, đơn hàng (xem, xác nhận, giao, hoàn tất, huỷ, ghi chú) | ✅ | ✅ |
| Đánh dấu số điện thoại "Cần lưu ý" (số chưa có đánh dấu) | ✅ | ✅ |
| Chặn COD, sửa/bỏ đánh dấu số điện thoại | ❌ (403) | ✅ |
| Tồn kho (xem, nhập hàng, kiểm kê, lịch sử) | ✅ | ✅ |
| Xem danh mục | ✅ | ✅ |
| Sản phẩm, giá, ảnh, ẩn/hiện; thêm/đổi tên danh mục; khuyến mại | ❌ (403) | ✅ |
| Người dùng (đổi vai trò, khoá, mời nhân viên), nhật ký thao tác | ❌ (403) | ✅ |

- Mọi đường dẫn `/api/admin/**` yêu cầu STAFF hoặc ADMIN ngay ở tầng filter, và từng controller còn gắn `@Roles`
  (`AdminController`: STAFF+ADMIN, `AdminCatalogController`/`AdminUserController`: ADMIN). Khách thường → 403, chưa
  đăng nhập → 401.
- **Vai trò và trạng thái khoá được kiểm tra lại ở mỗi request** (`UserStatusFilter`, đọc DB qua cache 60 giây, cache
  bị xoá ngay khi admin đổi vai trò/khoá). Vì vậy:
  - Tài khoản bị khoá → 401 `ACCOUNT_LOCKED` ở request kế tiếp, mọi refresh token bị thu hồi.
  - STAFF bị hạ về CUSTOMER → 403 ở request `/api/admin` kế tiếp, không cần đợi access token hết hạn.

## Tạo ADMIN đầu tiên

Không có mật khẩu nào nằm trong code hay cấu hình:

1. Đăng ký tài khoản bình thường trên web bằng email của bạn.
2. Đặt biến môi trường `ADMIN_EMAIL=<email đó>` (local: `backend/.env`; Render: Environment → Add) rồi khởi động lại.
3. Khi khởi động, `AdminBootstrap` nâng tài khoản đó lên ADMIN (ghi `USER_PROMOTED` vào audit log). Nếu email chưa
   đăng ký, chỉ ghi cảnh báo vào log, không tạo tài khoản.

ADMIN **chỉ** sinh ra theo cách này. Trên giao diện chỉ đổi được CUSTOMER ↔ STAFF.

## Người dùng (ADMIN) — `/admin/nguoi-dung`

- Danh sách: tìm theo tên/email/số điện thoại, lọc vai trò và trạng thái, kèm số đơn và tổng tiền đơn **Hoàn tất**.
  Bấm tên để xem chi tiết và các đơn của người đó.
- **Đổi vai trò** `POST /api/admin/users/{id}/role {role, reason}`: chỉ CUSTOMER ↔ STAFF. Tự đổi mình → 409
  `SELF_CHANGE`; đụng tới ADMIN hoặc đổi thành ADMIN → 409 `ROLE_NOT_ALLOWED`; không đổi gì → 409 `ROLE_UNCHANGED`.
- **Khoá / mở khoá** `POST /api/admin/users/{id}/active {active, reason}`: thu hồi mọi phiên đăng nhập. Không tự khoá
  mình; không khoá được ADMIN cuối cùng còn hoạt động (409 `LAST_ADMIN`).
- **Mời nhân viên** `POST /api/admin/users/invitations {fullName, email, reason}`: tạo tài khoản STAFF chưa có mật
  khẩu và gửi email chứa link `/dat-mat-khau?token=…` (hiệu lực **48 giờ**, dùng một lần; trang này `noindex`,
  `no-store`, `no-referrer`). Email đã có tài khoản → 409 `EMAIL_EXISTS`. Trong danh sách hiện "Chờ nhận lời mời" tới
  khi người đó đặt mật khẩu. Chưa cấu hình Resend thì nội dung email (kèm link) chỉ nằm trong log server.
- Mọi thao tác đều bắt buộc **lý do**, ghi vào nhật ký.
- Tab **Số điện thoại bị đánh dấu**: danh sách, lọc theo mức, sửa/bỏ đánh dấu.

## Đổi mật khẩu bắt buộc

- STAFF/ADMIN đăng nhập bằng mật khẩu không đạt quy tắc hiện tại (8–72 ký tự, có chữ và số) bị gắn
  `passwordChangeRequired`. Khi đó mọi `/api/admin/**` trả 403 `PASSWORD_CHANGE_REQUIRED` và giao diện chuyển tới
  `/tai-khoan/doi-mat-khau` cho tới khi đổi xong.
- `POST /api/auth/change-password {currentPassword, newPassword}`: sai mật khẩu hiện tại → `WRONG_PASSWORD`, trùng
  mật khẩu cũ → `SAME_PASSWORD`. Đổi xong thì đăng xuất mọi thiết bị khác, trình duyệt hiện tại nhận cookie mới.
- Ai cũng đổi được mật khẩu ở tab "Đổi mật khẩu" trong trang tài khoản (hoặc link trong menu quản trị).

## Đơn hàng

`GET /api/admin/orders?status=&from=YYYY-MM-DD&to=YYYY-MM-DD&q=&page=` — lọc theo trạng thái, khoảng ngày (giờ Việt
Nam), tìm theo mã đơn (tiền tố) hoặc số điện thoại (mọi kiểu viết: `0912…`, `+84 912…`). Trả kèm `pendingCount`, và
mỗi dòng có `flagLevel`/`flagReason` nếu số điện thoại bị đánh dấu (biểu tượng ⚠ trong danh sách).

| Hành động | Endpoint | Chuyển trạng thái | Kho |
|---|---|---|---|
| Xác nhận | `POST /orders/{code}/confirm` `{contact, note?}` | PENDING → CONFIRMED | — |
| Giao vận chuyển | `POST /orders/{code}/ship` `{carrier, trackingNumber}` | CONFIRMED → SHIPPING | trừ `on_hand` và `reserved` |
| Giao thành công | `POST /orders/{code}/complete` | SHIPPING → COMPLETED | — |
| Huỷ | `POST /orders/{code}/cancel` `{reasonCode, reason}` | PENDING/CONFIRMED → CANCELLED | trả `reserved` |
| Khách không nhận | `POST /orders/{code}/cancel` `{reasonCode: REFUSED_DELIVERY, reason}` | SHIPPING → CANCELLED | `RETURN`: cộng lại `on_hand` |
| Ghi chú nội bộ | `POST /orders/{code}/notes` `{body}` | — | — |

### Quy trình xác nhận đơn COD

1. Mở đơn, khối **Khách hàng** có nút **Gọi** (`tel:`), **Zalo** (`zalo.me/<số>`, tab mới) và **Sao chép** số.
2. Khối này cũng cho biết lịch sử của số điện thoại: **Khách mới** (chưa có đơn trước), số đơn trước đây / hoàn tất /
   đã huỷ / không nhận hàng, ngày đặt đơn đầu tiên; nhãn vàng **Cần lưu ý** (đánh dấu WATCH hoặc từng không nhận hàng)
   hoặc đỏ **Chặn đặt COD**, kèm lý do.
3. Bấm **Xác nhận đơn** → chọn kết quả liên hệ: *Đã gọi điện* / *Đã nhắn Zalo* → đơn chuyển CONFIRMED; *Chưa liên hệ
   được* → đơn **giữ nguyên** Chờ xác nhận, chỉ ghi ghi chú nội bộ (audit `ORDER_CONTACT_FAILED`). Mỗi lần xác nhận
   đều sinh một ghi chú nội bộ.

### Huỷ đơn

- Bắt buộc chọn **nhóm lý do** (`cancel_reason_code`: Khách yêu cầu huỷ, Hết hàng, Không liên lạc được khách, Lý do
  khác) và nhập lý do gửi cho khách. Khách tự huỷ → `CUSTOMER_REQUEST`.
- Đơn **Đang giao** chỉ huỷ được với lý do **Khách không nhận hàng** (`REFUSED_DELIVERY`); lý do này dùng cho đơn
  chưa giao → 409 `INVALID_CANCEL_REASON`. Hàng hoàn về được ghi movement `RETURN`. Sau khi huỷ, trang gợi ý
  **Đánh dấu số điện thoại này?**.

### Đánh dấu số điện thoại (`phone_flags`)

- `WATCH` (Cần lưu ý): chỉ cảnh báo. `BLOCK_COD` (Chặn đặt COD): đặt đơn với số này → 409 `COD_NOT_AVAILABLE` "Vui
  lòng liên hệ hotline để được hỗ trợ đặt hàng." (hiện chỉ có COD nên thực tế là chặn đặt hàng).
- STAFF chỉ thêm được WATCH cho số chưa bị đánh dấu; ADMIN đặt mọi mức, sửa và bỏ đánh dấu. Luôn cần lý do.
- API: `GET /api/admin/customers/by-phone/{phone}/stats?exclude={code}`, `GET /api/admin/phone-flags`,
  `PUT /api/admin/phone-flags/{phone} {level, reason}`, `POST /api/admin/phone-flags/{phone}/remove {reason}`.

### Khác

- Chuyển sai trạng thái → **409 `INVALID_STATUS_TRANSITION`**. Trang chi tiết chỉ hiện các nút hợp lệ
  (`allowedActions`). Trên điện thoại các nút nằm ở thanh dưới cùng (chừa vùng an toàn của màn hình).
- Mỗi hành động **khoá dòng đơn hàng** (`SELECT … FOR UPDATE`) trước khi đọc trạng thái, trong cùng transaction với
  việc trừ kho: bấm đúp hay hai nhân viên cùng bấm thì chỉ một lần thành công, lần sau nhận 409; kho chỉ bị trừ một lần.
- Email cho khách (nếu đơn có email) khi **SHIPPING** (kèm đơn vị và mã vận đơn) và **CANCELLED** (kèm lý do), gửi sau
  khi commit.
- Nhãn trạng thái dùng chung một nguồn: `frontend/src/lib/orderStatus.ts` và `OrderStatus.java` (Chờ xác nhận, Đã xác
  nhận, Đang giao, **Hoàn tất**, Đã huỷ).

## Tồn kho

- `on_hand`: hàng thực có trong kho. `reserved`: đang giữ cho đơn chưa giao. `available = on_hand − reserved`.
- Dòng có `available ≤ low_stock_threshold` (mặc định 10, chỉnh theo từng sản phẩm) được tô vàng; lọc bằng `?low=true`.
- **Nhập hàng** `POST /inventory/{id}/import` `{quantity, unitCost?, supplier?, note?}` → movement `IMPORT`.
- **Kiểm kê** `POST /inventory/{id}/stocktake` `{counted, reason}` → movement `ADJUST` bằng phần chênh lệch (không
  chênh thì không ghi). Không cho đếm thấp hơn số đang giữ cho đơn (409 `COUNT_BELOW_RESERVED`).
- **Hàng hoàn** (khách không nhận) → movement `RETURN`, cộng lại `on_hand`.
- **Lịch sử** `GET /inventory/{id}/movements` — kèm mã đơn, người thao tác, nhà cung cấp, giá nhập.

Bất biến (được kiểm tra trong `AdminE2ETest`):

```
on_hand  = Σ quantity của IMPORT, ADJUST, ORDER_SHIP, RETURN
reserved = Σ quantity của ORDER_RESERVE, ORDER_CANCEL, ORDER_SHIP
```

Migration V10 ghi một dòng `ADJUST "Tồn đầu kỳ"` cho tồn kho có sẵn để bất biến đúng từ đầu. Cột `on_hand`/`reserved`
chỉ được đổi bằng câu UPDATE có điều kiện (`StockUpdateRepository`), không bao giờ qua việc lưu entity.

### Tồn kho công khai

API cửa hàng không lộ số tồn chính xác: `stockStatus` = `IN_STOCK` | `LOW_STOCK` (kèm `quantity` khi còn ≤ 5) |
`OUT_OF_STOCK`. Trang sản phẩm hiện "Còn hàng" / "Chỉ còn N" / "Hết hàng". `maxPurchasable` = số còn lại khi ≤ 5,
ngược lại là giới hạn mỗi sản phẩm trong giỏ (10); giỏ hàng tự giảm và cảnh báo nếu vượt.

## Sản phẩm và danh mục (ADMIN)

- Thêm/sửa đầy đủ thông tin (giá, khối lượng, dinh dưỡng/100g, ngưỡng cảnh báo). Sản phẩm mới có tồn 0 — nhập hàng
  ở trang Tồn kho.
- **Ô nhập tiền** (`MoneyInput`, dùng cho giá bán, giá nhập, giá khuyến mại): tự thêm dấu chấm hàng nghìn khi gõ,
  giữ đúng vị trí con trỏ, dán "1.890.000" vẫn đúng. Dưới ô giá có dòng "= 189.000₫", cảnh báo (không chặn) nếu giá
  không chẵn nghìn, và "Đang khuyến mại: … đến hết dd/MM" nếu sản phẩm đang có khuyến mại. Giá hợp lệ 1.000 –
  100.000.000₫.
- Đổi giá **quá 50%** so với giá cũ → hộp xác nhận "Giá cũ … → Giá mới … (+900%)" với nút **Xác nhận đổi giá** /
  **Sửa lại** (chống gõ thừa/thiếu số 0).
- Rời trang khi form còn thay đổi chưa lưu → hỏi lại (trong app là hộp thoại, đóng/tải lại tab là hộp của trình duyệt).
- **Slug**: để trống thì tự tạo từ tên (bỏ dấu, `đ → d`), trùng thì thêm `-2`, `-3`…; tự nhập thì phải đúng dạng
  `chu-thuong-khong-dau` (400 `INVALID_SLUG`) và chưa ai dùng (409 `SLUG_EXISTS`).
- **Ẩn/Hiện** (`PATCH /products/{id}/active`), có hộp xác nhận: cách ngừng bán thông thường. Sản phẩm ẩn biến mất
  khỏi danh sách/tìm kiếm và không mua được; đơn cũ không bị ảnh hưởng; hiện lại được bất cứ lúc nào.
- **Xoá** (`DELETE /products/{id}` → 204, nút "Xoá" trên bảng, "Xoá sản phẩm" trong menu ⋯ trên điện thoại): xoá hẳn
  cùng ảnh (file Cloudinary xoá sau khi commit), slug cũ, lịch sử kho, khuyến mại và các dòng trong giỏ của khách;
  không khôi phục được. Hộp xác nhận "Xoá vĩnh viễn" cảnh báo nếu trong kho còn hàng. Chỉ xoá được sản phẩm **chưa
  từng có trong đơn hàng** (đơn cũ phải giữ thông tin sản phẩm): ngược lại trả 409 `PRODUCT_HAS_ORDERS`, hộp thoại
  ẩn nút xoá và gợi ý "Ẩn sản phẩm thay vì xoá". Ghi nhật ký `PRODUCT_DELETED` (kèm thông tin sản phẩm trước khi xoá).
- **Thứ tự hiển thị**: kéo tay nắm ⠿ ở đầu mỗi dòng (chuột hoặc cảm ứng; Esc huỷ; trang tự cuộn khi kéo gần mép), hoặc
  chọn tay nắm rồi bấm ↑/↓. Danh sách tải tới 100 sản phẩm một trang nên kéo được khắp danh mục (nhiều hơn thì chỉ kéo
  trong trang đang xem). Thứ tự đổi ngay trên màn hình rồi gửi `POST /products/{id}/move` với `{beforeId}` (đặt ngay
  trước), `{afterId}` (đặt ngay sau) hoặc `{}` (cuối); lỗi thì báo và tải lại thứ tự thật. Server đánh số lại cả danh
  mục 1, 2, 3… theo thứ tự của danh sách admin (cũng là thứ tự cửa hàng); 400 `INVALID_MOVE` (có cả hai, hoặc trỏ vào
  chính nó), 409 `MOVE_TARGET_GONE` (sản phẩm làm mốc đã bị xoá). Nhật ký `PRODUCT_MOVED` ghi vị trí cũ → mới, chỉ khi
  vị trí thực sự đổi. Form sửa sản phẩm không còn ô "Thứ tự hiển thị" (trường `sortOrder` của API vẫn nhận, để trống
  thì giữ nguyên).
- Danh mục: thêm và đổi tên (kèm slug). Không có chức năng xoá.

### Ảnh (Cloudinary)

- Cấu hình: `CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>` (Cloudinary console → API Keys). Chưa
  đặt thì upload trả 503 "Chưa cấu hình nơi lưu ảnh (CLOUDINARY_URL)", mọi thứ khác vẫn chạy.
- Chỉ nhận JPEG/PNG/WebP, kiểm tra bằng **magic bytes** (file đổi tên thành `.jpg` vẫn bị từ chối: 400
  `INVALID_IMAGE`), tối đa 5MB (400 `IMAGE_TOO_LARGE`), tối đa 5 ảnh/sản phẩm (409 `TOO_MANY_IMAGES`, đếm dưới khoá
  dòng sản phẩm).
- Lưu `public_id` + URL. Ảnh đầu tiên là ảnh chính; có thể đổi ảnh chính, xoá ảnh (ảnh kế tiếp tự lên làm chính, file
  trên Cloudinary bị xoá sau khi commit).
- Cửa hàng dùng URL biến đổi `f_auto,q_auto,c_fill,w_…,h_…` theo kích thước hiển thị, `loading="lazy"`, `alt` = tên
  sản phẩm; thiếu ảnh hoặc ảnh lỗi thì hiện hình minh hoạ emoji theo danh mục.

## Tổng quan

Đơn hôm nay (giờ VN), số đơn chờ xác nhận, doanh thu 7 ngày (chỉ đơn **COMPLETED**, tính theo ngày hoàn tất), biểu
đồ theo ngày và tối đa 10 sản phẩm sắp hết.

## Giao diện trên điện thoại / tablet

- < 768px: danh sách đơn, sản phẩm, tồn kho, người dùng hiển thị dạng **thẻ** (bấm cả thẻ để mở); thao tác của từng
  dòng nằm trong menu **⋯**. Bộ lọc đơn hàng (tìm kiếm + khoảng ngày) nằm trong nút **Bộ lọc (n)** mở từ dưới lên.
- 768–1279px: bảng gọn (đơn hàng bỏ cột SL, ngày dạng "14/10 01:26").
- ≥ 1280px: bảng đầy đủ.
- Ngày giờ thống nhất dạng **14/10/2026 01:26** (giờ Việt Nam). Ô chọn ngày nhập/hiện **dd/MM/yyyy**, có lịch (tuần
  bắt đầu Thứ Hai) và chọn nhanh Hôm nay / 7 ngày qua / Tháng này.

## Nhật ký thao tác (ADMIN) — `/admin/nhat-ky`

Mọi thay đổi ghi vào `audit_logs (actor_id, action, entity_type, entity_id, before jsonb, after jsonb, created_at)`
trong cùng transaction: thay đổi đơn hàng, `ORDER_NOTE_ADDED`, `ORDER_CONTACT_FAILED`, `STOCK_IMPORTED`,
`STOCK_ADJUSTED`, `PRODUCT_*`, `PROMOTION_*`, `CATEGORY_*`, `PHONE_FLAG_CREATED/UPDATED/REMOVED`, `USER_PROMOTED`,
`USER_INVITED`, `USER_ROLE_CHANGED`, `USER_LOCKED/UNLOCKED`, `USER_EMAIL_VERIFIED`.

Trang Nhật ký lọc theo người thao tác, loại đối tượng và khoảng ngày; mỗi dòng mở được phần "trước / sau".
API: `GET /api/admin/audit-logs?actor=&entityType=&from=&to=&page=`, `GET /api/admin/audit-logs/actors`.

## Biến môi trường mới

| Biến | Bắt buộc | Ghi chú |
|---|---|---|
| `ADMIN_EMAIL` | không | Email tài khoản đã đăng ký cần nâng lên ADMIN khi khởi động |
| `CLOUDINARY_URL` | không | Bật upload ảnh sản phẩm |

## Kiểm thử

- Backend `AdminE2ETest`: 401/403 theo vai trò, STAFF sửa giá → 403, chuyển trạng thái sai → 409, 4 lần bấm "giao"
  đồng thời chỉ trừ kho một lần, huỷ bắt buộc lý do + trả kho + email, bất biến sổ kho sau nhập/bán/huỷ/kiểm kê/hoàn
  hàng, tồn công khai không lộ số chính xác, slug, danh mục, ảnh, ADMIN_EMAIL.
- `AdminUsersE2ETest`: STAFF bị chặn khỏi API người dùng/nhật ký; không tự khoá/đổi vai trò mình, không đổi vai trò
  ADMIN; khoá → 401 ngay và mất phiên (cả access token cũ); mật khẩu yếu của STAFF phải đổi trước khi dùng trang quản
  trị; link mời dùng một lần và hết hạn sau 48 giờ; STAFF chỉ đánh dấu WATCH, BLOCK_COD chặn đặt đơn; xác nhận "chưa
  liên hệ được" giữ PENDING; khách không nhận hàng → RETURN chỉ một lần dù bấm hai lần.
- Frontend: `admin/MoneyInput.test.tsx`, `admin/DateField.test.tsx`, `admin/OrderDetailPage.test.tsx` (huỷ cần nhóm lý
  do + lý do, đơn đang giao chỉ có "Khách không nhận hàng", xác nhận với kết quả liên hệ),
  `admin/ProductFormPage.test.tsx` (hộp xác nhận đổi giá > 50%), `lib/orderStatus.test.ts` (không còn chữ
  "Hoàn thành" trong mã nguồn), `admin/productSchema.test.ts`, `lib/images.test.ts`.
