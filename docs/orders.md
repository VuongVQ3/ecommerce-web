# Đơn hàng (thanh toán khi nhận hàng, COD)

Backend: `com.nutshop.order`, `com.nutshop.inventory`, `com.nutshop.address`. Frontend: `pages/CheckoutPage.tsx`, `pages/OrderPages.tsx`, `pages/TrackOrderPage.tsx`, `components/OrderDetails.tsx`, `lib/recentOrders.ts`.

## Luồng đặt hàng

1. Khách (đã đăng nhập hoặc chưa) mở `/thanh-toan` từ giỏ hàng. Trang tạo **một `idempotencyKey`** cho mỗi lần vào trang.
2. Khi gửi `POST /api/orders`, server chạy toàn bộ trong **một transaction**:
   - **Lấy giá từ bảng `products`**, bỏ qua mọi giá client gửi lên. Phí ship tính bằng `CartProperties.shippingFeeFor()`, dùng chung với giỏ hàng.
   - Chuyển mã tỉnh/phường thành tên chuẩn qua `vn-admin-units.json`. Phường không thuộc tỉnh đã chọn thì trả `400 INVALID_ADDRESS`.
   - **Giữ hàng** cho từng sản phẩm theo thứ tự id: `UPDATE products SET reserved = reserved + q WHERE id = ? AND active AND on_hand - reserved >= q`. Chỉ cần một dòng không cập nhật được là **rollback toàn bộ** và trả `409 OUT_OF_STOCK` kèm `items: [{productId, name, requested, available}]`.
   - Ghi `order_items` (bản chụp tên, giá, khối lượng), `order_status_history` (null → PENDING) và `inventory_movements` (`ORDER_RESERVE`).
   - Người đã đăng nhập: gắn `user_id` và **xoá giỏ hàng trong database**.
3. Sau khi commit: nếu có email, gửi email xác nhận ở luồng nền. Gửi mail lỗi **không** làm hỏng đơn.
4. Frontend xoá giỏ trong localStorage rồi chuyển hướng:
   - **Khách vãng lai** → link theo dõi `/don-hang/{code}?t={token}` (có banner "Đặt hàng thành công"; reload vẫn đủ thông tin vì trang luôn lấy dữ liệu từ server). Đơn được lưu vào "Đơn hàng gần đây" của trình duyệt.
   - **Người đã đăng nhập** → `/tai-khoan/don-hang/{code}` (có banner).
   - Trang cũ `/dat-hang-thanh-cong/{code}` chỉ còn chuyển hướng: người đăng nhập tới `/tai-khoan/don-hang/{code}`, khách tới `/tra-cuu-don-hang?code={code}`.

**Mã đơn:** `HL` + `yyMMdd` (giờ Việt Nam) + 4 ký tự ngẫu nhiên, không dùng các ký tự dễ nhầm 0/O, 1/I/L. Ví dụ `HL261013K7QX`.

**Chống gửi trùng:** cột `orders.idempotency_key` có ràng buộc UNIQUE. Gửi lại cùng key (kể cả nhiều request song song) đều nhận về **đúng đơn đã tạo**, mã `200` thay vì `201`. Cùng key nhưng khác số điện thoại thì trả `409 IDEMPOTENCY_CONFLICT`, để không bao giờ trả đơn của người khác.

## Trạng thái

```
PENDING ──► CONFIRMED ──► SHIPPING ──► COMPLETED
   │            │
   └────────────┴──► CANCELLED
```

| Trạng thái | Nhãn | Tác động tồn kho |
|---|---|---|
| `PENDING` | Chờ xác nhận | `reserved += q` lúc đặt hàng |
| `CONFIRMED` | Đã xác nhận | |
| `SHIPPING` | Đang giao | `on_hand -= q`, `reserved -= q` (`ORDER_SHIP`) |
| `COMPLETED` | Hoàn tất | |
| `CANCELLED` | Đã huỷ | `reserved -= q` (`ORDER_CANCEL`) |

