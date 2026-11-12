// =====================================================================
//  BỘ TÍNH BÁO CÁO TỔNG HỢP THEO CHỦ ĐẦU TƯ
//  Thay cho các công thức VLOOKUP / SUMIFS trong file Excel
//  "BC Chu dau tu 2026" – dùng được cả trên trình duyệt và Node.
// =====================================================================

// ---- Cấu hình sheet nguồn ------------------------------------------------
// Cột số liệu cần đọc ở mỗi sheet nguồn (theo vị trí cột trong file xuất từ hệ thống)
export const NGUON = {
  TT85: { ten: 'BC TT 85', cotMa: 'D', cotDiaDiem: 'C', cotSo: ['J', 'L', 'M', 'P', 'R', 'S'] },
  TT15: { ten: 'BC TT 15', cotMa: 'D', cotDiaDiem: null, cotSo: ['F', 'H', 'K', 'L', 'N', 'O'] },
};
// Cột "khóa" của sheet nguồn → cột lấy từ sheet CDT (VLOOKUP cột 3 / cột 4)
//   TT85: Y = Chủ đầu tư (CDT cột C), Z = Chủ đầu tư 1 (CDT cột D)
//   TT15: Q = Chủ đầu tư (CDT cột D)
const KHOA = { TT85: { Y: 'cdt', Z: 'cdt2' }, TT15: { Q: 'cdt2' } };
// Báo cáo → sheet nguồn
export const BAO_CAO = {
  TT15: { ten: 'Báo cáo tuần theo chủ đầu tư (TT15)', nguon: 'TT15', loai: 'TUAN' },
  TT85: { ten: 'Báo cáo tuần theo chủ đầu tư (TT85)', nguon: 'TT85', loai: 'TUAN' },
  THANG: { ten: 'Báo cáo giải ngân tháng', nguon: 'TT85', loai: 'THANG' },
};

// ---- Tiện ích ------------------------------------------------------------
export const colIdx = c => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const txt = v => (v === null || v === undefined) ? '' : String(v).trim();
const key = v => txt(v).toLowerCase();   // SUMIFS/VLOOKUP không phân biệt hoa thường
export function soTien(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const t = txt(v);
  if (!t || t === '-') return 0;
  // "1.234.567" hoặc "1,234,567" hoặc "(1.234)"
  const neg = /^\(.*\)$/.test(t);
  const n = Number(t.replace(/[()\s]/g, '').replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
}

// ---- Đọc sheet CDT (mảng hàng, header:1) --------------------------------
// Cột: A Mã DA | B Tên DA | C Chủ đầu tư | D Chủ đầu tư 2 | E KBNN giao dịch | G Đặc thù | H Loại CT | I CTMTQG
export function docCDT(rows) {
  const out = [];
  let start = rows.findIndex(r => /mã\s*dự\s*án/i.test(txt(r?.[0])));
  // Cột "CTMTQG ... 2026-2030" (nếu file có) – tìm theo tiêu đề
  const iCT2630 = start >= 0 ? (rows[start] || []).findIndex(h => /2026\s*[-–]\s*2030/.test(txt(h))) : -1;
  start = start < 0 ? 0 : start + 1;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i] || [];
    const ma = txt(r[0]);
    if (!ma) continue;
    out.push({ ma_da: ma, ten_da: txt(r[1]), cdt: txt(r[2]), cdt2: txt(r[3]), kbnn: txt(r[4]),
      dac_thu: txt(r[6]), loai_ct: txt(r[7]), ctmt: txt(r[8]), ctmt_2630: iCT2630 >= 0 ? txt(r[iCT2630]) : '' });
  }
  return out;
}

// ---- Chuẩn hóa danh mục khi nạp sheet CDT ------------------------------
// Tên KBNN: "P 17" → "Phòng giao dịch số 17", "PNV 2" → "Phòng Nghiệp vụ 2"
export function chuanHoaKBNN(v) {
  const t = txt(v);
  if (/^p\s*nv\s*2$/i.test(t)) return 'Phòng Nghiệp vụ 2';
  const m = /^p\s*(\d+\w*)$/i.exec(t);
  return m ? 'Phòng giao dịch số ' + m[1] : t;
}
// Tên chủ đầu tư: nếu chỉ khác chữ hoa/thường với tên trên mẫu báo cáo thì lấy đúng tên trên mẫu
export function chuanHoaCDT(rows, mau) {
  const chuan = new Map();
  for (const m of Object.values(mau)) for (const r of m.rows) if (r.loai === 'ct' && r.ten) chuan.set(key(r.ten), r.ten);
  let doi = 0;
  const f = t => { const c = chuan.get(key(t)); if (c && c !== t) { doi++; return c; } return t; };
  const out = rows.map(r => ({ ...r, cdt: f(r.cdt), cdt2: f(r.cdt2), kbnn: chuanHoaKBNN(r.kbnn) }));
  return { rows: out, doi };
}

