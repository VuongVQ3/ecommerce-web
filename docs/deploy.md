# Deploy miễn phí: Render + Neon

Một Docker image duy nhất ([Dockerfile](../Dockerfile)): React được build rồi do Spring Boot phục vụ, **cùng địa chỉ với `/api`**. Nhờ vậy không cần CORS, và cookie đăng nhập dùng `SameSite=Lax`.

| Thành phần | Dịch vụ | Gói free |
|---|---|---|
| Web (frontend + API) | [Render](https://render.com) Web Service, Docker | 512 MB RAM. **Tự ngủ sau 15 phút không có truy cập**, lần mở đầu tiên sau đó mất khoảng 1 phút để khởi động |
| PostgreSQL | [Neon](https://neon.tech) | 0.5 GB lưu trữ, không hết hạn |

## 1. Tạo database trên Neon
1. Đăng nhập neon.tech bằng GitHub → **Create project**, chọn region **Singapore** (gần Render Singapore).
2. Bấm **Connect**, lấy các thông tin: host (`ep-…aws.neon.tech`), database (`neondb`), user, password.
3. Ghép thành `DB_URL`: `jdbc:postgresql://<host>/neondb?sslmode=require`

## 2. Tạo web service trên Render
1. Đăng nhập render.com bằng GitHub → **New → Blueprint** → chọn repo `ecommerce-web`. Render sẽ đọc file [render.yaml](../render.yaml).
2. Điền các biến Render hỏi:
   - `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`: lấy từ Neon.
   - `FRONTEND_URL`: địa chỉ của chính service, ví dụ `https://hat-lanh.onrender.com`. Nếu chưa biết, điền tạm, deploy xong sửa lại cho đúng rồi bấm **Manual Deploy**.
   - `RESEND_API_KEY`, `GOOGLE_CLIENT_ID`: để trống cũng được.
3. **Apply.** Lần build đầu mất khoảng 5–10 phút. Flyway tự tạo bảng và 13 sản phẩm mẫu trên Neon.

`JWT_SECRET` do Render tự sinh ngẫu nhiên, không nằm trong git.

## Trước khi có khách thật
- **Turnstile đang dùng test key của Cloudflare (luôn pass), tức là chưa chống bot thật.** Tạo widget trên Cloudflare cho domain của bạn, rồi đặt `TURNSTILE_SECRET_KEY` (biến runtime) và `VITE_TURNSTILE_SITE_KEY` (biến build) trên Render.
- **Chưa có `RESEND_API_KEY`:** link đặt lại mật khẩu chỉ được ghi vào log của Render.
- **Điều khoản và chính sách bảo mật** vẫn là bản nháp.
- Gói free tự ngủ khi không có truy cập. Muốn chạy liên tục thì nâng cấp gói (Starter khoảng 7 USD/tháng).

## Chạy image trên máy
```bash
docker build -t hat-lanh .
docker run -p 8090:8080 --env-file backend/.env \
  -e DB_URL=jdbc:postgresql://host.docker.internal:5432/nutshop -e FRONTEND_URL=http://localhost:8090 hat-lanh
```
