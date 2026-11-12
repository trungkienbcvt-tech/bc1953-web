# Báo cáo CV 1953 – KBNN khu vực VIII (bản Vercel + Postgres)

Ứng dụng web nhập, gửi, tiếp nhận và tổng hợp báo cáo giải ngân của 12 đơn vị (Phòng Nghiệp vụ 2 + Phòng giao dịch 17–27).
Giao diện giữ nguyên bản Apps Script; máy chủ chạy bằng hàm Node.js trên **Vercel**, số liệu lưu trong **Postgres** (Supabase hoặc Vercel/Neon Postgres). Phòng giao dịch không truy cập được file Excel/Google.

```
public/index.html   giao diện (một trang, gọi POST /api/rpc)
api/rpc.js          cổng API duy nhất (đăng nhập, nhập số liệu, quy trình, xuất biểu)
lib/                logic nghiệp vụ, xuất Excel/PDF, kết nối CSDL, lược đồ SQL
seed/raw.json       bản chụp số liệu từ file Excel tháng 10/2026 (cấu trúc dòng + số đầu kỳ tháng 9)
scripts/seed.js     nạp dữ liệu khởi tạo, sinh mã đăng nhập
scripts/dev.js      chạy thử trên máy (CSDL tạm trong bộ nhớ)
test/run.js         kiểm thử tự động (npm test)
```

## Cách hoạt động (khác bản Apps Script)
- **Nhập lũy kế, trong tháng tự tính:** PGD chỉ nhập cột *lũy kế*; cột *trong tháng* = lũy kế − lũy kế tháng trước (đầu kỳ = tháng 9 lấy từ file Excel).
- **Kỳ báo cáo:** mỗi kỳ có trạng thái và hạn nộp riêng. Cán bộ tổng hợp bấm “Chốt kỳ” để sang tháng sau; lũy kế được giữ làm số đầu kỳ. Kỳ cũ vẫn xem/in được, PGD nhập bù được nếu kỳ đó chưa gửi.
- **Tên chủ đầu tư:** dòng PGD dưới chủ đầu tư cha tự lấy tên cha; chủ đầu tư có nhiều phòng thanh toán ghi “Tên (Khu vực Tuyên Quang)” / “(Khu vực Hà Giang)” hoặc “(Phòng giao dịch nn)”.
- **In/xuất:** Excel (.xlsx) tải về; PDF mở trang in ở tab mới (Ctrl+P → Lưu thành PDF).

## Triển khai từng bước

### 1. Tạo cơ sở dữ liệu (Supabase – miễn phí)
1. Vào https://supabase.com → **New project** (chọn vùng Singapore), đặt mật khẩu CSDL và nhớ mật khẩu này.
2. **Project Settings → Database → Connection string → Transaction pooler** → sao chép chuỗi dạng  
   `postgresql://postgres.xxxx:[MẬT KHẨU]@aws-0-xxx.pooler.supabase.com:6543/postgres` (thay `[MẬT KHẨU]`).
   *(Nếu dùng Vercel Postgres/Neon thì lấy `DATABASE_URL` trong tab Storage của Vercel.)*

### 2. Nạp dữ liệu khởi tạo (làm một lần, trên máy tính có cài Node.js 20+)
```bash
git clone <địa chỉ repo của bạn>   # hoặc giải nén thư mục này
cd bc1953-web
npm install
# Windows PowerShell:  $env:DATABASE_URL="postgresql://..."
# macOS/Linux:         export DATABASE_URL="postgresql://..."
npm run seed
```
Lệnh này tạo bảng, nạp 4 biểu, số đầu kỳ (tháng 9) và số tháng 10, rồi **in bảng mã đăng nhập** của 14 tài khoản (Tổng hợp toàn tỉnh, 12 phòng, 1 cán bộ Nghiệp vụ 2) và ghi vào `ma-dang-nhap.txt` (đã chặn khỏi Git). Gửi mã riêng cho từng đơn vị.
Muốn nạp lại từ đầu: `npm run seed:force` (xóa toàn bộ số liệu hiện có).

