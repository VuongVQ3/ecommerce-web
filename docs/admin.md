# Trang quản trị (back office)

Khu vực `/admin` dành cho nhân viên (STAFF) và quản trị viên (ADMIN). Giao diện có sidebar từ cỡ tablet trở lên,
thanh tab cuộn ngang trên điện thoại. Mã nguồn: `frontend/src/admin/*`, `backend/src/main/java/com/nutshop/admin/*`,
`order/AdminOrderService`, `product/AdminProductService`.

## Phân quyền

| Chức năng | STAFF | ADMIN |
|---|---|---|
| Tổng quan, đơn hàng (xem, xác nhận, giao, hoàn tất, huỷ, ghi chú) | ✅ | ✅ |
| Tồn kho (xem, nhập hàng, kiểm kê, lịch sử) | ✅ | ✅ |
| Xem danh mục | ✅ | ✅ |
| Sản phẩm, giá, ảnh, ẩn/hiện; thêm/đổi tên danh mục | ❌ (403) | ✅ |

- Mọi đường dẫn `/api/admin/**` yêu cầu STAFF hoặc ADMIN ngay ở tầng filter (SecurityConfig), và từng controller
  còn gắn `@Roles` (`AdminController`: STAFF+ADMIN, `AdminCatalogController`: ADMIN). Khách thường → 403, chưa đăng
  nhập → 401.
- Vai trò nằm trong access token: đổi vai trò có hiệu lực sau lần làm mới token kế tiếp (≤ 15 phút) hoặc đăng nhập lại.

## Tạo ADMIN đầu tiên

Không có mật khẩu nào nằm trong code hay cấu hình:

1. Đăng ký tài khoản bình thường trên web bằng email của bạn.
2. Đặt biến môi trường `ADMIN_EMAIL=<email đó>` (local: `backend/.env`; Render: Environment → Add) rồi khởi động lại.
3. Khi khởi động, `AdminBootstrap` nâng tài khoản đó lên ADMIN (ghi `USER_PROMOTED` vào audit log). Nếu email chưa
   đăng ký, chỉ ghi cảnh báo vào log, không tạo tài khoản.

Nâng một nhân viên lên STAFF hiện làm bằng SQL: `UPDATE users SET role = 'STAFF' WHERE email = '...';`

## Đơn hàng

`GET /api/admin/orders?status=&from=YYYY-MM-DD&to=YYYY-MM-DD&q=&page=` — lọc theo trạng thái, khoảng ngày (giờ Việt
Nam), tìm theo mã đơn (tiền tố) hoặc số điện thoại (mọi kiểu viết: `0912…`, `+84 912…`). Trả kèm `pendingCount`.

| Hành động | Endpoint | Chuyển trạng thái | Kho |
|---|---|---|---|
| Xác nhận | `POST /orders/{code}/confirm` | PENDING → CONFIRMED | — |
| Giao vận chuyển | `POST /orders/{code}/ship` `{carrier, trackingNumber}` | CONFIRMED → SHIPPING | trừ `on_hand` và `reserved` |
| Giao thành công | `POST /orders/{code}/complete` | SHIPPING → COMPLETED | — |
| Huỷ | `POST /orders/{code}/cancel` `{reason}` (bắt buộc) | PENDING/CONFIRMED → CANCELLED | trả `reserved` |
| Ghi chú nội bộ | `POST /orders/{code}/notes` `{body}` | — | — |

- Chuyển sai trạng thái → **409 `INVALID_STATUS_TRANSITION`**. Trang chi tiết chỉ hiện các nút hợp lệ
  (`allowedActions`).
- Mỗi hành động **khoá dòng đơn hàng** (`SELECT … FOR UPDATE`) trước khi đọc trạng thái, trong cùng transaction với
  việc trừ kho: bấm đúp hay hai nhân viên cùng bấm thì chỉ một lần thành công, lần sau nhận 409; kho chỉ bị trừ một lần.
