# Module xác thực (auth)

Backend: Spring Boot, package `com.nutshop.auth` và `com.nutshop.security`.
Token chỉ nằm trong **cookie httpOnly**. Body của response không bao giờ chứa token, mật khẩu hay hash.

## Endpoint

Prefix `/api/auth`. Mọi request `POST/PUT/PATCH/DELETE` tới `/api/**` **bắt buộc có header `X-Requested-With`** (giá trị bất kỳ, ví dụ `XMLHttpRequest`), nếu thiếu sẽ bị trả `403`. Xem phần [Chống CSRF](#chống-csrf).

| Method | Path | Body | Thành công | Lỗi thường gặp |
|---|---|---|---|---|
| POST | `/register` | `{ fullName, email, password, phone?, acceptTerms: true, turnstileToken, website }` | `201` + user, đặt 2 cookie (đăng nhập luôn) | `400` dữ liệu sai hoặc Turnstile thất bại (`TURNSTILE_FAILED`), `409` `EMAIL_EXISTS` / `PHONE_EXISTS`, `429`, `503` không gọi được Cloudflare |
| POST | `/login` | `{ email, password }` | `200` + user, đặt 2 cookie | `401` "Email hoặc mật khẩu không đúng", `403` tài khoản bị khóa, `429` |
| POST | `/refresh` | không có (đọc cookie `refresh_token`) | `200` + user, đặt cặp cookie mới | `401` và **xoá cả 2 cookie** |
| POST | `/logout` | không có | `204`, thu hồi refresh token, xoá cookie | luôn thành công |
| GET | `/me` | không có | `200` + user | `401` |
| POST | `/google` | `{ credential }` (Google ID token) | `200` + user, đặt 2 cookie (giống `/login`) | `401` "Đăng nhập Google không thành công. Vui lòng thử lại.", `403` tài khoản bị khoá, `429`, `503` nếu chưa cấu hình |
| POST | `/forgot-password` | `{ email }` | `202` + `{ message }`, **giống hệt nhau** dù email có tồn tại hay không | `400` email sai định dạng, `429` |
| POST | `/reset-password` | `{ token, newPassword }` | `204`, xoá cookie, **thu hồi mọi phiên đăng nhập** của user | `400` liên kết không hợp lệ/hết hạn/đã dùng, hoặc mật khẩu yếu; `429` |
| GET | `/providers` | không có | `{ googleClientId }` (null nếu tắt Google) | |

User trả về có dạng `{ id (UUID), email, fullName, phone, role }`, trong đó `role` là `CUSTOMER`, `STAFF` hoặc `ADMIN`.

Lỗi trả về theo chuẩn RFC 9457 (`application/problem+json`). Thông báo cho người dùng nằm ở `detail` (tiếng Việt). Lỗi validate có thêm `errors: { tênTrường: "thông báo" }`. Lỗi cần frontend xử lý riêng có thêm `code`:

| `code` | Khi nào |
|---|---|
| `EMAIL_EXISTS` | `409`: đăng ký bằng email đã có tài khoản |
| `PHONE_EXISTS` | `409`: số điện thoại (sau khi chuẩn hoá) đã được dùng |
| `TURNSTILE_FAILED` | `400` token chống bot sai hoặc thiếu; `503` không gọi được Cloudflare |

### Quy tắc dữ liệu đầu vào (frontend phải validate giống hệt)

| Trường | Quy tắc |
|---|---|
| `email` | Bắt buộc, đúng định dạng email, tối đa 255 ký tự. Lưu dạng chữ thường |
| `password` | 8–72 ký tự, có ít nhất 1 chữ cái (`\p{L}`, tính cả chữ có dấu) và 1 chữ số |
| `fullName` | Bắt buộc, tối đa 100 ký tự |
| `phone` | Không bắt buộc. Chấp nhận dấu cách, dấu chấm, gạch ngang và dạng `+84`/`84`. Được chuẩn hoá về `0xxxxxxxxx` (`PhoneNumbers.java` ↔ `lib/phone.ts`), sau đó phải đúng 10 chữ số bắt đầu bằng `0` |
| `acceptTerms` | Bắt buộc `true`. Frontend gửi `true` khi người dùng bấm "Đăng ký" ngay dưới dòng "Bằng việc đăng ký, bạn đồng ý với…" |

## Đăng nhập Google

Luồng **ID token** của Google Identity Services, không dùng OAuth redirect, access token hay Client Secret:

1. `GoogleSignInButton` (trên form ở `/dang-nhap`, `/dang-ky`, ngăn cách bằng "hoặc") nạp `https://accounts.google.com/gsi/client` một lần, hiện nút chính thức bằng tiếng Việt: "Đăng nhập bằng Google" (`signin_with`) ở `/dang-nhap`, "Đăng ký bằng Google" (`signup_with`) ở `/dang-ky`. Khách chọn tài khoản trong popup.
2. Google trả ID token (`credential`), frontend gửi `POST /api/auth/google`.
3. `GoogleTokenVerifier` kiểm tra chữ ký (khoá công khai của Google), `exp`, `aud` = `GOOGLE_CLIENT_ID`, `iss` là `accounts.google.com` hoặc `https://accounts.google.com`, và `email_verified = true`. Sai bất cứ điều gì → `401` cùng một thông báo. Token không bao giờ được ghi log.
4. `AuthService.loginWithGoogle` tìm tài khoản (email chuẩn hoá: trim + chữ thường):
   - theo `google_id` (claim `sub`) → đăng nhập;
   - không có → theo email: gắn `google_id`, đánh dấu email đã xác minh. **Nếu email đó chưa từng được xác minh**, người đã đăng ký có thể không phải chủ email (đăng ký trước bằng email người khác): mật khẩu và số điện thoại của tài khoản bị xoá, mọi phiên đăng nhập cũ bị thu hồi, ghi audit `USER_GOOGLE_TAKEOVER`. Tài khoản không lưu địa chỉ (địa chỉ nằm trong từng đơn), nên số điện thoại là thông tin giao hàng duy nhất cần xoá. Access token đã cấp cho phiên cũ hết hạn sau tối đa 15 phút như khi đổi mật khẩu;
   - không có → tạo tài khoản khách hàng: họ tên từ `name` (thiếu thì phần trước @), không mật khẩu, email đã xác minh.
5. Cấp cookie như đăng nhập bằng mật khẩu. Rate limit chung nhóm với `/login`.

Tài khoản không có mật khẩu (`hasPassword: false` trong user): đăng nhập bằng mật khẩu trả lỗi chung như sai mật khẩu; tab "Đổi mật khẩu" thành **"Đặt mật khẩu"** (không hỏi mật khẩu hiện tại); "Quên mật khẩu" vẫn dùng được.

**"Nhập lại mật khẩu" (`confirmPassword`) chỉ được kiểm tra ở frontend** (zod `.refine()`, lỗi gắn path `confirmPassword`). Frontend loại trường này khỏi payload; nếu request vẫn có trường này (hoặc bất kỳ trường lạ nào) thì backend bỏ qua, không báo lỗi và không lưu.

### Đồng ý điều khoản

Bảng `users` ghi `terms_accepted_at` (bắt buộc). Không còn ô "nhận khuyến mãi qua email": hai cột `marketing_consent`, `marketing_consent_at` đã bị xoá (V19); request cũ còn gửi `marketingConsent` thì backend bỏ qua. Tài khoản tạo qua Google cũng được ghi `terms_accepted_at`: trang đăng nhập có ghi chú "Lần đầu tiếp tục với Google, bạn đồng ý với…", còn trang đăng ký dùng chung dòng đồng ý điều khoản.

### Chống bot khi đăng ký

1. **Honeypot `website`:** ô bị ẩn khỏi người dùng (đẩy ra ngoài màn hình, `tabIndex=-1`, `aria-hidden`). Nếu ô này có giá trị, backend trả **`201` giả** kèm một user không có thật: không tạo tài khoản, không đặt cookie, không gọi Turnstile, chỉ ghi log mức INFO.
2. **Cloudflare Turnstile:** widget chạy ở chế độ `interaction-only` nên gần như không hiện ra. Backend kiểm tra token với `siteverify`, và **từ chối nếu không kiểm tra được** (token sai thì `400`, Cloudflare không phản hồi thì `503`). Token chỉ dùng được một lần, nên frontend reset widget sau mỗi lần gửi.
3. **Test key của Cloudflare** (luôn pass): site key `1x00000000000000000000BB` (dạng ẩn) và secret `1x0000000000000000000000000000000AA`. Dùng cho dev (`frontend/.env.development`, `backend/.env`) và test. Ngay cả với test key, backend **vẫn gọi Cloudflare thật**, nên `mvnw test` cần có Internet.

## Cookie

| Cookie | Nội dung | Path | Thời hạn | Thuộc tính |
|---|---|---|---|---|
| `access_token` | JWT HS256, payload chỉ có `sub` (user id), `role`, `iat`, `exp` | `/api` | 15 phút | `HttpOnly`, `Secure`, `SameSite=$COOKIE_SAME_SITE` |
| `refresh_token` | Chuỗi ngẫu nhiên 32 byte (base64url) | `/api/auth` | 7 ngày | như trên |

- Refresh token chỉ được gửi tới `/api/auth/*` nhờ path hẹp, không đi kèm mọi request API.
- DB chỉ lưu **SHA-256** của refresh token (bảng `refresh_tokens`).
- Trên các endpoint public, backend bỏ qua `access_token`. Nhờ vậy cookie cũ hoặc hết hạn không thể làm hỏng việc đăng nhập hay xem sản phẩm.

### Gọi API từ frontend

```ts
fetch(`${API}/api/auth/login`, {
  method: 'POST',
  credentials: 'include',                       // bắt buộc để gửi/nhận cookie
  headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
  body: JSON.stringify({ email, password }),
})
```

Khi nhận `401` từ một API cần đăng nhập: gọi `POST /api/auth/refresh` **một lần**, thành công thì gửi lại request, thất bại thì chuyển về trang đăng nhập.

## Refresh token: xoay vòng và phát hiện dùng lại

1. Mỗi lần `/refresh`: token đang dùng bị thu hồi (`revoked_at`), backend cấp token mới và lưu liên kết `replaced_by_id`.
2. Nếu một token **đã bị thu hồi** lại được gửi lên, nghĩa là token đó đã bị đánh cắp hoặc dùng lại. Backend khi đó **thu hồi toàn bộ refresh token còn hiệu lực của user** (đăng xuất mọi thiết bị) và ghi log cảnh báo.
3. Token hết hạn, không tồn tại, hoặc thuộc user bị khóa (`is_active=false`) đều bị từ chối với `401`.

Việc thu hồi được commit ngay cả khi request bị từ chối (`@Transactional(noRollbackFor = UnauthorizedException.class)`).

## Quên / đặt lại mật khẩu

1. `POST /forgot-password`: nếu email thuộc một tài khoản đang hoạt động, backend tạo token ngẫu nhiên 32 byte (DB chỉ lưu SHA-256, bảng `password_reset_tokens`) có hạn **30 phút**, rồi gửi link `FRONTEND_URL/dat-lai-mat-khau?token=…`. Mỗi lần xin link mới thì link cũ hết hiệu lực.
2. Email được gửi **ở luồng nền, sau khi commit**. Nhờ vậy thời gian phản hồi không khác nhau giữa email có và không có tài khoản, vì không phải chờ gọi Resend.
3. `POST /reset-password`: token chỉ dùng **một lần** (có khoá dòng để chống dùng song song). Đổi mật khẩu xong thì mọi refresh token của user bị thu hồi. Tài khoản chỉ đăng nhập bằng Google cũng có thể đặt mật khẩu theo cách này.
4. Giới hạn: 3 lần/15 phút **cho mỗi email** (áp dụng cả với email không tồn tại, nên không lộ thông tin). Thêm giới hạn 5 lần/phút/IP cho cả `/forgot-password` và `/reset-password`.
5. **Chưa có `RESEND_API_KEY`:** email (kèm link) được **ghi ra log** của backend, tìm dòng `===== EMAIL`. Chỉ dùng khi phát triển, vì log khi đó chứa link đặt lại mật khẩu còn hiệu lực.

Frontend: `/quen-mat-khau` và `/dat-lai-mat-khau` (đọc token rồi xoá token khỏi thanh địa chỉ ngay). Đổi mật khẩu thành công thì chuyển về `/dang-nhap` kèm thông báo.

## Bảo mật khác

- **Mật khẩu:** BCrypt cost 12. Không log, không trả về.
- **Đăng nhập sai:** luôn trả cùng một thông báo *"Email hoặc mật khẩu không đúng"*. Khi email không tồn tại, backend vẫn chạy một lần so sánh BCrypt với hash giả, để thời gian phản hồi không lộ email có tồn tại hay không.
- **Tài khoản bị khóa:** chỉ khi **đúng mật khẩu** mới trả `403` *"Tài khoản đã bị khóa…"*. Sai mật khẩu thì vẫn là thông báo chung.
- **Rate limit:** `POST /login` và `POST /register` tối đa 5 lần/phút/IP, mỗi endpoint đếm riêng. Vượt giới hạn thì trả `429` kèm header `Retry-After`.
- **CORS:** chỉ cho phép `FRONTEND_URL`, `allowCredentials=true`, header cho phép là `Content-Type` và `X-Requested-With`.

### Chống CSRF

Khi frontend và backend khác domain, cookie phải là `SameSite=None`. Lúc đó một trang web lạ có thể khiến trình duyệt gửi cookie kèm một form POST. CORS **không** chặn được trường hợp này. Backend vì vậy bắt buộc header `X-Requested-With` trên các request thay đổi dữ liệu. Trình duyệt chỉ cho trang web thêm header tùy chỉnh sau khi qua CORS preflight, mà chỉ `FRONTEND_URL` qua được preflight, nên request giả mạo bị chặn.

## Phân quyền cho các module khác

```java
@RestController
@RequestMapping("/api/admin/products")
@Roles({ Role.STAFF, Role.ADMIN })          // áp dụng cho cả class
public class AdminProductController {

    @DeleteMapping("/{id}")
    @Roles(Role.ADMIN)                       // annotation ở method sẽ ghi đè annotation ở class
    public void delete(@PathVariable UUID id) { ... }
}
```

- Mọi endpoint không có trong `SecurityConfig.PUBLIC_ENDPOINTS` đều cần đăng nhập. Chưa đăng nhập thì trả `401`, sai role thì trả `403` *"Bạn không có quyền truy cập chức năng này"*.
- Lấy user đang đăng nhập: `@AuthenticationPrincipal Jwt jwt`, rồi `UUID.fromString(jwt.getSubject())`.
- Role đọc từ access token, nên **đổi role chỉ có hiệu lực sau lần refresh kế tiếp** (tối đa 15 phút).

## Biến môi trường

Khi phát triển trên máy, đặt các biến trong `backend/.env` (copy từ `backend/.env.example`, file này đã được gitignore). Khi deploy, đặt thành biến môi trường thật.

| Biến | Bắt buộc | Mặc định | Ghi chú |
|---|---|---|---|
| `JWT_SECRET` | ✓ | (không có) | Tối thiểu 32 ký tự. Thiếu thì app không khởi động |
| `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` | | DB của docker-compose | |
| `FRONTEND_URL` | | `http://localhost:5173` | Origin duy nhất được CORS cho phép |
| `COOKIE_SAME_SITE` | | `Lax` | `None` khi frontend và backend khác site (khi deploy) |
| `COOKIE_SECURE` | | `true` | `SameSite=None` bắt buộc `true`. Trình duyệt vẫn nhận cookie Secure trên `http://localhost` |
| `FORWARD_HEADERS_STRATEGY` | | `none` | `framework` khi chạy sau reverse proxy tin cậy (để rate limit theo IP thật). **Không** bật nếu không có proxy, vì client có thể giả `X-Forwarded-For` |
| `GOOGLE_CLIENT_ID` | | (trống) | Trống thì tắt đăng nhập Google |
| `TURNSTILE_SECRET_KEY` | ✓ | (không có) | Secret của Cloudflare Turnstile. Khi dev, dùng test secret `1x0000000000000000000000000000000AA` |
| `VITE_TURNSTILE_SITE_KEY` (frontend) | ✓ khi build | test key trong `.env.development` | Site key của widget managed/invisible. **Đặt khi build bản production** (xem `frontend/.env.example`) |
| `RESEND_API_KEY` | khi deploy | (trống) | Trống thì email chỉ được ghi ra log, **không** dùng khi deploy |
| `MAIL_FROM` | | `Hat Lanh <onboarding@resend.dev>` | Phải thuộc domain đã xác minh trên Resend. `onboarding@resend.dev` chỉ gửi được tới email của chính tài khoản Resend |

Khi phát triển, frontend gọi `/api` qua proxy của Vite nên cùng site, dùng `SameSite=Lax` là đủ.

## Chạy test

```bash
cd backend
./mvnw test          # Windows: .\mvnw.cmd test
```

**Cần Docker đang chạy và có Internet.** Các test tích hợp dùng PostgreSQL thật qua Testcontainers (`postgres:17-alpine`) để bắt được lỗi SQL chỉ xảy ra trên PostgreSQL. Test đăng ký gọi Cloudflare Turnstile thật bằng test secret.

| Test | Nội dung |
|---|---|
| `AuthServiceTest` | Đăng ký trùng email/SĐT, sai mật khẩu, email không tồn tại (vẫn chạy BCrypt), tài khoản bị khóa, refresh |
| `RefreshTokenServiceTest` | Chỉ lưu hash, xoay vòng, token bị dùng lại (thu hồi tất cả), token hết hạn |
| `AuthFlowE2ETest` | register → me → refresh → logout; dùng lại token ở 2 thiết bị; thông báo lỗi chung; tài khoản bị khóa; trùng dữ liệu; validate; thiếu `X-Requested-With`; rate limit; `@Roles` |
| `GoogleLoginTests` | Đăng nhập Google qua HTTP: tạo tài khoản, liên kết tài khoản đã xác minh, chiếm lại tài khoản chưa xác minh (mất mật khẩu, số điện thoại, phiên cũ), token sai, rate limit |
| `GoogleTokenVerifierTest` | Token ký thật bằng khoá RSA tạm: cả hai `iss` của Google, sai `iss`/`aud`, hết hạn, sai chữ ký, `email_verified` false |
| `GoogleLoginServiceTest` | Tìm/tạo/liên kết tài khoản (verifier giả): mới, theo `google_id`, theo email đã/chưa xác minh, khác hoa thường, tài khoản bị khoá |
| `RegistrationE2ETest` | Đồng ý điều khoản (thiếu hoặc `false` thì `400`), ghi thời điểm đồng ý, khuyến mãi mặc định tắt, honeypot (201 giả, không tạo user), `EMAIL_EXISTS`, `PHONE_EXISTS` (kể cả khi nhập dạng `+84`), thiếu token Turnstile, thông báo validate |
| `PhoneNumbersTest` / `TurnstileVerifierTest` | Chuẩn hoá số điện thoại; Turnstile pass, fail, Cloudflare lỗi (giả lập) |
| `PasswordResetE2ETest` | Phản hồi giống nhau cho email có/không tồn tại; đổi mật khẩu xong thì phiên cũ bị đăng xuất; link chỉ dùng một lần; link hết hạn; link mới làm link cũ hết hiệu lực; mật khẩu yếu; giới hạn theo email |

## Frontend (React + Vite)

| File | Vai trò |
|---|---|
| `src/lib/api.ts` | API client dùng chung `apiRequest()`: luôn gửi `credentials: 'include'` và `X-Requested-With`. Gặp `401` thì gọi `/refresh` **một lần** rồi gửi lại request; các request cùng lúc dùng chung một lần refresh. Refresh thất bại thì báo session hết hạn |
| `src/auth/AuthContext.tsx` | `useAuth()` trả về `{ user, loading, login, register, loginWithGoogle, logout }`. Khi tải trang, gọi `/me` để biết đã đăng nhập chưa (trường hợp này không chuyển trang). Khi session hết hạn thì chuyển tới `/dang-nhap?next=<trang hiện tại>` |
| `src/auth/RequireAuth.tsx` | Bảo vệ route: `/tai-khoan/*` cần đăng nhập, `/admin/*` cần `STAFF` hoặc `ADMIN` (sai role thì hiện trang 403) |
| `src/auth/schemas.ts` | Schema zod, **cùng quy tắc và thông báo** với backend |
| `src/auth/useAuthForm.ts` | react-hook-form + zod: hiện lỗi từ backend dưới đúng ô, có thông báo lỗi chung, chặn submit hai lần |
| `src/lib/redirect.ts` | `safeNextPath()`: `?next=` chỉ nhận đường dẫn nội bộ, chặn `//evil.com`, `https://…`, `/\…` |

- Frontend **không lưu token** ở localStorage hay sessionStorage, và không đọc được token vì cookie là httpOnly.
- Đăng nhập và đăng xuất không động vào localStorage, nên dữ liệu khác của khách (ví dụ giỏ hàng sau này) được giữ nguyên.
- Bảo vệ route ở frontend chỉ để hiển thị giao diện phù hợp. Quyền truy cập thật do backend kiểm tra.
- Gọi API cần đăng nhập từ module mới: `apiRequest<T>('/api/orders')`. Việc refresh và chuyển trang được xử lý sẵn.

Form đăng ký (`pages/RegisterPage.tsx`): checklist mật khẩu cập nhật theo từng ký tự gõ (`aria-live`), gợi ý sửa lỗi gõ tên miền email (`lib/emailSuggestion.ts`, chỉ gợi ý, không chặn gửi), chuẩn hoá số điện thoại trước khi gửi, `EMAIL_EXISTS` hiện lỗi dưới ô email kèm link "Đăng nhập" (điền sẵn email qua router state, không đưa lên URL) và "Quên mật khẩu?". Màu chữ phụ dùng token `muted` / `success` / `danger` trong `index.css`, đều ≥ 5.5:1.

Test frontend: `cd frontend && npm test`. Gồm test API client (refresh và retry, refresh dùng chung, không refresh cho `/login`), test `safeNextPath`, và test schema.

## Giới hạn hiện tại và việc chưa làm

- **Access token không thu hồi được:** sau khi logout, access token đã lộ vẫn dùng được tới khi hết hạn (tối đa 15 phút). Cookie trên trình duyệt thì đã bị xoá.
- **Hai tab refresh cùng lúc** với cùng một token: request thứ hai bị coi là dùng lại token, nên user bị đăng xuất. Trong cùng một tab, frontend đã gộp các lần refresh thành một. Giữa nhiều tab thì chưa xử lý, và backend chưa có khoảng thời gian ân hạn cho trường hợp này.
- **Safari** có thể không nhận cookie `Secure` trên `http://localhost`. Nếu phát triển bằng Safari, đặt `COOKIE_SECURE=false` trong `backend/.env` (chỉ dùng khi phát triển).
- **Rate limit chạy trong bộ nhớ của từng instance:** nếu chạy nhiều instance thì cần store dùng chung (Redis…).
- **Chưa có job dọn refresh token hết hạn hoặc đã thu hồi.**
- **Email gửi ở luồng nền không có hàng đợi bền:** nếu backend tắt đúng lúc đang gửi, hoặc Resend lỗi, email sẽ mất (đã ghi log lỗi). Người dùng có thể xin lại link.
- **Chưa có:** xác minh email, đổi mật khẩu khi đang đăng nhập, quản lý phiên đăng nhập ("đăng xuất mọi thiết bị"), giao diện quản trị user/role.