### 2b. Cách không cần cài Node/npm trên máy (dùng khi mạng cơ quan chặn npm)
Chỉ cần trình duyệt. Làm **sau khi** mã nguồn đã lên GitHub và dự án đã Import vào Vercel (bước 3, 4):
1. Trên Vercel: **Settings → Environment Variables**, thêm `DATABASE_URL` (chuỗi Supabase) và `SETUP_KEY` (một chuỗi bí mật tự đặt, ví dụ `Kbnn-2026-xyz789`), rồi **Deployments → ⋯ → Redeploy**.
2. Mở trình duyệt: `https://<tên-miền-của-bạn>.vercel.app/api/setup?key=<SETUP_KEY>`
3. Trang hiện bảng 14 tài khoản kèm mã đăng nhập (chỉ hiện một lần – chép lại ngay). Nếu CSDL đã có dữ liệu, trang báo lỗi và không làm gì.
4. Xong: xóa biến `SETUP_KEY` trên Vercel và Redeploy để đóng chức năng này.
Đưa mã lên GitHub không cần Git: tạo repo, bấm **Add file → Upload files**, kéo thả *toàn bộ nội dung* thư mục `bc1953-web` (không kéo `node_modules`) rồi **Commit changes**.

### 3. Đưa mã nguồn lên GitHub
1. Tạo repo mới (nên để **Private**) tại https://github.com/new, ví dụ `bc1953-web`.
2. Trong thư mục dự án:
```bash
git init && git add . && git commit -m "Báo cáo CV 1953"
git branch -M main
git remote add origin https://github.com/<tài-khoản>/bc1953-web.git
git push -u origin main
```
`ma-dang-nhap.txt`, `.env`, `node_modules` đã nằm trong `.gitignore` nên không bị đẩy lên.

### 4. Triển khai trên Vercel
1. Đăng nhập https://vercel.com (tài khoản/nhóm của bạn) → **Add New… → Project → Import** repo vừa tạo.
2. Framework Preset: **Other**. Không cần Build Command; giữ mặc định.
3. **Environment Variables**: thêm `DATABASE_URL` = chuỗi kết nối ở bước 1 → **Deploy**.
4. Mở địa chỉ `https://<tên-dự-án>.vercel.app`, đăng nhập bằng mã ở bước 2.
Mỗi lần `git push` lên `main`, Vercel tự triển khai lại.

## Quản trị thường gặp (chạy trong Supabase → SQL Editor)
```sql
-- Thêm cán bộ Nghiệp vụ 2, phụ trách một số phòng (bỏ trống scope = tất cả các phòng)
INSERT INTO accounts (ten, ma, vt, scope) VALUES ('Nguyễn Văn A', 'K7M2Q9', 'NV2', 'Phòng giao dịch 17;Phòng giao dịch 18');
-- Đổi mã đăng nhập
UPDATE accounts SET ma = 'AB12CD' WHERE ten = 'Phòng giao dịch 20';
-- Đặt lại báo cáo của một phòng ở kỳ hiện tại về "Chưa gửi"
UPDATE status SET tt = 'Chưa gửi' WHERE pgd = 'Phòng giao dịch 20' AND ky = (SELECT v FROM kv WHERE k = 'ky');
-- Xem nhật ký thao tác
SELECT to_char(to_timestamp(ts/1000) AT TIME ZONE 'Asia/Bangkok','DD/MM/YYYY HH24:MI') AS luc, who, act, x, y, z FROM nhat_ky ORDER BY ts DESC LIMIT 100;
```
Tên tài khoản của cán bộ NV2 hiển thị ở màn hình đăng nhập. Tài khoản `Cán bộ Nghiệp vụ 2` do `npm run seed` tạo chỉ là mẫu, nên đổi tên/thêm đúng người.