// ---- Đọc sheet nguồn TT85 / TT15 ----------------------------------------
// Bỏ phần tiêu đề: bắt đầu sau dòng đánh số cột (A=1, B=2). Chỉ giữ dòng có mã dự án.
export function docNguon(rows, loai) {
  const cfg = NGUON[loai];
  let start = rows.findIndex(r => txt(r?.[0]) === '1' && txt(r?.[1]) === '2');
  start = start < 0 ? 0 : start + 1;
  const iMa = colIdx(cfg.cotMa), iDD = cfg.cotDiaDiem ? colIdx(cfg.cotDiaDiem) : -1;
  const out = [];
  let kb = '';
  for (let i = start; i < rows.length; i++) {
    const r = rows[i] || [];
    const ma = txt(r[iMa]);
    if (!ma) { if (laDongKB(r)) kb = txt(r[0]); continue; }
    const so = {};
    for (const c of cfg.cotSo) { const v = soTien(r[colIdx(c)]); if (v) so[c] = v; }
    out.push({ dong: i + 1, ma_da: ma, dia_diem: iDD >= 0 ? txt(r[iDD]) : '', kb, ten: txt(r[1]), so });
  }
  return out;
}
// Dòng tiêu đề khối KBNN / PGD: cột A là mã 4 số, cột B có chữ "KBNN"
const laDongKB = r => /^\d{4}$/.test(txt(r?.[0])) && /kbnn|kho bạc/i.test(txt(r?.[1]));

// Số tổng do chính file hệ thống in ra: dòng TỔNG đầu bảng + dòng tổng từng KBNN
export function docTong(rows, loai) {
  const cfg = NGUON[loai];
  let start = rows.findIndex(r => txt(r?.[0]) === '1' && txt(r?.[1]) === '2');
  start = start < 0 ? 0 : start + 1;
  const lay = r => Object.fromEntries(cfg.cotSo.map(c => [c, soTien(r?.[colIdx(c)])]));
  const tong = lay(rows[start]);
  const kb = {};
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (!r || txt(r[colIdx(cfg.cotMa)]) || !laDongKB(r)) continue;
    const k = txt(r[0]); const so = lay(r);
    const a = kb[k] ||= { ten: txt(r[1]), so: {} };
    for (const c in so) a.so[c] = (a.so[c] || 0) + so[c];
  }
  return { nhan: txt(rows[start]?.[1]), tong, kb };
}
// Thông tin "Báo cáo in từ ngày ... đến ngày ..." ở phần tiêu đề sheet nguồn
export function docKyIn(rows) {
  for (const r of rows.slice(0, 10)) for (const v of r || []) {
    const m = /từ ngày\s*([\d/]+)\s*đến ngày\s*([\d/]+)/i.exec(txt(v));
    if (m) return { tu: m[1], den: m[2], text: txt(v) };
  }
  return null;
}

// ---- Gắn chủ đầu tư cho dòng nguồn (VLOOKUP) ----------------------------
export function ganCDT(nguon, cdt) {
  const map = new Map();
  for (const d of cdt) if (!map.has(key(d.ma_da))) map.set(key(d.ma_da), d);   // VLOOKUP lấy dòng đầu tiên
  const thieu = new Map();
  const rows = nguon.map(r => {
    const d = map.get(key(r.ma_da));
    if (!d) thieu.set(r.ma_da, r.ten);
    return { ...r, cdt: d ? d.cdt : null, cdt2: d ? d.cdt2 : null };
  });
  return { rows, thieu: [...thieu].map(([ma_da, ten]) => ({ ma_da, ten })) };
}

