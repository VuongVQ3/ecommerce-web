# Giá và khuyến mại

Backend: `com.nutshop.product.PricingService`, `PromotionService`, `ProductPromotion`, `admin/AdminPromotionController`.
Frontend: `components/Price.tsx`, `admin/PromotionsPage.tsx`, `admin/promotionMath.ts`, `lib/pricing.ts`.

## Nguyên tắc

- **Giá gốc** là giá bán thông thường hiện tại của sản phẩm (`products.price`, sửa ở trang admin Sản phẩm). Không có ô
  "giá gốc" riêng nên không thể khai giá gốc cao hơn giá đang bán.
- **Giá khuyến mại** chỉ áp dụng trong một khoảng thời gian có ngày bắt đầu và kết thúc: từ `starts_at` (tính cả) tới
  `ends_at` (không tính). Admin chọn theo ngày lịch giờ Việt Nam ("từ ngày … đến hết ngày …").
- **Phần trăm giảm luôn tính từ giá thật**, không nhập tay: `round((giá gốc − giá KM) × 100 / giá gốc)`.
- Tiền là số nguyên đồng (`long` / `bigint`). Giá khuyến mại là bội số của 1.000₫; khi tạo theo % thì
  `floor(giá × (100 − %) / 100 / 1000) × 1000` (189.000₫ giảm 30% → 132.000₫).

## Một nơi duy nhất tính giá: `PricingService`

`price` = giá khuyến mại nếu có khuyến mại **đang chạy** (đang hoạt động, `starts_at ≤ bây giờ < ends_at`, và vẫn thấp
hơn giá gốc), ngược lại = giá gốc. Tất cả đều dùng service này:

| Nơi dùng | Ghi chú |
|---|---|
| Danh sách và chi tiết sản phẩm (`/api/products`) | Trả `price` (giá hiện hành), `regularPrice`, `discountPercent` (null nếu không giảm), `promotionEndsAt` |
| Sắp xếp `?sort=price_asc / price_desc` | Sắp theo `COALESCE(giá KM đang chạy, giá gốc)` ngay trong câu SQL (subquery), rồi theo id |
| Giỏ hàng (`/api/cart`, `/api/cart/validate`) | Mỗi dòng có `price`, `regularPrice` (null nếu không giảm); giỏ có `discountTotal` ("Đã giảm") |
| Tạo đơn | `order_items.unit_price` = giá thực trả, `regular_unit_price` = giá gốc lúc mua. Giá do client gửi lên luôn bị bỏ qua |
| Trang HTML do server render | Title, JSON-LD `offers.price` và `priceValidUntil` dùng giá hiện hành |

Khi khuyến mại bắt đầu hoặc kết thúc trong lúc sản phẩm đang nằm trong giỏ của người đã đăng nhập, dòng đó chuyển sang
`PRICE_CHANGED` (so với giá lúc thêm vào giỏ), như khi đổi giá thường.

## Quy tắc khi tạo khuyến mại (`PromotionService`)

| Quy tắc | Lỗi |
|---|---|
| Có đủ ngày bắt đầu và kết thúc; kết thúc sau bắt đầu; kết thúc sau hiện tại; bắt đầu không trước hôm nay | `400 INVALID_PERIOD` |
| Giá KM > 0, là bội số 1.000₫, thấp hơn giá gốc hiện tại | `400 INVALID_SALE_PRICE` |
| Giảm tối đa `promotion.max-discount-percent` (mặc định **50%**); thông báo nêu giá KM thấp nhất được phép | `400 DISCOUNT_TOO_LARGE` |
| Không trùng thời gian với khuyến mại khác của cùng sản phẩm (cả trong DB: ràng buộc `EXCLUDE USING gist`) | `409 PROMOTION_OVERLAP` |
| Tổng ngày khuyến mại của sản phẩm trong một năm dương lịch ≤ `promotion.max-days-per-year` (mặc định **120**) | `400 TOO_MANY_DAYS` |

**Cách đếm ngày:** mỗi ngày lịch (giờ Việt Nam) mà khuyến mại chạm tới đều tính là một ngày, kể cả khi chỉ phủ một
phần ngày. Khuyến mại vắt qua năm mới thì tính riêng phần thuộc từng năm. Khuyến mại đã huỷ trước khi bắt đầu không
tính; khuyến mại bị kết thúc sớm chỉ tính tới ngày kết thúc thực tế.

Hai giới hạn nằm trong `application.properties` (`promotion.max-discount-percent`, `promotion.max-days-per-year`).
**Hãy kiểm tra quy định khuyến mại hiện hành và thông báo với Sở Công Thương trước khi chạy chương trình**; nếu quy
định thay đổi, chỉ cần đổi hai số này.

