// =====================================================================
//  BIỂU ĐỐI CHIẾU THBC (mẫu "Biểu đối chiếu THBC.xlsx")
//   - Đối chiếu KPI : lũy kế giải ngân (tổng / KHV kéo dài / KHV năm 2026, mỗi phần TT KLHT + tạm ứng)
//   - Đối chiếu 1953: chỉ cột tổng giải ngân lũy kế
//  Mỗi biểu lập được từ số liệu TT15 hoặc TT85, theo chủ đầu tư / đơn vị và KBNN nơi giao dịch.
//  Khớp dự án → dòng biểu: tên đơn vị (cột "Chủ đầu tư" của danh mục dự án) + phòng giao dịch
//  (lấy theo khối KBNN của file hệ thống; thiếu thì theo cột KBNN của danh mục).
// =====================================================================

// Mã KBNN trong file hệ thống → phòng (đã đối chiếu với cột KBNN của danh mục dự án)
export const KB_PHONG = {
  2461: 'NV2', 2462: '19', 2465: '17', 2466: '18', 2470: '20', 2471: '21',
  2472: '22', 2473: '23', 2474: '24', 2475: '25', 2476: '26', 2477: '27',
};
export const tenPhong = p => !p ? '(chưa rõ KBNN)' : p === 'NV2' ? 'Phòng Nghiệp vụ 2' : 'Phòng giao dịch ' + p;

// Cột số liệu lũy kế của file hệ thống: H/I = KHV kéo dài (KLHT/tạm ứng), K/L = KHV năm 2026
const COT_NGUON = { TT15: { H: 'K', I: 'L', K: 'N', L: 'O' }, TT85: { H: 'L', I: 'M', K: 'R', L: 'S' }, TT37: { H: 'K', I: 'L', K: 'N', L: 'O' } };
export const COT_KPI = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
export const TEN_COT = {
  D: 'Tổng cộng', E: 'Thanh toán KLHT', F: 'Tạm ứng', G: 'Tổng cộng', H: 'Thanh toán KLHT', I: 'Tạm ứng',
  J: 'Tổng cộng', K: 'Thanh toán KLHT', L: 'Tạm ứng',
};
export const TEN_COT_DAY = {
  D: 'Tổng giải ngân lũy kế', E: 'Tổng – TT KLHT', F: 'Tổng – Tạm ứng', G: 'KHV kéo dài', H: 'KHV kéo dài – TT KLHT',
  I: 'KHV kéo dài – Tạm ứng', J: 'KHV năm 2026', K: 'KHV 2026 – TT KLHT', L: 'KHV 2026 – Tạm ứng',
};
const tinhCot = o => { o.G = o.H + o.I; o.J = o.K + o.L; o.E = o.H + o.K; o.F = o.I + o.L; o.D = o.G + o.J; return o; };
const rong = () => ({ D: 0, E: 0, F: 0, G: 0, H: 0, I: 0, J: 0, K: 0, L: 0 });
const cong = (a, b) => { for (const c of COT_KPI) a[c] += b[c] || 0; return a; };

// Chuẩn hóa tên đơn vị để khớp danh mục ↔ mẫu biểu (viết tắt, "tỉnh Tuyên Quang", dấu kiểu cũ/mới…)
export function chuanDV(s) {
  return String(s || '').normalize('NFC').toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/oà/g, 'òa').replace(/oá/g, 'óa').replace(/oả/g, 'ỏa').replace(/oã/g, 'õa').replace(/oạ/g, 'ọa')
    .replace(/uỳ/g, 'ùy').replace(/uý/g, 'úy').replace(/uỷ/g, 'ủy').replace(/uỹ/g, 'ũy').replace(/uỵ/g, 'ụy')
    .replace(/&/g, ' và ')
    .replace(/^\s*ubnd\s+/, '')
    .replace(/\bbqlda\b/g, 'ban qlda').replace(/\bbql\b/g, 'ban ql')
    .replace(/(^|\s)bch\s+biên phòng/g, '$1ban chỉ huy bộ đội biên phòng').replace(/(^|\s)bch\s+quân sự/g, '$1bộ chỉ huy quân sự')
    .replace(/^\s*tt\s+/, 'trung tâm ').replace(/^\s*tỉnh đoàn\b/, 'đoàn tncs hồ chí minh')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+tỉnh tuyên quang\b/g, '').replace(/\s+tuyên quang\b/g, '').replace(/\s+tỉnh\s*$/g, '')
    .replace(/\s+/g, ' ').trim();
}
// "Phòng giao dịch số 17" / "P 17" / "Phòng giao dịch 17" → "17"; "Phòng Nghiệp vụ 2" / "PNV 2" → "NV2"
export function chuanPhong(s) {
  const t = String(s || '').normalize('NFC').toLowerCase();
  if (!t.trim()) return '';
  if (/nghiệp vụ|\bnv\s*2\b|\bpnv/.test(t)) return 'NV2';
  const m = /(\d{2})\s*[a-z]?\s*$/.exec(t.trim());
  return m ? m[1] : '';
}

