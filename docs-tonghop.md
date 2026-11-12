# Hệ thống báo cáo giải ngân vốn đầu tư công – KBNN Khu vực VIII

Thay cho file Excel **"BC Chủ đầu tư 2026 – NV2"**: nạp 3 sheet đầu vào, phần mềm tự lập 3 báo cáo đầu ra đúng mẫu.

| Đầu vào (sheet) | Dùng để |
|---|---|
| `CDT` | Mã dự án → Chủ đầu tư (cột C, dùng cho BC tháng) và Chủ đầu tư 2 (cột D, dùng cho BC tuần) |
| `BC TT 85` | Số liệu xuất từ hệ thống theo mẫu 03KBQT |
| `BC TT 15` | Số liệu xuất từ hệ thống theo mẫu 01b/TTKHN |

| Đầu ra | Công thức thay thế |
|---|---|
| BC tuần CT (TT15) | `SUMIFS('BC TT 15', cột Q = tên CĐT)/1.000.000` |
| BC tuần CT (TT85) | `SUMIFS('BC TT 85', cột Z = tên CĐT)/1.000.000` |
| BC giải ngân tháng | `SUMIFS('BC TT 85', cột Y = tên CĐT, cột C = mã KBNN)/1.000.000` |

Đã đối chiếu với file Excel ngày 08/11/2026: **khớp 100%** (10.480 ô số liệu của 3 báo cáo).

**Các tab**
- **Dữ liệu đầu vào**: chọn file Excel (cả file 3 sheet hoặc từng file), phần mềm tự nhận sheet → *Cập nhật lên máy chủ*.
  Mục *Kiểm tra dữ liệu* báo mã dự án chưa có trong sheet CDT và chủ đầu tư không khớp dòng nào trên báo cáo (số liệu bị sót).
- **Danh mục dự án**: toàn bộ sheet CDT; tìm theo mã/tên, lọc theo chủ đầu tư, KBNN, Đặc thù (Chuyển đổi số, Trọng điểm…), CTMTQG giai đoạn 2021-2025, CTMTQG giai đoạn 2026-2030 (cột Loại CT tạm ẩn, vẫn có trong file Excel xuất ra).
  Gõ trực tiếp vào 3 cột phân loại (tự lưu), *Sửa* / *+ Thêm dự án*, *Gán phân loại hàng loạt* (dán danh sách mã), *Xuất Excel* đúng bố cục sheet CDT.
  Khi tải lại sheet CDT: phân loại đã sửa trên web và dự án thêm trên web được giữ nguyên.
  Nút *⚠ Hoàn thiện dự án đã phát sinh giải ngân*: dự án có số liệu trong BC TT 85/15 nhưng chưa có trong danh mục, hoặc chủ đầu tư
  chưa đúng tên trên mẫu báo cáo; điền sẵn mã, tên, phòng giao dịch – các phòng chỉ cần chọn chủ đầu tư (bắt buộc đúng tên trên mẫu).
- **Báo cáo** (Phòng giao dịch: chỉ xem, so sánh, ghi chú – không in, không xuất Excel): chọn báo cáo, sửa dòng thời gian / số văn bản → *Xuất Excel* (đúng mẫu, đơn vị triệu đồng) hoặc *In*.
  Với báo cáo tuần, cột "Lũy kế đến tuần trước liền kề" lấy từ **kỳ đã chốt** gần nhất. *Lưu kỳ báo cáo* + tích *Chốt* để tuần sau dùng làm tuần trước.
  Lần đầu: bấm *Nhập lũy kế tuần trước từ file Excel…* và chọn file báo cáo tuần đã lập.
- **Đối chiếu tổng số** (cuối tab Báo cáo, theo báo cáo đang chọn): so dòng TỔNG của file hệ thống ↔ cộng các KBNN ↔ cộng chi tiết dự án ↔ số trên báo cáo,
  tách rõ phần không vào báo cáo (thiếu mã CDT, chủ đầu tư/KBNN không có dòng trên mẫu) và phần cộng thêm; cột *Cân đối* phải ✓.
