# Việc để làm sau

## Trang quản trị

- [ ] **API đếm số đơn theo từng trạng thái.** Tab trạng thái ở `/admin/don-hang` hiện gọi
  `GET /api/admin/orders?status=…&size=1` cho từng trạng thái (6 request mỗi lần đổi tìm kiếm / khoảng ngày) chỉ để
  lấy `totalItems`. Thay bằng một endpoint trả về số đơn của mọi trạng thái (theo cùng `q`, `from`, `to`) trong một
  lần gọi. Code: `frontend/src/admin/OrdersPage.tsx` (biến `counts`).
- [ ] **Lọc "đơn chờ quá 24 giờ" ở backend.** Link từ Tổng quan mở `/admin/don-hang?status=PENDING&qua24h=1`; API chỉ
  lọc theo ngày nên frontend hỏi tới ngày mốc rồi lọc theo giờ trong trình duyệt (một trang có thể hiện ít hơn 20 đơn).
  Thêm tham số kiểu `createdBefore` (thời điểm) cho `GET /api/admin/orders`, dùng chung điều kiện với
  `pendingOver24h` của `DashboardService`. Code: `frontend/src/admin/OrdersPage.tsx` (`overdue`, `cutoff`).
