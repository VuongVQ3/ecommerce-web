# Blog

Chủ shop (tài khoản **ADMIN**) viết và đăng bài trong `/admin/blog`; khách đọc ở `/blog` và `/blog/<slug>`. Mỗi bài có
meta tag, Open Graph, JSON-LD và nội dung viết sẵn trong HTML từ server, nên Google đọc được không cần chạy JavaScript,
giống trang sản phẩm.

Mã nguồn: `backend/.../blog/*`, `admin/AdminBlogController`, `site/BlogHtml`, `site/PageController` (`/blog`),
`frontend/src/pages/Blog*.tsx`, `frontend/src/admin/Blog*.tsx`, `admin/MarkdownEditor.tsx`.

## Soạn bài

1. **Quản trị → Blog → + Viết bài mới.**
2. **Tiêu đề** (tối đa 150 ký tự). **Slug** tự sinh từ tiêu đề (bỏ dấu, `đ → d`), sửa được. Trùng với bài khác thì
   server tự thêm `-2`, `-3`…
3. **Tóm tắt**: dùng làm mô tả trên Google và trên thẻ bài. Nên dài **120–155 ký tự** (ô đếm ký tự bên dưới), tối đa 300.
4. **Ảnh bìa**: bấm *Tải ảnh bìa*, chọn ảnh, nhập **mô tả ảnh (alt)** (bắt buộc). Ảnh bìa được cắt theo tỉ lệ 1200×630
   khi chia sẻ lên Facebook/Zalo, nên để chủ thể ở giữa ảnh.
5. **Nội dung**: viết bằng Markdown (xem bên dưới). Có ô **xem trước** bên cạnh (máy tính) hoặc tab *Xem trước* (điện
   thoại); phần xem trước do server dựng nên giống hệt trang thật.
6. **Sản phẩm liên quan** (tối đa 4): tìm theo tên, kéo tay nắm ⠿ (hoặc chọn tay nắm rồi bấm ↑/↓) để đổi thứ tự. Sản
   phẩm đang ẩn hoặc chưa có giá vẫn lưu được nhưng không hiện trên bài.
7. **Lưu nháp** bất cứ lúc nào. **Đăng** khi đã đủ tóm tắt, ảnh bìa và alt; thiếu thì trang báo rõ thiếu gì.

Bài mới chưa lưu mà chèn ảnh (hoặc tải ảnh bìa) thì bài được **tự lưu nháp** trước (cần có tiêu đề), vì ảnh phải thuộc
về một bài. Rời trang khi còn thay đổi chưa lưu thì trang hỏi lại.

### Đăng, gỡ, xoá

- **Đăng**: bài hiện ở `/blog`, sitemap cập nhật ngay. Ngày đăng là ngày đăng **lần đầu**; gỡ rồi đăng lại vẫn giữ ngày cũ.
- **Gỡ bài**: bài về nháp, link của bài trả về 404 thật (cả với Google). Đăng lại lúc nào cũng được.
- **Xoá**: xoá hẳn bài và mọi ảnh của bài (cả trên Cloudinary), không khôi phục được.
- **Đổi slug** của bài đã từng đăng: link cũ tự chuyển (301) sang link mới. Bài chưa đăng bao giờ thì không giữ slug cũ.

## Cú pháp Markdown hỗ trợ

| Viết | Hiện thành |
|---|---|
| `## Tiêu đề lớn` / `### Tiêu đề nhỏ` | Tiêu đề mục (dòng `#` một dấu cũng thành tiêu đề lớn: tiêu đề bài đã là H1) |
| `**đậm**`, `_nghiêng_` | **đậm**, _nghiêng_ |
| `- mục` hoặc `1. mục` | Danh sách |
| `> câu trích` | Khối trích dẫn |
| `[chữ](https://...)` hoặc `[chữ](/san-pham/mac-ca)` | Link |
| `![mô tả](https://...)` | Ảnh |
| `![mô tả](https://... "chú thích")` (ảnh đứng riêng một đoạn) | Ảnh kèm chú thích chữ nhỏ bên dưới |
| Bảng `\| A \| B \|` + dòng `\|---\|---\|` | Bảng (bảng rộng cuộn ngang trên điện thoại) |
| `---` | Đường kẻ ngang |

Thanh công cụ có sẵn: H2, H3, đậm, nghiêng, danh sách, trích dẫn, link, **chèn ảnh**.

Giới hạn an toàn (server tự xử lý, không cần nhớ):