Email cho khách (nếu đơn có email): xác nhận đơn, **Đang giao** (kèm mã vận đơn), **Hoàn tất**, **Đã huỷ** (kèm lý do). Mỗi email có nút "Theo dõi đơn hàng" (đơn vãng lai) hoặc "Xem đơn hàng" (đơn có tài khoản).

Chỉ `OrderService.transition()` được đổi trạng thái: hàm này chặn các bước không hợp lệ (`409 INVALID_STATUS_TRANSITION`), áp dụng tác động tồn kho và ghi lịch sử. **Khách chỉ tự huỷ được khi đơn còn `PENDING`.** Các bước khác dành cho trang admin (làm sau).

## Endpoint (`/api/orders`)

| Method | Path | Ai dùng | Ghi chú |
|---|---|---|---|
| POST | `/` | Mọi người | `{ items: [{productId, quantity}], customerName, phone, email?, provinceCode, wardCode, addressLine, note?, idempotencyKey }`. Trả `201` với đơn mới, hoặc `200` khi gửi lại cùng key. Giới hạn **5 lần/10 phút/IP** |
| GET | `/me?page=&size=` | Đã đăng nhập | Danh sách đơn của tôi, mới nhất trước |
| GET | `/me/{code}` | Đã đăng nhập | Chi tiết đơn; đơn của người khác trả `404` |
| POST | `/me/{code}/cancel` | Đã đăng nhập | Chỉ khi `PENDING`, ngược lại trả `409 ORDER_NOT_CANCELLABLE` |
| GET | `/lookup?code=&phone=` | Khách vãng lai | Phải khớp cả mã đơn lẫn số điện thoại (nhận được cả dạng `+84`). Sai bất kỳ phần nào cũng trả **cùng một** `404 ORDER_NOT_FOUND`. Giới hạn 10 lần/10 phút/IP |
| GET | `/track/{code}?t=` | Khách vãng lai (có link) | Xem đơn qua link theo dõi. Số điện thoại và email bị che bớt, địa chỉ đầy đủ; kèm `canCancel`, `canClaim`. Giới hạn **30 lần/phút/IP** (chung với huỷ) |
| POST | `/track/{code}/cancel?t=` | Khách vãng lai (có link) | `{reason}` bắt buộc; chỉ khi `PENDING`, trả lại `reserved` như huỷ thường |
| POST | `/track/{code}/claim-account?t=` | Khách vãng lai (có link) | `{password, acceptTerms: true, marketingConsent?, email?}` → tạo tài khoản, gắn đơn, đăng nhập luôn (cookie). Giới hạn **5 lần/15 phút/IP** |
| POST | `/claim` | Đã đăng nhập | `[{code, token}]` (tối đa 20) → `{claimed, skipped}`. Giới hạn 10 lần/phút/IP |

## Link theo dõi đơn của khách vãng lai

