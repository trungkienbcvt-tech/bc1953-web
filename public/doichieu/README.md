# Đối chiếu số liệu TABMIS – THBC (bản độc lập)

Trang web tĩnh, không đăng nhập, không dùng máy chủ/cơ sở dữ liệu: mọi file Excel chỉ đọc và xử lý trên máy người dùng.

Ba cặp đối chiếu (chọn ở menu trái, hoặc mở thẳng bằng `#b5`, `#b585`, `#tt3785`):

| Trang | Bên A | Bên B | Chỉ tiêu |
|---|---|---|---|
| B5-01 ↔ Thông tư 37 | BC TT37 (mẫu 01b/TTKHN) | B5-01 NS tỉnh + NS xã | Cột F ⇄ cột J; cột H ⇄ cột M + N |
| B5-01 ↔ Thông tư 85 | BC TT85 (biểu 03KBQT) | B5-01 NS tỉnh + NS xã | Cột V ⇄ cột P (thực chi); cột W ⇄ cột Q (dư tạm ứng chưa thanh toán) |
| Thông tư 37 ↔ Thông tư 85 | BC TT37 | BC TT85 | F ⇄ J; H ⇄ P; I ⇄ K + Q (theo dự án và mã KBNN) |

Kết quả: tổng hợp theo chỉ tiêu, thống kê theo phòng giao dịch, chi tiết dự án (mỗi chỉ tiêu một nhóm cột), xuất Excel.

## Cấu trúc

```
index.html          trang chính
css/style.css       giao diện chung
css/tonghop.css     giao diện bảng, menu, đối chiếu
js/doichieu.js      khung trang + màn hình đối chiếu
js/b501.js          đọc B5-01, BC TT37 (01b), so sánh theo dự án
js/engine.js        đọc file hệ thống (BC TT85), nhận đơn vị đồng / triệu đồng
js/dt.js            danh sách mã KBNN → phòng giao dịch
```

Thư viện tải từ CDN khi chạy: SheetJS (đọc Excel), ExcelJS (xuất Excel).

## Chạy / triển khai

- Chạy thử trên máy: mở bằng một máy chủ tĩnh bất kỳ, ví dụ `npx serve .` hoặc `python -m http.server`, rồi vào `http://localhost:…/` (không mở trực tiếp file:// vì trình duyệt chặn ES module).
- Triển khai: chép cả thư mục lên bất kỳ dịch vụ web tĩnh nào (Vercel, Netlify, GitHub Pages…). Với Vercel: tạo project mới, chọn thư mục này làm Root Directory, Framework “Other”, không cần lệnh build.

## Chấm số liệu theo Mục lục ngân sách (`#cham`)

Nạp file Báo cáo chi tiết số dư `P_BAOCAOSODU_12_COA` (một hoặc nhiều file, đọc mọi sheet), chấm từng dòng:

- **Mã đã bãi bỏ** (Chương, Khoản – mã ngành kinh tế, Tiểu mục – mã NDKT), chỉ tính khi số liệu đến sau ngày hiệu lực.
- **Mã ĐBHC theo cấp ngân sách**: cấp 2 (TK 15xx, 81xx) phải là mã tỉnh; cấp 4 (TK 15, 17, 18, 81, 82) phải là xã trong tỉnh và đúng xã ghi trong tên đơn vị; TK 82xx không để 00000.
- **Mã cấp ngân sách 3** (cấp huyện) không còn sử dụng.

Xuất Excel đúng mẫu: sheet Tổng hợp + mỗi sheet gốc giữ nguyên tiêu đề, cột, thêm cột "Lỗi", "Ghi chú".

Kho dữ liệu `js/mlns.json` (chương, loại – khoản, mục – tiểu mục, CTMT, mã bãi bỏ) dựng từ file MLNS Excel bằng
`python3 tools/build_mlns.py <MLNS.xlsx> public/doichieu/js/mlns.json <tt123.txt>`; danh sách mã bãi bỏ khai báo trong script.
