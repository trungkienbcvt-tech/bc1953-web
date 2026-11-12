"""Các chỉnh sửa mẫu so với file Excel gốc (chạy sau trich_mau.py).
Chạy: python3 tools/sua_mau.py tonghop/mau.json"""
import sys, json, copy
p = sys.argv[1]; m = json.load(open(p))

def chen_dong(mau, vi_tri, dong_moi):
    """Chèn dòng tại vi_tri, dời chỉ số dòng con phía sau."""
    n = len(dong_moi)
    for r in mau["rows"]:
        if "con" in r: r["con"] = [j + n if j >= vi_tri else j for j in r["con"]]
    mau["rows"][vi_tri:vi_tri] = dong_moi

# 1) BC tháng – dòng 13.2 "BQL khai thác Công trình thủy lợi Tuyên Quang":
#    file gốc chỉ lọc KBNN 2470 ở cột K, L, N, O → sót các dự án giao dịch tại KBNN 2461.
#    Sửa theo mẫu các đơn vị khác: dòng 13.2 lấy toàn bộ, kèm 2 dòng chi tiết KB 2461, 2470.
T = m["THANG"]
i = next(k for k, r in enumerate(T["rows"]) if r.get("stt") == "13.2")
r = T["rows"][i]
if r.get("kbnn"):
    con = copy.deepcopy(r)
    r.pop("kbnn")
    for s in r["o"].values(): s.pop("kb", None)
    chi_tiet = []
    for kb in ("2461", "2470"):
        d = copy.deepcopy(con); d["stt"] = ""; d["kbnn"] = kb
        for s in d["o"].values(): s["kb"] = True
        chi_tiet.append(d)
    chen_dong(T, i + 1, chi_tiet)
    print("Đã sửa dòng 13.2 BC tháng, chèn 2 dòng tại", i + 1)
else:
    print("Dòng 13.2 đã đúng mẫu, bỏ qua")
# 2) Chuẩn hóa chữ hoa/thường "UBND Xã ..." → "UBND xã ..." (vd UBND xã Sơn Thủy)
for k in m:
    for r in m[k]["rows"]:
        if r["ten"].startswith("UBND Xã "): r["ten"] = "UBND xã " + r["ten"][8:]
json.dump(m, open(p, "w"), ensure_ascii=False, indent=0)