- Khi tạo đơn **không** gắn tài khoản, server sinh token ngẫu nhiên 32 byte (base64url), chỉ lưu **SHA-256** trong bảng `order_access_tokens`, hạn **180 ngày**. Token gốc chỉ xuất hiện **một lần** trong response đặt hàng (`accessToken`, `trackingUrl` = `SITE_URL/don-hang/{code}?t={token}`) và trong các link gửi qua email. Đơn của người đã đăng nhập không có token.
- So khớp token theo thời gian hằng định (`MessageDigest.isEqual`, so hết mọi token của đơn). Token sai, hết hạn, mã đơn không tồn tại hoặc đơn đã gắn tài khoản đều trả **cùng một** `404 ORDER_NOT_FOUND`.
- **Một đơn có thể có nhiều link hợp lệ cùng lúc** (khác spec gốc, đã thống nhất): mỗi email đổi trạng thái (đang giao, hoàn tất, huỷ) mang một token mới, nhưng các link cũ **vẫn dùng được** tới khi hết hạn, nên link khách đã lưu và "Đơn hàng gần đây" không bị hỏng khi đơn đổi trạng thái. Email xác nhận dùng chung link với response đặt hàng.
- Gửi lặp cùng `idempotencyKey`: server trả lại đúng đơn cũ kèm **một token mới** (token gốc không được lưu, và client gửi lại có thể chưa nhận được response đầu); token cũ vẫn hợp lệ.
- Khi đơn được gắn vào tài khoản, **mọi token của đơn bị xoá**: link theo dõi ngừng hoạt động, khách xem đơn ở "Đơn hàng của tôi".
- Trang `/don-hang/{code}` và API theo dõi trả `Cache-Control: no-store`, `Referrer-Policy: no-referrer`; trang có `noindex` và bị chặn trong `robots.txt`. Ứng dụng không ghi query string vào log (access log của Tomcat tắt). **Lưu ý:** bộ định tuyến của Render có thể ghi URL request vào log của Render; phần đó nằm ngoài ứng dụng.
- "Đơn hàng gần đây" (`localStorage` key `hatlanh_recent_orders_v1`): chỉ `{code, token, createdAt}`, tối đa 10 đơn, bỏ đơn quá 180 ngày; **không** lưu tên, số điện thoại, địa chỉ. Hiện ở trang `/tra-cuu-don-hang` (kèm trạng thái mới nhất) và mục "Đơn hàng của tôi (n)" trên header khi chưa đăng nhập.
- Trang thanh toán giữ dữ liệu khách đã nhập trong `sessionStorage` (chỉ tab hiện tại) để khi bấm "Đăng nhập" rồi quay lại không mất; xoá ngay khi đặt hàng xong.

## Gắn đơn vãng lai vào tài khoản

Mỗi cách đều cần bằng chứng sở hữu; **không bao giờ gắn theo số điện thoại** (số điện thoại chưa được xác minh):

1. **Tạo tài khoản từ trang theo dõi** (`claim-account`): token chứng minh người này vừa đặt đơn. Dùng tên, email, số điện thoại của đơn (đơn không có email thì `400 EMAIL_REQUIRED`, khách nhập thêm email). Email hoặc số điện thoại đã có tài khoản → `409 ACCOUNT_EXISTS`, không tạo gì, không gắn gì; trang hiện nút "Đăng nhập để lưu đơn". Thành công: tạo user (cùng quy tắc mật khẩu, BCrypt, `terms_accepted_at`), gắn **chỉ đơn này**, xoá token, đăng nhập luôn, gửi email xác minh.
2. **Đăng nhập/đăng ký khi trình duyệt có "Đơn hàng gần đây"**: frontend gửi `POST /api/orders/claim`; đơn có token hợp lệ và chưa thuộc ai được gắn vào người đang đăng nhập, đơn được gắn thì xoá khỏi danh sách và hiện toast "Đã lưu n đơn hàng vào tài khoản".
3. **Xác minh email**: đăng ký thường và `claim-account` đều gửi link `/xac-minh-email?token=` (hạn 24 giờ, dùng một lần, chỉ lưu hash trong `email_verification_tokens`). **Chỉ sau khi xác minh**, mọi đơn vãng lai có cùng email (không phân biệt hoa thường) và chưa gắn tài khoản mới được gắn tự động. Tài khoản Google được coi là đã xác minh. Trang Tài khoản có nút "Gửi lại email xác minh" (3 lần/15 phút/tài khoản).

Mọi lần gắn đơn đều ghi `audit_logs` (`ORDER_CLAIMED`, kèm cách gắn: `NEW_ACCOUNT`, `TRACKING_TOKEN`, `EMAIL_VERIFIED`); xác minh email ghi `USER_EMAIL_VERIFIED`.