## Sao lưu
Supabase tự sao lưu hằng ngày (gói miễn phí giữ 7 ngày). Nên thỉnh thoảng bấm xuất Excel biểu tổng hợp các kỳ đã chốt để lưu.

## Chạy thử trên máy (không cần CSDL)
```bash
npm run dev        # cần Node 22.13+; mở http://localhost:3000, mã đăng nhập in ra màn hình
npm test
```

## Thay đổi cấu trúc danh sách chủ đầu tư
Danh sách dòng nằm trong bảng `rowdef` (lấy từ `seed/raw.json`). Muốn thêm/bớt chủ đầu tư, sửa file Excel gốc, xuất lại `seed/raw.json` rồi nạp lại (`npm run seed:force`) **trước khi** các đơn vị nhập số liệu, hoặc nhờ người phát triển viết lệnh di chuyển số liệu.


## Đối chiếu số liệu Kho bạc
1. Cán bộ Nghiệp vụ 2 hoặc tổng hợp đăng nhập → trang đầu → thẻ **Đối chiếu số liệu Kho bạc** → **Tải file Kho bạc (.xlsx)**: chọn file báo cáo 01b/TTKHN của Kho bạc (đơn vị đồng). Làm trước khi các đơn vị nhập; mỗi kỳ tải lại một lần.
2. Số Kho bạc theo từng phòng được lưu ở bảng `kbnn_ref` (đơn vị đồng). Khi PGD nhập số, đầu mỗi biểu hiện khung so sánh Thấp hơn / Cao hơn / Khớp (đổi ngay khi gõ), trang Tổng quan có bảng đối chiếu, và khi bấm Gửi báo cáo có cảnh báo (vẫn cho gửi).
3. Cách đối chiếu (file Kho bạc không có cột chủ đầu tư nên so ở mức tổng từng phòng): Biểu 01 ↔ dòng "1. Vốn cân đối NSĐP" (cột kéo dài, cột kế hoạch năm); Biểu 02 ↔ "2.1 Vốn NSTW ngành, lĩnh vực"; Biểu 03 (21-25) ↔ "2.2 Vốn NSTW chương trình MTQG" (cộng 3 cột NSTW). Biểu 03 (26-30) chưa có dữ liệu Kho bạc tương ứng. Sửa quy tắc ở mảng `MUC` đầu file `lib/doichieu.js`.
4. Coi là khớp khi chênh lệch ≤ 1 triệu đồng hoặc ≤ 0,5 triệu mỗi dòng đã nhập (do làm tròn).

## Quy trình ký duyệt thí điểm (Phòng giao dịch 17)

Chỉ PGD 17 (danh sách `THI_DIEM` trong `lib/common.js`); các phòng khác giữ luồng cũ.

Người lập biểu → *Trình KTT* → Kế toán trưởng → *Trình lãnh đạo* → Trưởng phòng → *Phê duyệt* (tự gửi NV2) →
Huy (NV2) *Tiếp nhận*, đối chiếu → *Xác nhận báo cáo* (sang tổng hợp) hoặc *Chuyển trả* (bắt buộc lý do) →
Cán bộ tổng hợp *Tiếp nhận* → *Trình lãnh đạo phòng*. Mọi bước trả lại đều bắt buộc ghi lý do và xóa chữ ký cũ.

Tài khoản được tự tạo khi chạy (không cần nạp lại dữ liệu), mã đăng nhập mặc định `bc1953`:
`PGD17 - Người lập biểu`, `PGD17 - Kế toán trưởng`, `PGD17 - Trưởng phòng`, `Huy (NV2 - PGD 17)` (chỉ thấy PGD 17).
Tài khoản cũ "Phòng giao dịch 17" bị ẩn khỏi danh sách đăng nhập. Mỗi người tự nhập họ tên ở tab *In & xuất*;
biểu in/xuất của PGD 17 hiện "(đã ký)" dưới từng chức danh đã ký trong kỳ.
