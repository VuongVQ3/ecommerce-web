# Đơn hàng (thanh toán khi nhận hàng, COD)

Backend: `com.nutshop.order`, `com.nutshop.inventory`, `com.nutshop.address`. Frontend: `pages/CheckoutPage.tsx`, `pages/OrderPages.tsx`, `components/OrderDetails.tsx`.

## Luồng đặt hàng

1. Khách (đã đăng nhập hoặc chưa) mở `/thanh-toan` từ giỏ hàng. Trang tạo **một `idempotencyKey`** cho mỗi lần vào trang.
2. Khi gửi `POST /api/orders`, server chạy toàn bộ trong **một transaction**:
   - **Lấy giá từ bảng `products`**, bỏ qua mọi giá client gửi lên. Phí ship tính bằng `CartProperties.shippingFeeFor()`, dùng chung với giỏ hàng.
   - Chuyển mã tỉnh/phường thành tên chuẩn qua `vn-admin-units.json`. Phường không thuộc tỉnh đã chọn thì trả `400 INVALID_ADDRESS`.
   - **Giữ hàng** cho từng sản phẩm theo thứ tự id: `UPDATE products SET reserved = reserved + q WHERE id = ? AND active AND on_hand - reserved >= q`. Chỉ cần một dòng không cập nhật được là **rollback toàn bộ** và trả `409 OUT_OF_STOCK` kèm `items: [{productId, name, requested, available}]`.
   - Ghi `order_items` (bản chụp tên, giá, khối lượng), `order_status_history` (null → PENDING) và `inventory_movements` (`ORDER_RESERVE`).
   - Người đã đăng nhập: gắn `user_id` và **xoá giỏ hàng trong database**.
3. Sau khi commit: nếu có email, gửi email xác nhận ở luồng nền. Gửi mail lỗi **không** làm hỏng đơn.
4. Frontend xoá giỏ trong localStorage và chuyển tới `/dat-hang-thanh-cong/{code}`.

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
| `COMPLETED` | Hoàn thành | |
| `CANCELLED` | Đã huỷ | `reserved -= q` (`ORDER_CANCEL`) |

Chỉ `OrderService.transition()` được đổi trạng thái: hàm này chặn các bước không hợp lệ (`409 INVALID_STATUS_TRANSITION`), áp dụng tác động tồn kho và ghi lịch sử. **Khách chỉ tự huỷ được khi đơn còn `PENDING`.** Các bước khác dành cho trang admin (làm sau).

## Endpoint (`/api/orders`)

| Method | Path | Ai dùng | Ghi chú |
|---|---|---|---|
| POST | `/` | Mọi người | `{ items: [{productId, quantity}], customerName, phone, email?, provinceCode, wardCode, addressLine, note?, idempotencyKey }`. Trả `201` với đơn mới, hoặc `200` khi gửi lại cùng key. Giới hạn **5 lần/10 phút/IP** |
| GET | `/me?page=&size=` | Đã đăng nhập | Danh sách đơn của tôi, mới nhất trước |
| GET | `/me/{code}` | Đã đăng nhập | Chi tiết đơn; đơn của người khác trả `404` |
| POST | `/me/{code}/cancel` | Đã đăng nhập | Chỉ khi `PENDING`, ngược lại trả `409 ORDER_NOT_CANCELLABLE` |
| GET | `/lookup?code=&phone=` | Khách vãng lai | Phải khớp cả mã đơn lẫn số điện thoại (nhận được cả dạng `+84`). Sai bất kỳ phần nào cũng trả **cùng một** `404 ORDER_NOT_FOUND`. Giới hạn 10 lần/10 phút/IP |

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

## Database (V9)

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

## Hạn chế và việc chưa làm

- **Đơn của khách vãng lai giữ hàng cho tới khi bị huỷ, mà hiện chỉ admin (chưa làm) mới huỷ được đơn của khách.** Nếu bị đặt đơn giả hàng loạt, tồn kho có thể bị chiếm. Đã có rate limit 5 đơn/10 phút/IP. Bạn đã chọn không dùng Turnstile cho bước này; nên cân nhắc tự huỷ đơn `PENDING` quá hạn khi làm trang admin.
- **Chưa có `RESEND_API_KEY`:** email xác nhận (kèm tên, số điện thoại, địa chỉ của khách) chỉ được **ghi vào log** của server.
- **Kết quả tra cứu đơn hiện đầy đủ địa chỉ** cho người biết mã đơn và số điện thoại.
- **Chưa làm:** thanh toán online, mã giảm giá, trang admin xử lý đơn.