// ---- Cột của từng mẫu báo cáo -------------------------------------------
const TUAN = {
  base: ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'U', 'V', 'X', 'Y'],
  derive(o) {
    o.C = o.D + o.E;
    o.R = o.U + o.X; o.S = o.V + o.Y; o.Q = o.R + o.S; o.T = o.U + o.V; o.W = o.X + o.Y;
    o.Z = o.C ? o.Q / o.C : null; o.AA = o.D ? o.T / o.D : null; o.AB = o.E ? o.W / o.E : null;
    o.AD = o.T - o.K; o.AE = o.W - o.N; o.AC = o.AD + o.AE;
  },
  // Lũy kế đến tuần trước (H..P) = lũy kế đến hết tuần báo cáo (Q..Y) của kỳ trước
  truoc: { H: 'Q', I: 'R', J: 'S', K: 'T', L: 'U', M: 'V', N: 'W', O: 'X', P: 'Y' },
  cols: ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'AA', 'AB', 'AC', 'AD', 'AE'],
  pct: ['Z', 'AA', 'AB'],
};
const THANG = {
  base: ['E', 'F', 'K', 'L', 'N', 'O'],
  derive(o) {
    o.D = o.E + o.F; o.H = o.K + o.N; o.I = o.L + o.O; o.G = o.H + o.I; o.J = o.K + o.L; o.M = o.N + o.O;
    o.P = o.D ? o.G / o.D : null; o.Q = o.E ? o.J / o.E : null; o.R = o.F ? o.M / o.F : null;
  },
  truoc: {},
  cols: ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'],
  pct: ['P', 'Q', 'R'],
};
export const KIEU = { TT15: TUAN, TT85: TUAN, THANG };

// ---- Tính báo cáo -------------------------------------------------------
// mau      : mẫu (từ mau.json) của báo cáo
// nguonRows: kết quả ganCDT(...).rows của sheet nguồn tương ứng
// opts.dieuChinh : [{dong (chỉ số dòng), cot, so_tien (triệu đồng)}]  – "Cộng thêm"
// opts.truoc     : mảng giá trị kỳ trước [{Q,R,...}] theo chỉ số dòng (hoặc null)
// opts.nhap      : giá trị nhập tay [{dong, cot, gia_tri}] cho cột F, G (KLHT thực tế)
export function tinhBaoCao(id, mau, nguonRows, opts = {}) {
  const K = KIEU[id], cfgKhoa = KHOA[BAO_CAO[id].nguon];
  // Chỉ mục SUMIFS: theo (khóa, tên CĐT) và (khóa, tên CĐT, địa điểm)
  const idx = new Map();
  const add = (k, so) => { let a = idx.get(k); if (!a) idx.set(k, a = {}); for (const c in so) a[c] = (a[c] || 0) + so[c]; };
  for (const r of nguonRows) for (const [kc, field] of Object.entries(cfgKhoa)) {
    const ten = r[field]; if (!ten) continue;
    add(kc + '|' + key(ten), r.so);
    add(kc + '|' + key(ten) + '|' + key(r.dia_diem), r.so);
  }
  const adj = new Map();
  for (const d of opts.dieuChinh || []) adj.set(d.dong + '|' + d.cot, (adj.get(d.dong + '|' + d.cot) || 0) + Number(d.so_tien || 0));
  const nhap = new Map((opts.nhap || []).map(d => [d.dong + '|' + d.cot, Number(d.gia_tri) || 0]));

  const out = mau.rows.map(() => null);
  const calc = i => {
    if (out[i]) return out[i];
    const row = mau.rows[i];
    const o = {};
    for (const c of K.base) o[c] = 0;
    if (row.loai === 'nhom') {
      for (const j of row.con) { const s = calc(j); for (const c of K.base) o[c] += s[c]; }
    } else {
      for (const [c, spec] of Object.entries(row.o || {})) {
        if (!spec.src) continue;
        const k = spec.key + '|' + key(row.ten) + (spec.kb ? '|' + key(row.kbnn) : '');
        o[c] = (idx.get(k)?.[spec.src] || 0) / 1e6;
      }
      for (const c of K.base) {
        if (adj.has(i + '|' + c)) o[c] += adj.get(i + '|' + c);
        if (nhap.has(i + '|' + c)) o[c] = nhap.get(i + '|' + c);
      }
      const tr = opts.truoc?.[i];
      for (const [h, q] of Object.entries(K.truoc)) o[h] = tr ? Number(tr[q] ?? tr[h] ?? 0) : 0;
    }
    K.derive(o);
    return (out[i] = o);
  };
  mau.rows.forEach((_, i) => calc(i));
  return out;
}