- **So sánh TT15 ↔ TT85** (nút trong tab Báo cáo): tổng theo 12 chỉ tiêu → từng chủ đầu tư (lọc dòng lệch, sắp theo chênh lớn nhất) →
  *Xem dự án*: dự án nào lệch, dự án chỉ có ở một file, phần chênh do cộng thêm; xuất Excel so sánh.
- **Đối chiếu THBC – B5-01** (Phòng NV2): chọn 3 file 2461_TT15 (.xls/.xlsx), B5-01 NS xã, B5-01 NS tỉnh (tự nhận dạng) → so sánh
  "Kế hoạch vốn kéo dài năm trước chuyển sang" (TT15) với "Dư dự toán năm trước chuyển sang" (B5-01 xã + tỉnh) đến từng dự án,
  kèm dư tạm ứng năm trước để tham khảo, nhận xét nguyên nhân, xuất Excel. Xử lý trên trình duyệt, không lưu lên máy chủ (`tonghop/b501.js`).
- **Cộng thêm**: các khoản cộng tay (trong Excel là `…/1000000 + 10000`), sửa / tắt được, có ghi chú lý do.
- **Kỳ đã lưu**: xem lại, xuất Excel, chốt / bỏ chốt, xóa.

**Đăng nhập**: màn hình có 2 ô chọn nhanh (chưa cần mật khẩu, cấu hình ở `config.js` → `TONGHOP_PHONG`):
*Phòng Nghiệp vụ 2* (tài khoản `pnv2`, toàn quyền, cần nhập mật khẩu) và *Phòng giao dịch* (tài khoản `pgd`: hoàn thiện Danh mục dự án; xem tab Báo cáo, so sánh TT15–TT85, ghi chú; không in, không xuất).
Hai tài khoản này không có quyền gì bên hệ thống CV 1953. Muốn bắt nhập mật khẩu: xóa `ma` trong `TONGHOP_PHONG` và đổi mật khẩu 2 tài khoản trong Supabase → Authentication → Users.
Ngoài ra vẫn đăng nhập được bằng tài khoản hệ thống (mục "Đăng nhập bằng tài khoản khác").

**Quyền**: Phòng NV2, Quản trị, KBNN (người nhận, người duyệt) được cập nhật; Phòng giao dịch và tài khoản Tổng hợp chỉ xem. 

**Cài đặt**: chạy `supabase/tonghop.sql` rồi `supabase/tonghop_seed.sql` trong Supabase → SQL Editor (đã chạy sẵn trên dự án `bcgiaingan`).

**Khi mẫu báo cáo thay đổi** (thêm/bớt chủ đầu tư, đổi tên): sửa file Excel mẫu rồi chạy
`python3 tools/trich_mau.py "BC_Chu_dau_tu.xlsx" tonghop/mau.json` rồi `python3 tools/sua_mau.py tonghop/mau.json` để cập nhật `tonghop/mau.json`, commit lên GitHub.

**Khác với file Excel gốc** (đã sửa trong `tools/sua_mau.py`): BC tháng dòng 13.2 "BQL khai thác Công trình thủy lợi Tuyên Quang" trước chỉ lấy dự án tại KBNN 2470
(sót 964,7 tr TT KLHT và 3.073,3 tr tạm ứng năm 2026 của các dự án tại KBNN 2461, số liệu 08/11/2026); nay lấy toàn bộ, kèm 2 dòng chi tiết KB 2461, KB 2470.


## Cấu trúc
| File | Nội dung |
|---|---|
| `index.html` | Trang web |
| `config.js` | Kết nối Supabase, 2 ô đăng nhập theo phòng |
| `tonghop/app.js` | Giao diện |
| `tonghop/engine.js` | Bộ tính thay công thức Excel (VLOOKUP, SUMIFS), đối chiếu, so sánh TT15–TT85 |
| `tonghop/mau.json` | Mẫu 3 báo cáo (trích từ file Excel bằng `tools/trich_mau.py` + `tools/sua_mau.py`) |
| `supabase/tonghop.sql` | Bảng dữ liệu, phân quyền, hàm (dùng chung dự án Supabase `bcgiaingan`) |

Triển khai: Vercel → Import repo này → Framework: **Other**, không cần lệnh build → Deploy.