**Đổi giá gốc khi có khuyến mại:** admin hạ giá gốc xuống bằng hoặc thấp hơn giá khuyến mại đang chạy hoặc sắp chạy
thì bị chặn (`409 PROMOTION_PRICE_CONFLICT`), phải kết thúc khuyến mại đó trước.

## Vòng đời

| Trạng thái | Điều kiện | Được làm |
|---|---|---|
| Sắp tới (`UPCOMING`) | chưa tới `starts_at` | Sửa giá và thời gian (qua đủ các kiểm tra trên), huỷ (`active = false`) |
| Đang chạy (`RUNNING`) | `starts_at ≤ bây giờ < ends_at` | Chỉ **kết thúc sớm** (`ends_at = bây giờ`), để giá không đổi dưới chân người đang có hàng trong giỏ |
| Đã kết thúc / Đã huỷ | | Chỉ xem |

Mọi thay đổi ghi `audit_logs`: `PROMOTION_CREATED`, `PROMOTION_UPDATED`, `PROMOTION_ENDED`, `PROMOTION_CANCELLED`.

## API quản trị (chỉ ADMIN)

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/admin/promotions?status=` | Danh sách (đang chạy, sắp tới, đã kết thúc, đã huỷ) kèm số ngày KM của sản phẩm trong năm |
| GET | `/api/admin/promotions/usage?year=` | Mọi sản phẩm: giá gốc, số ngày KM đã dùng trong năm, giá KM đang chạy; kèm hai giới hạn |
| POST | `/api/admin/promotions` | `{productId, salePrice, startsAt, endsAt}` |
| PUT | `/api/admin/promotions/{id}` | Sửa khuyến mại sắp tới |
| POST | `/api/admin/promotions/{id}/end` | Đang chạy: kết thúc ngay. Sắp tới: huỷ |
| POST | `/api/admin/promotions/bulk` | `{productIds, percentOff, startsAt, endsAt}`: mỗi sản phẩm kiểm tra và lưu riêng, trả kết quả thành công/lỗi theo từng sản phẩm |

Trang `/admin/khuyen-mai`: ba tab, form tạo cho một hoặc nhiều sản phẩm (nhập % hoặc giá), bảng xem trước giá mới và
số ngày KM sau khi tạo, cảnh báo khi số ngày trong năm đạt từ 80% giới hạn, nút kết thúc sớm/huỷ có hộp xác nhận, và
dòng nhắc kiểm tra quy định.

## Hiển thị

- Thẻ sản phẩm và trang chi tiết: giá KM màu đỏ, giá gốc gạch ngang (`<s>` có chữ ẩn "Giá gốc" cho trình đọc màn
  hình), nhãn "-30%" ở góc ảnh. Trang chi tiết thêm "Tiết kiệm 57.000₫ · Khuyến mại đến hết 31/10".
- Giỏ hàng, xem nhanh giỏ hàng, trang thanh toán: giá gốc gạch ngang ở từng dòng; tóm tắt có "Giá gốc" và "Đã giảm".
- Đơn hàng (trang đơn, link theo dõi, email xác nhận): giá gốc gạch ngang và "Tiết kiệm nhờ khuyến mại" /
  "Bạn đã tiết kiệm".

## Database (V12)

- `product_promotions`: `id, product_id, sale_price, starts_at, ends_at, active, created_by, created_at, updated_at`;
  CHECK `sale_price > 0`, CHECK `ends_at > starts_at`, `EXCLUDE USING gist (product_id WITH =, tstzrange(starts_at,
  ends_at) WITH &&) WHERE (active)` (cần extension `btree_gist`, đã có sẵn trên Neon).
- `order_items.regular_unit_price` (đơn cũ được gán bằng `unit_price`), CHECK `regular_unit_price >= unit_price`.

## Kiểm thử

- `PricingRulesTest`: làm tròn bội số 1.000₫ (189.000 → 132.000), % giảm, giá KM không thấp hơn thì bỏ qua, đếm ngày
  theo giờ Việt Nam (qua nửa đêm, qua năm mới).
- `PromotionE2ETest`: áp dụng đúng tại biên `starts_at` / `ends_at`; API trả giá hiện hành và sắp xếp theo nó; đơn hàng
  lưu giá KM và giá gốc, bỏ qua giá giả của client; giỏ hàng báo `PRICE_CHANGED` khi KM kết thúc; từ chối giảm > 50%,
  trùng thời gian, vượt 120 ngày/năm; tạo hàng loạt 30%; chặn hạ giá gốc ≤ giá KM; sửa/kết thúc/huỷ; chỉ ADMIN.
- Frontend: `ProductCard.test.tsx` (có/không khuyến mại), `promotionMath.test.ts`.