// Các dòng thực sự được cộng vào dòng TỔNG CỘNG (dòng chi tiết theo KBNN chỉ để xem thì không tính)
export function dongVaoTong(mau) {
  const set = new Set(); const go = i => { if (set.has(i)) return; set.add(i); for (const j of mau.rows[i].con || []) go(j); };
  go(0); return set;
}
function phuSong(mau) {
  const vao = dongVaoTong(mau);
  const set = new Set(); let khoaCot = null;   // khóa: cột nguồn | tên CĐT [| KBNN]
  mau.rows.forEach((r, i) => {
    if (!vao.has(i)) return;
    for (const s of Object.values(r.o || {})) {
      if (!s.src) continue; khoaCot = s.key;
      set.add(s.src + '|' + key(r.ten) + (s.kb ? '|' + key(r.kbnn) : ''));
    }
  });
  return { vao, khoaCot, coVao: (src, ten, dd) => !!ten && (set.has(src + '|' + key(ten)) || set.has(src + '|' + key(ten) + '|' + key(dd))) };
}

// Kiểm tra: dòng nguồn có chủ đầu tư nhưng không rơi vào dòng nào của báo cáo
// (tên CĐT trong sheet CDT khác tên trên báo cáo, hoặc khác mã KBNN) → số liệu bị sót
export function kiemTra(id, mau, nguonRows) {
  const cfgKhoa = KHOA[BAO_CAO[id].nguon];
  const srcCols = new Set();
  for (const r of mau.rows) for (const s of Object.values(r.o || {})) if (s.src) srcCols.add(s.src);
  const ps = phuSong(mau);
  const field = cfgKhoa[ps.khoaCot];
  const sot = new Map();
  for (const r of nguonRows) {
    const ten = r[field];
    const thieu = [...srcCols].filter(c => r.so[c] && !ps.coVao(c, ten, r.dia_diem));
    if (!thieu.length) continue;
    const k = (ten || '(chưa có mã DA trong sheet CDT)') + (id === 'THANG' ? ' | KB ' + (r.dia_diem || '') : '');
    let a = sot.get(k); if (!a) sot.set(k, a = { ten: k, so_da: 0, tong: 0 });
    a.so_da++;
    for (const c of thieu) a.tong += r.so[c];
  }
  return [...sot.values()].filter(a => a.tong).sort((a, b) => b.tong - a.tong);
}

// Đối chiếu tổng số: sheet nguồn ↔ báo cáo, theo từng cột số liệu (đồng)
//   (1) dòng TỔNG của file hệ thống   (2) cộng dòng tổng các KBNN
//   (3) cộng các dòng dự án           (4) không vào báo cáo (thiếu CDT / CĐT không khớp)
//   (5) cộng thêm                     (6) số trên báo cáo
export function doiChieu(id, mau, nguonRows, tongFile, dieuChinh, kq) {
  const K = KIEU[id], cfgKhoa = KHOA[BAO_CAO[id].nguon];
  const map = {};   // cột báo cáo → cột nguồn
  for (const r of mau.rows) for (const [c, s] of Object.entries(r.o || {})) if (s.src && !map[c]) map[c] = s.src;
  const ps = phuSong(mau);
  const field = cfgKhoa[ps.khoaCot];
  const dong = Object.entries(map).map(([cot, src]) => {
    const d = { cot, src, f1: tongFile?.tong?.[src] ?? null, f2: null, f3: 0, thieuCDT: 0, khongKhop: 0, f5: 0, f6: (kq?.[0]?.[cot] || 0) * 1e6, kbLech: [] };
    if (tongFile?.kb) {
      d.f2 = 0;
      const theoKB = {};
      for (const r of nguonRows) theoKB[r.kb] = (theoKB[r.kb] || 0) + (r.so[src] || 0);
      for (const [k, v] of Object.entries(tongFile.kb)) {
        d.f2 += v.so[src] || 0;
        const l = (v.so[src] || 0) - (theoKB[k] || 0);
        if (Math.abs(l) >= 1) d.kbLech.push({ kb: k, ten: v.ten, lech: l });
      }
    }
    for (const r of nguonRows) {
      const v = r.so[src] || 0; d.f3 += v;
      const ten = r[field];
      if (!ten) d.thieuCDT += v;
      else if (!ps.coVao(src, ten, r.dia_diem)) d.khongKhop += v;
    }
    for (const x of dieuChinh || []) if (x.cot === cot && ps.vao.has(Number(x.dong))) d.f5 += Number(x.so_tien || 0) * 1e6;
    d.f4 = d.thieuCDT + d.khongKhop;
    d.du = d.f6 - (d.f3 - d.f4 + d.f5);      // phải = 0
    return d;
  });
  return dong;
}

