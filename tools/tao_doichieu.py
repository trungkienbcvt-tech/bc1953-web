"""Tạo public/doichieu/js/doichieu.js (bản độc lập) từ mục "Đối chiếu số liệu" của public/tonghop/tonghop/app.js.
Chạy: python3 tools/tao_doichieu.py   (sau mỗi lần sửa phần đối chiếu trong app.js)
Bản độc lập không đăng nhập, không có danh mục dự án → bỏ cột Chủ đầu tư; file xuất lưu qua luuFile()."""
import re, shutil, pathlib
GOC = pathlib.Path(__file__).resolve().parent.parent
APP = GOC / 'public/tonghop/tonghop/app.js'
DC = GOC / 'public/doichieu/js/doichieu.js'
MOC = '// ---------------------------------------------------------------- Đối chiếu (giống mục "Đối chiếu số liệu" của hệ thống Tổng hợp)\n'

s = APP.read_text()
a = s.index("const B5S = { file: {} };"); b = s.index("// ================================================================ TAB 3: CỘNG THÊM")
blk = s[a:b]
def R(x, y, bat_buoc=True):
    global blk
    if bat_buoc: assert x in blk, x[:80]
    blk = blk.replace(x, y)
R('<th rowspan="2" class="cdtc">Chủ đầu tư</th>', '')
R("<td class=\"cdtc\">${esc(cdt.get(r.ma_da)?.cdt || '')}</td>", '')
R('colspan="${5 + (M.coPhong ? 1 : 0) + cts.length * 3}"', 'colspan="${4 + (M.coPhong ? 1 : 0) + cts.length * 3}"')
R('<label style="min-width:240px">Tìm mã / tên dự án / chủ đầu tư', '<label style="min-width:240px">Tìm mã / tên dự án')
R("|| norm(cdt.get(r.ma_da)?.cdt).includes(q)", '')
R("const dau = ['STT', 'Mã DA', 'Tên dự án', 'Chủ đầu tư', ", "const dau = ['STT', 'Mã DA', 'Tên dự án', ")
R("ws.addRow([i + 1, r.ma_da, r.ten, cdt.get(r.ma_da)?.cdt || '', ", "ws.addRow([i + 1, r.ma_da, r.ten, ")
R("[6, 11, 55, 32, ...(M.coPhong", "[6, 11, 60, ...(M.coPhong")
R("độc lập với mục Dữ liệu đầu vào, dùng chung cho 3 trang đối chiếu.", "dùng chung cho các trang đối chiếu, không gửi lên máy chủ.")
R("độc lập với mục Dữ liệu đầu vào, dùng chung cho các trang đối chiếu.", "dùng chung cho các trang đối chiếu, không gửi lên máy chủ.", False)
R("Tài khoản Phòng giao dịch xem được kết quả nhưng không xuất Excel.", "")
blk, n = re.subn(r"  const el = document\.createElement\('a'\);\n  el\.href = URL\.createObjectURL\(new Blob\(\[buf\][^\n]*\n  el\.download = (.*?); el\.click\(\);", lambda m: "  await luuFile(buf, " + m.group(1) + ");", blk)
assert n >= 2, n

cu = DC.read_text()
head = cu[:cu.index(MOC) + len(MOC)]
head = re.sub(r"const TABS = \{.*?\};", "const TABS = { b5: 'B5-01 ↔ Thông tư 37', b585: 'B5-01 ↔ Thông tư 85', tt3785: 'Thông tư 37 ↔ Thông tư 85', dtkb: 'Thông tư 85 ↔ ĐTKB-GD', dbhc: 'Mã địa bàn hành chính' };", head)
head = re.sub(r"const ICON_TAB = \{.*?\};", "const ICON_TAB = { b5: '🔍', b585: '🔎', tt3785: '🔁', dtkb: '🧾', dbhc: '📍' };", head)
head = re.sub(r"  try \{ \(\{.*?\}\)\[S\.tab\]\(v\); \} catch", "  try { ({ b5: viewB501, b585: viewB501, tt3785: viewTT3785, dtkb: viewDTKB, dbhc: viewDBHC })[S.tab](v); } catch", head)
DC.write_text(head + blk + "\nkhung();\nshow();\n")
for f in ['engine.js', 'ten_cdt_cu.js', 'b501.js', 'dt.js', 'dmhc.json']:
    shutil.copy(GOC / 'public/tonghop/tonghop' / f, GOC / 'public/doichieu/js' / f)
shutil.copy(GOC / 'public/tonghop/tonghop/tonghop.css', GOC / 'public/doichieu/css/tonghop.css')
print('đã tạo', DC)
