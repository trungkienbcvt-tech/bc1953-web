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