- **Thẻ HTML** gõ trong bài được hiện nguyên văn như chữ, không chạy.
- Chỉ giữ link `https://`, `http://` và link trong web bắt đầu bằng `/`. Link khác (`javascript:`, `mailto:`…) chỉ còn
  chữ. Link sang web khác mở tab mới và có `rel="noopener nofollow"`.
- Nội dung tối đa **100.000 ký tự**.

## Quy tắc ảnh

- Chỉ nhận **JPEG, PNG, WebP**, tối đa **5MB** mỗi ảnh (kiểm tra cả nội dung file), tối đa 50 ảnh mỗi bài.
- **Chèn ảnh**: bấm nút ảnh trên thanh công cụ, **kéo thả** ảnh vào ô soạn hoặc **dán** ảnh (Ctrl+V). Ảnh được tải lên
  ngay; trong lúc đó nhập **mô tả (alt, bắt buộc)** và **chú thích** (không bắt buộc). Ảnh được chèn đúng chỗ con trỏ,
  thành một đoạn riêng.
- **Alt** là câu tả nội dung ảnh cho người khiếm thị và cho Google: "Hạt mắc ca rang bơ trong hũ thuỷ tinh", không phải
  "ảnh 1".
- Ảnh trong bài tự có `loading="lazy"`, kích thước thật (không giật trang khi tải) và nhiều cỡ (480/800/1200px, định
  dạng tự chọn AVIF/WebP). Ảnh bìa tải ưu tiên.
- Ảnh trên web khác phải là `https://`; ảnh đó không có nhiều cỡ.
- **Xoá ảnh** (khung *Ảnh đã tải lên*): không xoá được ảnh bìa (đổi ảnh bìa trước), không xoá được ảnh đang dùng trong
  bài **đã đăng** (bỏ ảnh khỏi nội dung và lưu trước). Bài nháp thì xoá được, trang cảnh báo nếu ảnh còn trong nội dung.
- Ảnh lưu ở thư mục Cloudinary `hat-lanh/blog` (đổi bằng biến `BLOG_IMAGE_FOLDER`, ví dụ `hat-lanh/blog-dev` khi thử ở
  máy).

## Lưu ý nội dung

Bài viết về thực phẩm **không được quảng cáo công dụng chữa bệnh** hay thay thế thuốc.

- Khi tiêu đề, tóm tắt hoặc nội dung có các từ như "chữa", "trị bệnh", "đặc trị", "giảm cân cấp tốc", "thay thế thuốc",
  trang soạn hiện **cảnh báo vàng** (không chặn lưu hay đăng). Hãy viết lại, ví dụ "hỗ trợ bữa ăn cân bằng" thay vì
  "chữa mất ngủ".
- Cuối **mọi** bài luôn có khung lưu ý cố định: "Thông tin trong bài chỉ mang tính tham khảo, không thay thế tư vấn của
  bác sĩ hay chuyên gia dinh dưỡng. Sản phẩm không phải là thuốc. Người dị ứng với các loại hạt cần cân nhắc trước khi
  dùng."
- Số liệu dinh dưỡng nên khớp với bảng dinh dưỡng của sản phẩm; nêu nguồn khi trích nghiên cứu.

## Trang của khách

- `/blog`: lưới thẻ bài (ảnh bìa, tiêu đề, tóm tắt, ngày đăng, thời gian đọc ~200 từ/phút), mới nhất trước, 12 bài một
  trang (`?page=2`). Điện thoại 1 cột, tablet 2, máy tính 3.
- `/blog/<slug>`: đường dẫn (Trang chủ / Blog), tiêu đề, ngày đăng, thời gian đọc, ảnh bìa, nội dung, khung lưu ý, nút
  chia sẻ (Facebook; Zalo: trên điện thoại mở bảng chia sẻ của máy, nơi có Zalo, máy tính thì sao chép link; Sao chép
  link), **Sản phẩm trong bài** (thêm vào giỏ ngay được) và 3 bài mới khác.
- Menu đầu trang, menu điện thoại và chân trang có mục **Blog**.

## SEO (giống trang sản phẩm)

- `PageMetaService`: `/blog` có title "Blog | Hạt Lành" và mô tả riêng; bài có title "<Tiêu đề> | Hạt Lành", mô tả =
  tóm tắt (cắt ở 155 ký tự), `og:type=article`, `og:image` = ảnh bìa cắt 1200×630, JSON-LD `BlogPosting` (headline,
  image, datePublished, dateModified, author/publisher Hạt Lành, mainEntityOfPage) và `BreadcrumbList`.