- Email cho khách (nếu đơn có email) khi **SHIPPING** (kèm đơn vị và mã vận đơn) và **CANCELLED** (kèm lý do), gửi sau
  khi commit.

## Tồn kho

- `on_hand`: hàng thực có trong kho. `reserved`: đang giữ cho đơn chưa giao. `available = on_hand − reserved`.
- Dòng có `available ≤ low_stock_threshold` (mặc định 10, chỉnh theo từng sản phẩm) được tô vàng; lọc bằng `?low=true`.
- **Nhập hàng** `POST /inventory/{id}/import` `{quantity, unitCost?, supplier?, note?}` → movement `IMPORT`.
- **Kiểm kê** `POST /inventory/{id}/stocktake` `{counted, reason}` → movement `ADJUST` bằng phần chênh lệch (không
  chênh thì không ghi). Không cho đếm thấp hơn số đang giữ cho đơn (409 `COUNT_BELOW_RESERVED`).
- **Lịch sử** `GET /inventory/{id}/movements` — kèm mã đơn, người thao tác, nhà cung cấp, giá nhập.

Bất biến (được kiểm tra trong `AdminE2ETest`):

```
on_hand  = Σ quantity của IMPORT, ADJUST, ORDER_SHIP
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
- **Slug**: để trống thì tự tạo từ tên (bỏ dấu, `đ → d`), trùng thì thêm `-2`, `-3`…; tự nhập thì phải đúng dạng
  `chu-thuong-khong-dau` (400 `INVALID_SLUG`) và chưa ai dùng (409 `SLUG_EXISTS`).
- **Không xoá cứng**: chỉ Ẩn/Hiện (`PATCH /products/{id}/active`), có hộp xác nhận. Sản phẩm ẩn biến mất khỏi danh
  sách/tìm kiếm và không mua được; đơn cũ không bị ảnh hưởng.
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

## Audit log

Mọi thay đổi ghi vào `audit_logs (actor_id, action, entity_type, entity_id, before jsonb, after jsonb, created_at)`
trong cùng transaction: `ORDER_CONFIRM/SHIP/COMPLETE/CANCEL`, `ORDER_NOTE_ADDED`, `STOCK_IMPORTED`, `STOCK_ADJUSTED`,
`PRODUCT_CREATED/UPDATED/HIDDEN/SHOWN`, `PRODUCT_IMAGE_ADDED/DELETED/PRIMARY`, `CATEGORY_CREATED/UPDATED`,
`USER_PROMOTED`. Chưa có màn hình xem; truy vấn bằng SQL, ví dụ:

```sql
SELECT created_at, action, entity_id, before, after FROM audit_logs ORDER BY created_at DESC LIMIT 50;
```

## Biến môi trường mới

| Biến | Bắt buộc | Ghi chú |
|---|---|---|
| `ADMIN_EMAIL` | không | Email tài khoản đã đăng ký cần nâng lên ADMIN khi khởi động |
| `CLOUDINARY_URL` | không | Bật upload ảnh sản phẩm |

## Kiểm thử

- Backend `AdminE2ETest`: 401/403 theo vai trò, STAFF sửa giá → 403, chuyển trạng thái sai → 409, 4 lần bấm "giao"
  đồng thời chỉ trừ kho một lần, huỷ bắt buộc lý do + trả kho + email, bất biến sổ kho sau nhập/bán/huỷ/kiểm kê, tồn
  công khai không lộ số chính xác, slug, danh mục, ảnh (file giả, >5MB, >5 ảnh, ảnh chính), ADMIN_EMAIL.
  `MediaTest` (magic bytes, chữ ký Cloudinary theo ví dụ trong tài liệu), `SlugsTest`.
- Frontend: `lib/images.test.ts`, `admin/productSchema.test.ts`, `admin/OrderDetailPage.test.tsx` (huỷ cần lý do).
