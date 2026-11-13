"""Trích cấu trúc dòng của "Biểu đối chiếu THBC" (sheet Đối chiếu KPI) → public/tonghop/tonghop/mau_dt.json
Dùng: python3 tools/trich_mau_dt.py <file.xlsx>"""
import json, re, sys, openpyxl
wb = openpyxl.load_workbook(sys.argv[1])
ws = wb['Đối chiếu KPI']
first = next(r for r in range(1, 40) if ws.cell(r, 2).value == 'TỔNG CỘNG')
rows, by_excel = [], {}
r = first
while ws.cell(r, 2).value not in (None, ''):
    by_excel[r] = len(rows)
    rows.append({'r': r, 'a': str(ws.cell(r, 1).value or ''), 'b': str(ws.cell(r, 2).value).strip(),
                 'c': str(ws.cell(r, 3).value or '').strip(), 'f': ws.cell(r, 4).value})
    r += 1
for x in rows:
    f = x.pop('f')
    kids = None
    if isinstance(f, str) and f.startswith('='):
        m = re.match(r'=SUM\(D(\d+):D(\d+)\)', f)
        kids = list(range(int(m[1]), int(m[2]) + 1)) if m else [int(n) for n in re.findall(r'D(\d+)', f)]
        kids = [by_excel[k] for k in kids]
    x['con'] = kids
par = {}
for i, x in enumerate(rows):
    for k in x['con'] or []: par[k] = i
for i, x in enumerate(rows):
    x['kieu'] = 'tong' if i == 0 else ('khoi' if par.get(i) == 0 else ('nhom' if x['con'] else 'ct'))
    if x['con'] is None:
        b = x['b']
        # Tên đơn vị dùng để khớp dự án: "Giao dịch tại" / "(trực tiếp)" lấy tên dòng cha
        if b == 'Giao dịch tại' or b.endswith('(trực tiếp)'): x['dv'] = rows[par[i]]['b']
        else: x['dv'] = b
    del x['r']
ghi = ws.cell(r + 1, 1).value
out = {'rows': rows, 'ghi_chu': ghi}
json.dump(out, open('public/tonghop/tonghop/mau_dt.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(rows), 'dòng;', sum(1 for x in rows if x['kieu'] == 'ct'), 'dòng chi tiết')