// mau   : mau_dt.json
// rows  : dòng nguồn đã gắn chủ đầu tư (ganCDT) – {ma_da, ten, kb, so, cdt, cdt2}
// cdt   : danh mục dự án (để lấy KBNN khi file nguồn không có khối KBNN)
export function tinhDT(mau, loai, rows, cdt = []) {
  const cot = COT_NGUON[loai];
  const kbDM = new Map(cdt.map(d => [String(d.ma_da), d.kbnn]));
  // chỉ mục dòng chi tiết của mẫu: tên đơn vị + phòng
  const leaf = new Map(), coDV = new Set();
  mau.rows.forEach((r, i) => { if (r.kieu === 'ct') { leaf.set(chuanDV(r.dv) + '|' + chuanPhong(r.c), i); coDV.add(chuanDV(r.dv)); } });
  const o = mau.rows.map(() => ({ ...rong(), duAn: [] }));
  const thua = new Map();
  for (const r of rows) {
    const v = rong();
    for (const [k, src] of Object.entries(cot)) v[k] = (r.so?.[src] || 0) / 1e6;
    tinhCot(v);
    const phong = KB_PHONG[r.kb] || chuanPhong(kbDM.get(String(r.ma_da)));
    const da = { ma_da: r.ma_da, ten: r.ten, dv: r.cdt || '', phong, v };
    const kdv = chuanDV(r.cdt);
    const i = r.cdt ? leaf.get(kdv + '|' + phong) : undefined;
    if (i !== undefined) { cong(o[i], v); o[i].duAn.push(da); continue; }
    const ly_do = !r.cdt ? 'Mã dự án chưa có trong danh mục dự án'
      : coDV.has(kdv) ? `Đơn vị có trong biểu nhưng chưa có dòng giao dịch tại ${tenPhong(phong)}`
      : 'Chủ đầu tư/đơn vị chưa có trong mẫu biểu';
    if (!COT_KPI.some(c => v[c])) continue;        // dự án chưa giải ngân: không ảnh hưởng số liệu
    const k = (r.cdt || '(chưa có trong danh mục)') + '|' + phong;
    let t = thua.get(k);
    if (!t) thua.set(k, t = { dv: r.cdt || '(Mã dự án chưa có trong danh mục)', phong, ly_do, ...rong(), duAn: [] });
    cong(t, v); t.duAn.push(da);
  }
  // cộng dồn dòng nhóm / khối (theo cấu trúc mẫu)
  const xong = new Set();
  const tong = i => {
    if (xong.has(i)) return o[i];
    const r = mau.rows[i];
    if (r.con) for (const j of r.con) cong(o[i], tong(j));
    xong.add(i); return o[i];
  };
  mau.rows.forEach((_, i) => tong(i));
  const ds = [...thua.values()].sort((a, b) => a.dv.localeCompare(b.dv, 'vi') || a.phong.localeCompare(b.phong));
  const khoiThua = ds.reduce((s, t) => cong(s, t), rong());
  cong(o[0], khoiThua);      // TỔNG CỘNG luôn bằng tổng file nguồn
  return { loai, dong: o, thua: ds, khoiThua, soDuAn: rows.length };
}

// So sánh 2 biểu cùng mẫu (TT15 – TT85), theo từng dòng mẫu và từng dòng chưa khớp
export function soSanhDT(mau, a, b) {
  const lech = (x, y) => Object.fromEntries(COT_KPI.map(c => [c, (x?.[c] || 0) - (y?.[c] || 0)]));
  const dong = mau.rows.map((r, i) => ({ i, tt15: a.dong[i], tt85: b.dong[i], lech: lech(a.dong[i], b.dong[i]) }));
  const m = new Map();
  for (const [t, nh] of [[a, 'tt15'], [b, 'tt85']]) for (const x of t.thua) {
    const k = x.dv + '|' + x.phong;
    const e = m.get(k) || { dv: x.dv, phong: x.phong, ly_do: x.ly_do, tt15: null, tt85: null };
    e[nh] = x; m.set(k, e);
  }
  const thua = [...m.values()].map(e => ({ ...e, lech: lech(e.tt15, e.tt85) }));
  return { dong, thua, khoi: { tt15: a.khoiThua, tt85: b.khoiThua, lech: lech(a.khoiThua, b.khoiThua) } };
}

// Danh sách dự án ghép từ 2 nguồn (để xem chi tiết chênh lệch một dòng)
export function ghepDuAn(ds15 = [], ds85 = []) {
  const m = new Map();
  for (const [ds, nh] of [[ds15, 'tt15'], [ds85, 'tt85']]) for (const d of ds) {
    const e = m.get(d.ma_da) || { ma_da: d.ma_da, ten: d.ten, dv: d.dv, phong: d.phong, tt15: rong(), tt85: rong(), co15: false, co85: false };
    cong(e[nh], d.v); e['co' + nh.slice(2)] = true; if (!e.ten) e.ten = d.ten; m.set(d.ma_da, e);
  }
  return [...m.values()].map(e => ({ ...e, lech: Object.fromEntries(COT_KPI.map(c => [c, e.tt15[c] - e.tt85[c]])) }));
}