**Quy tắc dữ liệu đầu vào:**
- Họ tên: 2–100 ký tự.
- Số điện thoại Việt Nam: chuẩn hoá dạng `+84`/`84`, dấu cách, dấu chấm về `0xxxxxxxxx`.
- Email: không bắt buộc.
- Địa chỉ chi tiết: bắt buộc, tối đa 255 ký tự. Ghi chú: tối đa 500 ký tự.
- Số lượng: 1 tới `cart.max-qty-per-item` (vượt thì trả `400 QUANTITY_TOO_LARGE`) và không vượt tồn kho (vượt thì trả `409 OUT_OF_STOCK`).

## Địa chỉ: 2 cấp (từ 01/07/2025)

Việt Nam đã bỏ cấp quận/huyện, nên địa chỉ gồm **34 tỉnh/thành → 3.321 phường/xã**. Dữ liệu là file tĩnh `vn-admin-units.json` (nguồn: provinces.open-api.vn v2, lấy ngày 13/10/2026), có hai bản giống hệt nhau:
- `frontend/src/data/`: chỉ tải khi vào trang thanh toán (khoảng 90 KB).
- `backend/src/main/resources/`: để kiểm tra dữ liệu. Test `AdminUnitsTest` báo lỗi nếu hai bản khác nhau.

Cột `orders.district` vẫn giữ (cho phép để trống) để dùng cho địa chỉ kiểu cũ nếu cần.

## Giá trong đơn hàng (V12)

Giá mỗi dòng lấy từ `PricingService` lúc đặt hàng (xem [pricing.md](pricing.md)): `order_items.unit_price` là giá thực
trả (giá khuyến mại nếu đang có), `order_items.regular_unit_price` là giá gốc lúc mua (đơn cũ được gán bằng
`unit_price`). API đơn hàng trả `regularUnitPrice` cho từng dòng; trang đơn hàng, trang theo dõi và email xác nhận hiện
giá gốc gạch ngang và tổng số tiền tiết kiệm.

## Database (V9, V11)

V11 thêm `order_access_tokens` (hash token theo dõi, hạn), `users.email_verified_at`, `email_verification_tokens` và index `lower(email)` cho đơn chưa gắn tài khoản.


- `orders`, `order_items` (có ràng buộc `line_total = unit_price * quantity`), `order_status_history`.
- `inventory_movements`: `quantity` có dấu. `ORDER_RESERVE +q`, `ORDER_CANCEL -q`, `ORDER_SHIP -q`; `IMPORT` và `ADJUST` dành cho admin.
- `total = subtotal + shipping_fee` được ràng buộc bằng `CHECK` ngay trong database.

## Kiểm thử

- `OrderE2ETest` (Testcontainers PostgreSQL):
  - Giá client gửi bị bỏ qua; **2 đơn tranh nhau sản phẩm cuối cùng thì chỉ 1 thành công**.
  - Gửi lặp cùng key (cả 4 request song song) chỉ tạo 1 đơn; dùng key của người khác thì bị chặn.
  - Thiếu hàng thì rollback toàn bộ.
  - Người đã đăng nhập: gắn tài khoản, xoá giỏ, xem danh sách và chi tiết; tài khoản khác không xem được; huỷ đơn trả lại `reserved` và có dòng `ORDER_CANCEL`; huỷ lần hai bị chặn.
  - Tra cứu sai số điện thoại trả `404` giống hệt khi sai mã đơn; dữ liệu sai bị chặn; email xác nhận được gửi; rate limit hoạt động.
- `OrderStatusTest`: kiểm tra đầy đủ ma trận chuyển trạng thái. `AdminUnitsTest`: kiểm tra 34 tỉnh, phường thuộc đúng tỉnh, hai bản dữ liệu trùng khớp.
- Frontend `CheckoutPage.test.tsx`:
  - Dropdown phường/xã phụ thuộc vào tỉnh/thành.
  - Payload chỉ có mã sản phẩm và số lượng; thử lại sau lỗi mạng vẫn dùng **cùng** `idempotencyKey`.
  - Lỗi 409 thì quay về giỏ kèm danh sách sản phẩm thiếu; người đăng nhập được điền sẵn thông tin.