- Nội dung đọc được không cần JavaScript: `HtmlPages` chèn HTML (`site/BlogHtml`) vào giữa
  `<!--app-body-->…<!--/app-body-->` trong `<div id="root">`; trang `/blog` chèn danh sách link 24 bài mới nhất. React
  thay phần này khi app chạy. Phần HTML này dùng class riêng `.ssr-blog…` với CSS thường trong `frontend/src/index.css`
  (Tailwind không quét file Java), và nội dung bài dùng chung `.prose-blog` với trang React.
- Trang bài còn nhúng dữ liệu bài (cùng dạng `GET /api/blog/{slug}`) vào `<script type="application/json"
  id="initial-data">` (đã escape `<`, `>`, `&`), nên `BlogPostPage` hiện bài ngay, không gọi API lần nữa.
- Bài nháp hoặc không có → **404 thật**; slug cũ → **301**.
- `sitemap.xml` có `/blog` và mọi bài đã đăng (`lastmod` = lần sửa cuối). Đăng, gỡ, sửa bài đã đăng, xoá bài thì
  sitemap được dựng lại ngay.

## API

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/api/blog?page=&size=` | Bài đã đăng, mới nhất trước (`PageResponse`, tối đa 24/trang) |
| GET | `/api/blog/{slug}` | Chi tiết: `contentHtml`, sản phẩm liên quan đang bán (giá hiện tại), 3 bài mới khác. Nháp/không có → 404 `BLOG_POST_NOT_FOUND`; slug cũ → bài kèm `redirectTo` |
| GET | `/api/admin/blog?q=&status=&page=` | Danh sách cho admin, sửa gần nhất trước |
| GET/PUT/DELETE | `/api/admin/blog/{id}` | Xem (kèm `content` Markdown gốc), sửa, xoá |
| POST | `/api/admin/blog` | Tạo bài nháp |
| PATCH | `/api/admin/blog/{id}/status` `{status}` | Đăng / gỡ. Thiếu tóm tắt/ảnh bìa/alt → 400 `BLOG_NOT_READY` kèm `missing` |
| POST | `/api/admin/blog/{id}/images` (multipart `file`, `alt?`) | Tải ảnh lên → `{id, url, width, height, alt}` |
| DELETE | `/api/admin/blog/{id}/images/{imageId}` | Xoá ảnh. 409 `IMAGE_IS_COVER` / `IMAGE_IN_USE` (bài đã đăng) |
| PUT | `/api/admin/blog/{id}/cover` `{imageId, alt}` | Đặt ảnh bìa (alt bắt buộc). `imageId: null` bỏ ảnh bìa (chỉ bài nháp) |
| POST | `/api/admin/blog/preview` `{content}` | Dựng Markdown thành HTML như trang thật |

Mọi API admin chỉ dành cho ADMIN (STAFF/CUSTOMER → 403) và ghi nhật ký: `BLOG_POST_CREATED`, `BLOG_POST_UPDATED`,
`BLOG_POST_PUBLISHED`, `BLOG_POST_UNPUBLISHED`, `BLOG_POST_DELETED`, `BLOG_IMAGE_ADDED`, `BLOG_IMAGE_DELETED` (nội dung
Markdown chỉ lưu độ dài).

## Database (V25)

`blog_posts` (ràng buộc: bài `PUBLISHED` phải có `published_at`, tóm tắt và ảnh bìa; có ảnh bìa thì phải có alt),
`blog_post_images`, `blog_post_products (post_id, product_id, position)`, `blog_slug_history`.

## Kiểm thử

- Backend: `BlogMarkdownTest` (HTML thô bị escape, link `javascript:` bị bỏ, ảnh lazy + kích thước + srcset, figure,
  thời gian đọc), `BlogE2ETest` (STAFF/CUSTOMER bị 403 ở mọi API admin blog, chưa đăng nhập 401, nháp → 404, đăng cần tóm tắt/ảnh bìa/alt, slug `-2` và 301 chỉ cho
  bài đã đăng, chặn xoá ảnh đang dùng, giới hạn 100.000 ký tự, meta/JSON-LD/HTML không cần JS/initial-data đã escape,
  sitemap cập nhật ngay khi đăng/xoá), `SiteE2ETest.everyFrontendRouteIsServed`.
- Frontend: `pages/BlogListPage.test.tsx`, `pages/BlogPostPage.test.tsx` (dùng initial-data không gọi API, khối sản
  phẩm, khung lưu ý, link nội bộ, 404, slug cũ), `admin/BlogFormPage.test.tsx` (chèn ảnh đúng con trỏ, dán ảnh, chặn đăng
  khi thiếu ảnh bìa/alt, cảnh báo từ ngữ, tự lưu nháp khi tải ảnh), `admin/blogRules.test.ts`.
