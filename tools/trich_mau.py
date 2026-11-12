"""Trích công thức 3 sheet báo cáo trong file Excel mẫu thành tonghop/mau.json.
Chạy: python3 tools/trich_mau.py <file.xlsx> tonghop/mau.json"""
import sys, re, json, openpyxl
from openpyxl.utils import column_index_from_string as ci, get_column_letter as gl

SRC = sys.argv[1]; OUT = sys.argv[2]
wb = openpyxl.load_workbook(SRC)
wbv = openpyxl.load_workbook(SRC, data_only=True)

RE_SUMIFS = re.compile(
    r"^=SUMIFS\('BC TT (85|15)'!\$?([A-Z]+):\$?[A-Z]+,'BC TT (?:85|15)'!\$?([A-Z]+):\$?[A-Z]+,B(\d+)"
    r"(,'BC TT (?:85|15)'!\$?C:\$?C,(?:'BC giai ngan thang'!)?C\d+)?\)/1000000([+-][\d.]+)?$")

def refs(f, col):
    """Danh sách dòng con từ công thức tổng (SUM(X1:X5)+X7...)."""
    out = []
    for a, b in re.findall(rf"SUM\({col}(\d+):{col}(\d+)\)", f):
        out += list(range(int(a), int(b) + 1))
    rest = re.sub(rf"SUM\({col}\d+:{col}\d+\)", "", f)
    out += [int(x) for x in re.findall(rf"(?<![A-Z]){col}(\d+)", rest)]
    return out

def build(sheet, id_, first, last, base, prev=None):
    ws, wv = wb[sheet], wbv[sheet]
    rows, idx = [], {}
    for r in range(first, last + 1):
        idx[r] = len(rows)
        rows.append({"r": r})
    for row in rows:
        r = row["r"]
        a, b = ws.cell(r, 1).value, ws.cell(r, 2).value
        row["stt"] = "" if a is None else str(a)
        row["ten"] = b or ""
        kb = ws.cell(r, 3).value if id_ == "THANG" else None
        if kb is not None: row["kbnn"] = str(kb)
        cells, kids = {}, None
        for col in base:
            f = ws[f"{col}{r}"].value
            if isinstance(f, str):
                m = RE_SUMIFS.match(f)
                if m:
                    assert int(m.group(4)) == r, (sheet, col, r)
                    c = {"src": m.group(2), "key": m.group(3)}
                    if m.group(5): c["kb"] = True
                    if m.group(6): c["add"] = float(m.group(6))
                    cells[col] = c
                    continue
                if f.startswith("="):
                    k = refs(f[1:], col)
                    if k:
                        kids = k if kids is None else kids
                        if k != kids: print("WARN kids differ", sheet, r, col, k, kids)
                        continue
                    print("WARN unparsed", sheet, col, r, f)
            elif f is not None:
                cells[col] = {"val": f}
        if kids is not None:
            row["loai"] = "nhom"
            row["con"] = [idx[k] for k in kids]
        else:
            row["loai"] = "ct"
            row["o"] = cells
        if prev:  # giá trị lũy kế tuần trước đang lưu tĩnh trong file
            pv = {c: wv[f"{c}{r}"].value for c in prev}
            if any(isinstance(v, (int, float)) for v in pv.values()):
                row["truoc"] = {c: v for c, v in pv.items() if isinstance(v, (int, float))}
    for row in rows: del row["r"]
    # Phần đầu bảng (tiêu đề + tiêu đề cột) để xuất Excel đúng mẫu
    head_cells = []
    for rr in ws.iter_rows(min_row=1, max_row=first - 1):
        for c in rr:
            v = wv[c.coordinate].value
            if v is not None and not (isinstance(v, str) and v.startswith("=")) and c.column <= 31:
                head_cells.append([c.coordinate, v])
    merges = [str(m) for m in ws.merged_cells.ranges if m.min_row < first and m.max_col <= 31]
    widths = {k: round(d.width, 1) for k, d in ws.column_dimensions.items() if d.width and ci(k) <= 31}
    return {"id": id_, "sheet": sheet, "rows": rows, "first": first,
            "head": head_cells, "merges": merges, "widths": widths,
            "ghi_chu": wv.cell(last + 1, 1).value}

ADD_COLS_W = list("DEUVXY")
mau = {
  "TT15": build("BC Tuan CT (TT15)", "TT15", 10, 167, ADD_COLS_W, prev=list("HIJKLMNOP")),
  "TT85": build("BC Tuan CT (TT85)", "TT85", 10, 167, ADD_COLS_W, prev=list("HIJKLMNOP")),
  "THANG": build("BC giai ngan thang", "THANG", 9, 236, list("EFKLNO")),
}
# tên khoá ở sheet nguồn
for k, m in mau.items():
    keys = {(c["src"][:0] + c["key"]) for r in m["rows"] for c in r.get("o", {}).values() if "key" in c}
    print(k, "key cols", keys, "rows", len(m["rows"]))
json.dump(mau, open(OUT, "w"), ensure_ascii=False, indent=0)