- `OrderTrackingE2ETest`: token chỉ trả một lần và DB chỉ có hash; token sai, hết hạn, mã không tồn tại cùng một 404; đơn người đăng nhập không có token; gửi lặp cho token mới, cả hai đều dùng được; huỷ qua link chỉ khi `PENDING` và trả kho đúng; email đổi trạng thái mang link mới, link cũ vẫn chạy; `claim-account` tạo user và gắn đúng một đơn, email/số điện thoại đã tồn tại thì 409 và không đổi gì; đơn khác cùng email chỉ được gắn sau khi xác minh; `POST /claim` bỏ qua đơn của người khác và token sai; header `no-store`/`no-referrer`.
- Frontend: `TrackOrderPage.test.tsx` (reload vẫn đủ thông tin, banner chỉ khi vừa đặt, link hỏng hướng dẫn tra cứu, huỷ cần lý do, tạo tài khoản rồi chuyển tới `/tai-khoan/don-hang/{code}`, `ACCOUNT_EXISTS`), `recentOrders.test.ts` (tối đa 10, bỏ đơn quá hạn, không chứa thông tin cá nhân), `CheckoutPage.test.tsx` (khách được chuyển tới link theo dõi, giữ dữ liệu khi đi đăng nhập).

## Kiểm tra thủ công

1. Đăng xuất, thêm sản phẩm vào giỏ, đặt hàng COD (có email). Trang chuyển tới `/don-hang/HL…?t=…` kèm banner. Reload: banner mất, thông tin đơn vẫn đủ.
2. Bấm "Sao chép link theo dõi", mở link ở cửa sổ ẩn danh: xem được đơn. Sửa một ký tự của `t`: hiện hướng dẫn tra cứu.
3. Mở `/tra-cuu-don-hang`: thấy "Đơn hàng gần đây"; header có "Đơn hàng của tôi (1)".
4. Trên trang theo dõi, tạo tài khoản (mật khẩu có chữ và số): chuyển tới `/tai-khoan/don-hang/HL…`, đã đăng nhập; link theo dõi cũ giờ báo không mở được.
5. Trang Tài khoản báo "Email chưa được xác minh". Lấy link xác minh trong log server (khi chưa có Resend), mở link: thấy "Đã xác minh email" và số đơn được gắn thêm.
6. Đặt một đơn khác khi chưa đăng nhập, rồi đăng nhập: toast "Đã lưu 1 đơn hàng vào tài khoản".
7. Trong admin, chuyển đơn vãng lai sang Đang giao: log có email kèm link mới; link cũ vẫn mở được.

## Hạn chế và việc chưa làm

- **Đơn của khách vãng lai giữ hàng cho tới khi bị huỷ, mà hiện chỉ admin (chưa làm) mới huỷ được đơn của khách.** Nếu bị đặt đơn giả hàng loạt, tồn kho có thể bị chiếm. Đã có rate limit 5 đơn/10 phút/IP. Bạn đã chọn không dùng Turnstile cho bước này; nên cân nhắc tự huỷ đơn `PENDING` quá hạn khi làm trang admin.
- **Chưa có `RESEND_API_KEY`:** email xác nhận (kèm tên, số điện thoại, địa chỉ của khách) chỉ được **ghi vào log** của server.
- **Kết quả tra cứu đơn hiện đầy đủ địa chỉ** cho người biết mã đơn và số điện thoại; trang theo dõi qua link cũng hiện đầy đủ địa chỉ (che số điện thoại và email). Link theo dõi là bí mật: ai có link đều xem được đơn và huỷ được khi đơn còn chờ xác nhận.
- **Email xác minh và link theo dõi trong email** cũng chỉ được ghi vào log khi chưa có Resend, nên trên web thật việc tự gắn đơn sau khi xác minh email chưa hoạt động cho tới khi cấu hình Resend.
- **Chưa làm:** thanh toán online, mã giảm giá, xác minh số điện thoại bằng OTP.
