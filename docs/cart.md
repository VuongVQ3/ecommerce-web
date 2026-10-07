# Giỏ hàng

Backend: package `com.nutshop.cart`. Frontend: `src/cart/`.

## Nguyên tắc

- **Giỏ hàng chỉ lưu `productId` và `quantity`.** Giá, tên, ảnh và tồn kho **luôn đọc từ bảng `products`**. Mọi giá hoặc tổng tiền client gửi lên đều bị bỏ qua (backend tự bỏ trường JSON lạ).
- **Thêm vào giỏ không giữ hàng:** `reserved` không đổi. Hàng chỉ được giữ khi tạo đơn (chưa làm).
- **Số lượng có thể mua** = `on_hand - reserved`, giới hạn thêm bởi `cart.max-qty-per-item` (mặc định 10).
- **Tiền** là `long`, đơn vị đồng. Không dùng số thực.
- **Khách chưa đăng nhập:** giỏ nằm trong localStorage, giá lấy qua `POST /api/cart/validate`. **Đã đăng nhập:** giỏ nằm trong database (`carts`, `cart_items`).

## Endpoint (`/api/cart`)

Mọi endpoint cần đăng nhập, trừ `POST /validate`. Các request `POST/PATCH/DELETE` cần header `X-Requested-With` (xem [auth.md](auth.md#chống-csrf)).

| Method | Path | Body | Trả về |
|---|---|---|---|
| GET | `/` | | `CartView` |
| POST | `/items` | `{ productId, quantity (1–99) }` | `{ cart, warning }`: cộng dồn số lượng. Vượt tồn kho hoặc vượt mức tối đa thì đặt về mức tối đa và trả kèm `warning` |
| PATCH | `/items/{productId}` | `{ quantity (0–99) }` | `{ cart, warning }`: đặt số lượng; `0` nghĩa là xoá |
| DELETE | `/items/{productId}` | | `CartView` |
| DELETE | `/` | | `CartView` (rỗng) |
| POST | `/merge` | `{ mergeKey, items: [{ productId, quantity }] }` (tối đa 50 dòng) | `{ cart, skipped: [{ productId, code, message }], alreadyMerged }` |
| POST | `/validate` *(public)* | `{ items: [{ productId, quantity }] }` (tối đa 50 dòng) | `CartView` (không có `priceAtAdd`) |

### `CartView`

```jsonc
{
  "items": [{
    "productId": 2, "name": "Nhân óc chó vàng", "slug": "nhan-oc-cho-vang", "imageUrl": null,
    "categorySlug": "hat-dinh-duong", "weightGrams": 500,
    "price": 249000,          // giá hiện tại
    "priceAtAdd": 239000,     // giá lúc thêm vào giỏ (null với giỏ của khách)
    "quantity": 2,            // số lượng được tính tiền (có thể đã bị giảm)
    "requestedQuantity": 2,   // số lượng đang lưu trong giỏ
    "maxPurchasable": 10,     // min(on_hand - reserved, max-qty-per-item)
    "lineTotal": 498000,      // 0 nếu không mua được
    "status": "PRICE_CHANGED"
  }],
  "totalQuantity": 2, "subtotal": 498000, "shippingFee": 30000, "amountToFreeShipping": 2000,
  "freeShippingThreshold": 500000, "total": 528000, "canCheckout": true
}
```

### `status` của từng dòng (ưu tiên từ trên xuống)

| Status | Khi nào | Có tính vào tổng không | Có chặn thanh toán không |
|---|---|---|---|
| `UNAVAILABLE` | Sản phẩm ngừng kinh doanh (`active = false`) hoặc đã bị xoá | Không | **Có** |
| `OUT_OF_STOCK` | `on_hand - reserved = 0` | Không | **Có** |
| `QTY_REDUCED` | Số lượng trong giỏ lớn hơn `maxPurchasable`. Tiền tính theo `maxPurchasable` | Có | Không |
| `PRICE_CHANGED` | `price ≠ priceAtAdd`. Tiền tính theo giá mới | Có | Không |
| `OK` | | Có | Không |

### Phí giao hàng

- Giỏ trống hoặc `subtotal ≥ cart.free-shipping-threshold`: `shippingFee = 0` và `amountToFreeShipping = 0`.
- Ngược lại: `shippingFee = cart.shipping-fee` và `amountToFreeShipping = threshold - subtotal`.
- `total = subtotal + shippingFee`.

### Lỗi

Lỗi trả về theo chuẩn RFC 9457, có `code` và `message` (tiếng Việt, giống `detail`).

| `code` | HTTP | Khi nào |
|---|---|---|
| `PRODUCT_NOT_FOUND` | 404 | `productId` không tồn tại |
| `PRODUCT_UNAVAILABLE` | 409 | Sản phẩm ngừng kinh doanh |
| `OUT_OF_STOCK` | 409 | Sản phẩm hết hàng |
| (validate) | 400 | Số lượng sai, thiếu `productId`, quá 50 dòng; chi tiết từng trường nằm trong `errors` |

`warning.code = QTY_LIMITED`, `message = "Chỉ còn N sản phẩm"`, `limitedTo = N`: không phải lỗi, request vẫn thành công.

## Xử lý đồng thời và tính idempotent

- **Thêm cùng một sản phẩm từ hai request song song:** `INSERT … ON CONFLICT (cart_id, product_id) DO UPDATE SET quantity = LEAST(cart_items.quantity + EXCLUDED.quantity, cap)`, chạy nguyên khối trong PostgreSQL. Không bao giờ sinh dòng trùng và không mất số lượng (có test 8 request song song). Giỏ được tạo bằng `ON CONFLICT (user_id) DO NOTHING`.
- **Merge:** bảng `cart_merges (cart_id, merge_key UNIQUE)`. Gọi lại với cùng `mergeKey` thì không cộng thêm và trả `alreadyMerged = true`. Frontend sinh `mergeKey` mới mỗi khi giỏ của khách thay đổi.
- **Database chặn cứng `quantity BETWEEN 1 AND 99`:** giới hạn nghiệp vụ (`max-qty-per-item`) nằm ở cấu hình nên đổi được mà không cần migration.
- **Không có N+1:** làm giàu giỏ hàng chỉ dùng một query `findByIdIn` (kèm `category`).

## Cấu hình (`application.properties`)

| Khoá | Mặc định | |
|---|---|---|
| `cart.max-qty-per-item` | `10` | 1–99 |
| `cart.free-shipping-threshold` | `500000` | đồng |
| `cart.shipping-fee` | `30000` | đồng |
| `app.rate-limit.cart-validate.max-requests` / `.window` | `60` / `PT1M` | Giới hạn theo IP cho `POST /validate` |

## Database

- **V7:** `products.stock` → `on_hand`; thêm `reserved` (mặc định 0, `0 ≤ reserved ≤ on_hand`) và `active` (mặc định `true`). Danh sách sản phẩm ẩn sản phẩm ngừng kinh doanh; trang chi tiết vẫn mở được và hiện "Ngừng kinh doanh".
- **V8:** `carts` (một giỏ cho mỗi user), `cart_items` (có `price_at_add`, chỉ dùng để báo giá đã đổi), `cart_merges`.

## Frontend

| File | Vai trò |
|---|---|
| `cart/CartContext.tsx` | `useCart()`: `{ view, lines, count, mode, addItem, setQuantity, removeItem, clear, openDrawer… }`. Bên trong là Context + useReducer; nơi gọi không cần biết người dùng là khách hay đã đăng nhập |
| `cart/cartStorage.ts` | Đọc/ghi localStorage (luôn bọc try/catch), chỉ lưu `{ mergeKey, items: [{productId, quantity}] }`, đồng bộ giữa các tab qua sự kiện `storage` |
| `cart/AddToCartButton.tsx` | Badge tăng ngay (cập nhật lạc quan), có hoàn tác nếu server báo lỗi; chống bấm trùng; "Hết hàng" thì nút bị khoá, ngừng kinh doanh thì ẩn nút; toast "Đã thêm …" kèm nút "Xem giỏ hàng" hoặc "Chỉ còn N sản phẩm" |
| `cart/QuantityStepper.tsx` | Nút −/+ và ô nhập số, giới hạn theo `maxPurchasable`, có `aria-label` theo tên sản phẩm |
| `cart/CartDrawer.tsx` | Dialog: giữ focus bên trong, Esc hoặc bấm nền để đóng, trả focus về nút giỏ hàng |
| `cart/CartContents.tsx` | Các dòng (cảnh báo theo status, giá cũ gạch ngang, nút Xoá kèm "Hoàn tác") và phần tóm tắt (tạm tính, phí ship, "Mua thêm X₫…", tổng, nút Thanh toán bị khoá kèm lý do) |
| `pages/CartPage.tsx` | `/gio-hang` |

**Sau khi đăng nhập:** `CartProvider` gọi `/merge` với giỏ trong localStorage. Thành công thì xoá localStorage; thất bại thì giữ nguyên và thử lại ở lần tải trang sau.

**Nút "Thanh toán"** hiện chỉ báo "đang phát triển", vì chưa làm checkout.

## Kiểm thử

- **Backend:** `CartE2ETest` (Testcontainers) gồm giới hạn theo tồn kho và theo mức tối đa, các mã lỗi, 8 request song song, `PRICE_CHANGED`, giá do client gửi bị bỏ qua, `QTY_REDUCED` / `OUT_OF_STOCK` / `UNAVAILABLE`, phí ship, PATCH/DELETE, merge (cộng dồn, giới hạn, bỏ qua sản phẩm lỗi, idempotent), `/validate` (public, gộp dòng trùng, tối đa 50 dòng), endpoint cần đăng nhập, danh sách ẩn sản phẩm ngừng bán.
- **Frontend:** `cart/CartContext.test.tsx` (Vitest + React Testing Library) gồm chế độ khách (localStorage không có giá, giới hạn số lượng, đồng bộ giữa các tab), chế độ đã đăng nhập (dùng server, hoàn tác badge khi lỗi), và khách thêm 2 sản phẩm rồi đăng nhập thì gộp đủ và xoá localStorage; gộp thất bại thì giữ nguyên.

## Chưa làm

- Checkout, tạo đơn, giữ hàng (reserve), mã giảm giá.
- Giỏ hàng của khách không được lưu trên server: đổi trình duyệt hoặc thiết bị thì mất.
- Không gộp giỏ giữa các thiết bị đã đăng nhập (giỏ trong database đã dùng chung theo tài khoản).
- Dòng `UNAVAILABLE` / `OUT_OF_STOCK` không tự bị xoá; người dùng tự xoá.
