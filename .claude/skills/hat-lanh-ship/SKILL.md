---
name: hat-lanh-ship
description: Commit, merge a feature branch into main and push the Hạt Lành (ecommerce-web) repo to production on Render, with checks before and after deploy.
---

# Đưa thay đổi Hạt Lành lên production

Dùng khi người dùng bảo "push", "đưa lên prod", "merge vào main", "deploy" cho repo `ecommerce-web` (frontend React/Vite trong `frontend/`, backend Spring Boot trong `backend/`, deploy bằng Docker trên Render, `autoDeploy: true` theo nhánh `main`).

Tham số (hỏi nếu không rõ): tên nhánh cần đưa lên (mặc định: nhánh hiện tại nếu không phải `main`), commit message nếu còn thay đổi chưa commit.

## Nguyên tắc an toàn
- KHÔNG sửa `backend/.env`, `frontend/.env*` hay biến môi trường. KHÔNG sửa database (local hay production).
- KHÔNG `git push --force`, KHÔNG `git reset --hard`, `git clean`, `git restore .`, `git checkout .`.
- KHÔNG commit file `.env`, secret, file trong scratchpad hay file patch sao lưu. Rà `git diff --cached` trước khi commit.
- Gặp conflict khi merge: DỪNG, liệt kê file conflict, hỏi người dùng. Không tự giải quyết.
- Bất kỳ bước kiểm tra nào lỗi: DỪNG, báo lỗi, KHÔNG push.
- Không push nếu người dùng chưa duyệt kết quả (ảnh/số đo) của thay đổi giao diện trong cùng phiên.

## Các bước

### 1. Kiểm tra hiện trạng
```bash
git status --short
git branch --show-current
git stash list
git fetch origin
git log --oneline origin/main -5
```
- Báo lại: nhánh hiện tại, file chưa commit, stash còn tồn tại (nếu có thì hỏi có liên quan không).
- Nếu working tree có thay đổi không thuộc task này: dừng và hỏi.

### 2. Commit trên nhánh tính năng (nếu còn thay đổi)
- Chỉ `git add` đúng các file của task (liệt kê từng file, không `git add .` khi chưa rà).
- Commit message theo kiểu conventional (`fix(...)`, `feat(...)`), tiếng Anh, ngắn gọn.
- Thêm dòng attribution theo hướng dẫn hiện hành của phiên (nếu có).

### 3. Merge vào main
```bash
git checkout main
git pull --ff-only origin main
git merge --no-ff <nhánh>
```
- Nhiều nhánh: merge lần lượt, mỗi nhánh một merge commit.
- Conflict → dừng (xem nguyên tắc).

### 4. Kiểm tra trước khi push
```bash
cd frontend
npm ci            # chỉ khi package-lock.json thay đổi
npx tsc -b
npm run lint
npm test
npm run build
cd ../backend
./mvnw -B test    # cần Docker cho Testcontainers; nếu không chạy được thì báo rõ, hỏi trước khi push
```
- Ghi lại số test pass/fail của frontend và backend.

### 5. Push
```bash
git push origin main
```
- Báo cáo: hash các merge commit, danh sách commit mới so với `origin/main` trước đó.
- Không xoá nhánh tính năng trừ khi người dùng yêu cầu.

### 6. Sau khi push: theo dõi deploy
- Nhắc người dùng xem Render → service `hat-lanh` → Events: lần deploy của commit mới phải báo "Deploy live".
- Nếu có thể truy cập trình duyệt: mở `https://hat-lanh.com`, kiểm tra file JS trong `index.html` đã đổi tên (hash mới) và thay đổi hiển thị đúng.
- Nếu Render báo live nhưng site vẫn là bản cũ (file `assets/index-*.js` không đổi): hướng dẫn **Manual Deploy → Clear build cache & deploy** (đã từng xảy ra do Render dùng lại build cache cũ).
- Lưu ý các biến bắt buộc trên Render: `RESEND_API_KEY` (thiếu thì backend không khởi động), `CLOUDINARY_URL`, `GOOGLE_CLIENT_ID`, `DB_URL`/`DB_USERNAME`/`DB_PASSWORD`. Deploy lỗi lúc khởi động thì kiểm tra các biến này trước.

## Báo cáo cuối
1. Nhánh đã merge và hash merge commit
2. Kết quả tsc / lint / test frontend / build / test backend
3. Đã push hay chưa, lý do nếu chưa
4. Việc người dùng cần làm tiếp (kiểm tra deploy trên Render, kiểm tra trên điện thoại thật, sửa dữ liệu qua admin nếu có)
