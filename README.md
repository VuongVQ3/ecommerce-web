# Hạt Lành - Web bán hạt dinh dưỡng

Website bán các loại hạt ăn kiêng: hạnh nhân, óc chó, macca, hạt chia, granola...

| Phần | Công nghệ |
|---|---|
| Backend | Java 21, Spring Boot 4, Spring Security (JWT trong cookie httpOnly), Spring Data JPA, Flyway |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, React Router |
| Database | PostgreSQL 17 (Docker khi phát triển) |

## Chức năng hiện có

- Đăng ký, đăng nhập, đăng xuất. Access token 15 phút và refresh token 7 ngày có xoay vòng, đều nằm trong cookie httpOnly. Phân quyền `CUSTOMER / STAFF / ADMIN`. Chi tiết: [docs/auth.md](docs/auth.md)
- Đăng nhập bằng Google (tự tạo tài khoản, hoặc liên kết với tài khoản cùng email)
- Danh sách sản phẩm: lọc theo danh mục, tìm kiếm, sắp xếp (giá, calo, protein), phân trang
- Chi tiết sản phẩm kèm bảng dinh dưỡng trên 100g
- Giỏ hàng: khách lưu localStorage, đã đăng nhập lưu database, tự gộp khi đăng nhập; giá luôn lấy từ server. Chi tiết: [docs/cart.md](docs/cart.md)
- 13 sản phẩm mẫu trong 3 danh mục

## Chạy trên máy

Yêu cầu: JDK 21, Node.js 20+, Docker Desktop.

```bash
# 1. Database
docker compose up -d

# 2. Backend - http://localhost:8080
cd backend
cp .env.example .env          # rồi điền JWT_SECRET (>= 32 ký tự) và DB_PASSWORD=nutshop
./mvnw spring-boot:run        # Windows: .\mvnw.cmd spring-boot:run

# 3. Frontend - http://localhost:5173
cd frontend
npm install
npm run dev
```

Khi phát triển, Vite chuyển tiếp mọi request `/api` sang backend (cùng site), nên cookie dùng `SameSite=Lax`.

### Bật đăng nhập Google

1. Vào [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials), tạo **OAuth client ID** loại **Web application**.
2. Thêm vào **Authorized JavaScript origins**: `http://localhost:5173` và `http://localhost`.
3. Điền `GOOGLE_CLIENT_ID` trong `backend/.env`, rồi khởi động lại backend.

Nếu không có Client ID, nút Google sẽ tự ẩn.

## Deploy

Miễn phí trên Render + Neon, một Docker image chứa cả frontend lẫn API: xem [docs/deploy.md](docs/deploy.md).

## Kiểm thử

```bash
cd backend && ./mvnw test                     # cần Docker: test chạy trên PostgreSQL thật (Testcontainers)
cd frontend && npm test && npm run build && npm run lint
```

## API

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/api/categories` | Danh sách danh mục |
| GET | `/api/products?category=&q=&sort=&page=&size=` | Danh sách sản phẩm. `sort`: `price_asc`, `price_desc`, `calories_asc`, `protein_desc` |
| GET | `/api/products/{slug}` | Chi tiết sản phẩm |
| | `/api/auth/*` | Đăng ký, đăng nhập, refresh, đăng xuất, me, Google: xem [docs/auth.md](docs/auth.md) |

Biến môi trường của backend: xem [backend/.env.example](backend/.env.example) và [docs/auth.md](docs/auth.md#biến-môi-trường).