// Ảnh chụp số liệu để làm "kỳ trước" cho lần sau (chỉ giữ cột lũy kế Q..Y)
export function anhChup(id, ketQua) {
  const K = KIEU[id];
  const keep = Object.values(K.truoc);
  return ketQua.map(o => Object.fromEntries(keep.map(c => [c, Math.round((o[c] || 0) * 1e6) / 1e6])));
}

// Lấy điều chỉnh mặc định có sẵn trong file Excel mẫu ("+10000", "+222"...)
export function dieuChinhMacDinh(mau) {
  const out = [];
  mau.rows.forEach((r, i) => { for (const [c, s] of Object.entries(r.o || {})) if (s.add) out.push({ dong: i, cot: c, so_tien: s.add }); });
  return out;
}

// =====================================================================
//  SO SÁNH BÁO CÁO TUẦN TT15 ↔ TT85 (cùng mẫu dòng)
// =====================================================================
export const SS_CHI_TIEU = [
  { cot: 'C', ten: 'KHV tổng cộng' }, { cot: 'D', ten: 'KHV kéo dài' }, { cot: 'E', ten: 'KHV năm 2026' },
  { cot: 'Q', ten: 'Lũy kế GN – Tổng cộng' }, { cot: 'R', ten: 'Lũy kế GN – TT KLHT' }, { cot: 'S', ten: 'Lũy kế GN – Tạm ứng' },
  { cot: 'T', ten: 'GN KHV kéo dài' }, { cot: 'U', ten: 'GN KHV kéo dài – TT KLHT' }, { cot: 'V', ten: 'GN KHV kéo dài – Tạm ứng' },
  { cot: 'W', ten: 'GN KHV năm 2026' }, { cot: 'X', ten: 'GN KHV 2026 – TT KLHT' }, { cot: 'Y', ten: 'GN KHV 2026 – Tạm ứng' },
];
// Cột báo cáo tuần ← cột sheet nguồn
const COT_NGUON_TUAN = {
  TT15: { D: 'F', E: 'H', U: 'K', V: 'L', X: 'N', Y: 'O' },
  TT85: { D: 'J', E: 'P', U: 'L', V: 'M', X: 'R', Y: 'S' },
};
const tinhChiTieu = o => {
  o.C = o.D + o.E; o.R = o.U + o.X; o.S = o.V + o.Y; o.Q = o.R + o.S; o.T = o.U + o.V; o.W = o.X + o.Y; return o;
};

// So sánh từng dòng báo cáo: kq15, kq85 = kết quả tinhBaoCao của 2 báo cáo tuần
export function soSanhTuan(mau, kq15, kq85) {
  return mau.rows.map((r, i) => {
    const a = kq15[i] || {}, b = kq85[i] || {};
    const lech = {};
    for (const { cot } of SS_CHI_TIEU) lech[cot] = (a[cot] || 0) - (b[cot] || 0);
    return { i, stt: r.stt, ten: r.ten, loai: r.loai, tt15: a, tt85: b, lech };
  });
}

// Chi tiết từng dự án của 1 chủ đầu tư (triệu đồng)
export function duAnCuaCDT(tenCDT, rows15, rows85) {
  const k = key(tenCDT), map = new Map();
  const them = (rows, loai) => {
    for (const r of rows) {
      if (key(r.cdt2) !== k) continue;
      let d = map.get(r.ma_da);
      if (!d) map.set(r.ma_da, d = { ma_da: r.ma_da, co15: false, co85: false, tt15: { D: 0, E: 0, U: 0, V: 0, X: 0, Y: 0 }, tt85: { D: 0, E: 0, U: 0, V: 0, X: 0, Y: 0 } });
      d['co' + loai.slice(2)] = true;
      const o = d[loai.toLowerCase()];
      for (const [c, src] of Object.entries(COT_NGUON_TUAN[loai])) o[c] += (r.so[src] || 0) / 1e6;
    }
  };
  them(rows15, 'TT15'); them(rows85, 'TT85');
  return [...map.values()].map(d => {
    tinhChiTieu(d.tt15); tinhChiTieu(d.tt85);
    d.lech = Object.fromEntries(SS_CHI_TIEU.map(({ cot }) => [cot, d.tt15[cot] - d.tt85[cot]]));
    return d;
  });
}
