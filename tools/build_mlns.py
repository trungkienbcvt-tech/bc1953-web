# Dựng kho dữ liệu Mục lục NSNN (TT 130/2025, cập nhật TT 123/2026) -> mlns.json
import openpyxl, json, re, sys
src, out = sys.argv[1], sys.argv[2]
wb = openpyxl.load_workbook(src, data_only=True)
clean = lambda s: re.sub(r'\s+', ' ', str(s or '').replace('“', '').replace('”', '')).strip()
bo = lambda s: '(bãi bỏ)' in re.sub(r'\(\s*', '(', s.lower())
khong_bo = lambda s: re.sub(r'\s*\(\s*bãi bỏ\s*\)', '', s, flags=re.I).strip()
# Chương
chuong = {}
for r in wb['Chương'].iter_rows(min_row=5, values_only=True):
    if isinstance(r[0], int): chuong[f'{r[0]:03d}'] = khong_bo(clean(r[1]))
# Loại - Khoản
loai, khoan, cur = {}, {}, None
for r in wb['Ngành'].iter_rows(min_row=5, values_only=True):
    if not isinstance(r[2], int): continue
    ma, ten = f'{r[2]:03d}', clean(r[3])
    if r[1] == 'Loại': cur = ma; loai[ma] = ten
    else: khoan[ma] = [khong_bo(ten), cur]
# Mục - Tiểu mục (4 số). Mục nằm cột B, Tiểu mục cột C
muc, tm, mcur = {}, {}, None
ctmt, pl4 = {}, False
for r in wb['NDKT'].iter_rows(min_row=6, values_only=True):
    b, c, ten = r[1], r[2], clean(r[3])
    if isinstance(r[0], str) and r[0].strip().upper().startswith('PHỤ LỤC IV'): pl4 = True
    if pl4:   # Phụ lục IV: mã chương trình, mục tiêu (cột A/B/C)
        for v in r[:3]:
            if isinstance(v, int) and ten and v > 3: ctmt[f'{v:04d}'] = ten
        continue
    if b is not None and re.fullmatch(r'\d{3,4}', str(b).strip()) and ten:
        mcur = str(b).strip().zfill(4); muc[mcur] = khong_bo(ten)
    if c is not None and re.fullmatch(r'\d{3,4}', str(c).strip()) and ten:
        tm[str(c).strip().zfill(4)] = [khong_bo(ten), mcur]
# Phụ lục IV bổ sung theo Thông tư 123 (cặp dòng mã / tên trong file docx)
if len(sys.argv) > 3:
    t = open(sys.argv[3], encoding='utf-8').read().split('\n')
    i = next(k for k, x in enumerate(t) if x.startswith('DANH MỤC MÃ CHƯƠNG TRÌNH'))
    for k in range(i, len(t) - 1):
        if re.fullmatch(r'\d{4}', t[k].strip()) and not re.fullmatch(r'\d{4}', t[k + 1].strip()): ctmt[t[k].strip()] = clean(t[k + 1])
# Mã bãi bỏ (Thông tư 123/2026/TT-BTC, hiệu lực 21/8/2026)
VB, TU = 'Thông tư 123/2026/TT-BTC', '2026-08-21'
baibo = [
  {'phan': 'chuong', 'ma': '810', 'ten': 'Ban chỉ huy quân sự xã', 'tu': TU, 'vb': VB, 'dieu': 'Điều 2 khoản 4'},
  {'phan': 'khoan', 'ma': '121', 'ten': 'Chuyển đổi số', 'tu': TU, 'vb': VB, 'dieu': 'Điều 3 khoản 3 điểm b', 'thay': 'Khoản 122–126'},
  {'phan': 'khoan', 'ma': '314', 'ten': 'Công nghệ thông tin', 'tu': TU, 'vb': VB, 'dieu': 'Điều 3 khoản 5 điểm a'},
  {'phan': 'khoan', 'ma': '315', 'ten': 'Chuyển đổi số, phát triển chính phủ số, kinh tế số, xã hội số', 'tu': TU, 'vb': VB, 'dieu': 'Điều 3 khoản 5 điểm b', 'thay': 'Khoản 122–126'},
  {'phan': 'ndkt', 'ma': '7054', 'ten': 'Xây dựng, nâng cấp phần mềm công nghệ thông tin', 'tu': TU, 'vb': VB, 'dieu': 'Điều 4 khoản 17 điểm b', 'thay': 'Tiểu mục 9304, 7057'},
  {'phan': 'ndkt', 'ma': '7056', 'ten': 'Phần mềm, công nghệ số, nền tảng số phục vụ chuyển đổi số', 'tu': TU, 'vb': VB, 'dieu': 'Điều 4 khoản 17 điểm c', 'thay': 'Tiểu mục 9304, 7058'},
]
# đối chiếu: mã đánh dấu "(bãi bỏ)" trong file MLNS phải có trong danh sách trên
dau = {('chuong', f'{r[0]:03d}') for r in wb['Chương'].iter_rows(min_row=5, values_only=True) if isinstance(r[0], int) and bo(clean(r[1]))}
dau |= {('khoan', f'{r[2]:03d}') for r in wb['Ngành'].iter_rows(min_row=5, values_only=True) if isinstance(r[2], int) and bo(clean(r[3]))}
dau |= {('ndkt', str(r[2]).strip()) for r in wb['NDKT'].iter_rows(min_row=6, values_only=True) if r[2] and bo(clean(r[3]))}
assert dau == {(b['phan'], b['ma']) for b in baibo}, dau
d = {'nguon': {'van_ban': 'Thông tư 130/2025/TT-BTC, sửa đổi bởi Thông tư 123/2026/TT-BTC (hiệu lực 21/8/2026)', 'file': src.split('/')[-1]},
     'chuong_khoang': {'1': ['001', '399'], '2': ['400', '599'], '4': ['800', '989']},
     'chuong': chuong, 'loai': loai, 'khoan': khoan, 'muc': muc, 'ndkt': tm, 'ctmt': ctmt, 'baibo': baibo}
json.dump(d, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(chuong), 'chương;', len(loai), 'loại;', len(khoan), 'khoản;', len(muc), 'mục;', len(tm), 'tiểu mục;', len(ctmt), 'mã CTMT;', len(baibo), 'mã bãi bỏ')
