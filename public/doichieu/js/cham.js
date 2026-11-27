// =====================================================================
//  CHẤM SỐ LIỆU BÁO CÁO CHI TIẾT SỐ DƯ (P_BAOCAOSODU_12_COA) THEO MỤC LỤC NGÂN SÁCH
//   - Mã đã bãi bỏ (Chương, Khoản – mã ngành kinh tế, Tiểu mục – mã NDKT) theo kho dữ liệu mlns.json
//   - Mã địa bàn hành chính theo cấp ngân sách (cấp 2 → mã tỉnh; cấp 4 → đúng xã của đơn vị; TK đầu tư ≠ 00000)
//   - Mã cấp ngân sách 3 (cấp huyện) không còn sử dụng
//  Chỉ xử lý dữ liệu, không vẽ giao diện (dùng được cả trên trình duyệt và Node để kiểm thử).
// =====================================================================

export const LOI = {
  NKT: 'Hạch toán sai mã NKT',
  CHUONG: 'Hạch toán sai mã Chương',
  NDKT: 'Hạch toán sai mã NDKT',
  DBHC: 'Hạch toán sai mã ĐBHC',
  CAP3: 'Tài khoản có mã cấp 3',
};
export const NHOM_QT = {   // nhóm quy tắc bật / tắt trên giao diện
  baibo: 'Mã đã bãi bỏ (Chương, Khoản, Tiểu mục)',
  dbhc: 'Mã địa bàn hành chính theo cấp ngân sách',
  cap3: 'Mã cấp ngân sách 3 (cấp huyện)',
};
const PHAN_TEN = { chuong: 'Chương', khoan: 'Khoản', ndkt: 'Tiểu mục' };
const TK_DBHC2 = ['15', '81'];                  // dự toán + chi thường xuyên: cấp 2 phải mã tỉnh
const TK_DBHC4 = ['15', '17', '18', '81', '82'];  // dự toán + chi (thường xuyên, đầu tư): cấp 4 phải đúng xã

export const boDau = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ').trim();
const txt = v => (v === null || v === undefined) ? '' : String(v).trim();
const norm = s => txt(s).toLowerCase().replace(/\s+/g, ' ');
const ngayISO = s => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s || ''); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; };
export const ngayVN = iso => iso ? iso.split('-').reverse().join('/') : '';

// ---- Đọc một sheet "Báo cáo chi tiết số dư theo 12 phân đoạn COA": giữ nguyên các cột gốc để xuất lại đúng mẫu
//   rows: mảng 2 chiều (sheet_to_json header:1). Trả null nếu không phải báo cáo số dư.
export function docSheetSoDu(rows, tenSheet = '') {
  let h = -1;
  for (let i = 0; i < Math.min(rows.length, 40); i++) { const t = (rows[i] || []).map(norm); if (t.includes('mã tài khoản') && t.includes('mã địa bàn')) { h = i; break; } }
  if (h < 0) return null;
  const hd = rows[h].map(norm), c = re => hd.findIndex(t => re.test(t));
  const C = { quy: c(/^mã quỹ/), tk: c(/^mã tài khoản/), nd: c(/^mã ndkt/), cap: c(/^mã cấp ngân sách/), dv: c(/^mã đơn vị sử dụng ngân sách/), db: c(/^mã địa bàn/),
    ch: c(/^mã chương/), nkt: c(/^mã ngành kinh tế/), ctmt: c(/^mã ctmt/), kb: c(/^mã kho bạc/), ng: c(/^mã nguồn/), du: c(/^dư cuối kỳ vnd/) };
  if (C.tk < 0 || C.dv < 0) return null;
  // cột gốc: đến hết cột "Dư cuối kỳ VND" (bỏ cột "Lỗi" chấm tay nếu có – sẽ chấm lại)
  const het = C.du >= 0 ? C.du : rows[h].length - 1;
  const header = rows[h].slice(0, het + 1).map(txt);
  const cuTay = hd.findIndex((t, j) => j > het && t === 'lỗi');
  const out = [];
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const tk = txt(r[C.tk]); if (!/^\d{3,5}$/.test(tk)) continue;
    const dvs = txt(r[C.dv]), k = dvs.indexOf('_');
    out.push({ g: r.slice(0, het + 1), tk, nd: txt(r[C.nd]), cap: txt(r[C.cap]), dv: k > 0 ? dvs.slice(0, k) : dvs, ten: k > 0 ? dvs.slice(k + 1) : '', db: txt(r[C.db]),
      ch: txt(r[C.ch]), nkt: txt(r[C.nkt]), ctmt: txt(r[C.ctmt]), kb: txt(r[C.kb]), ng: txt(r[C.ng]), du: Number(r[C.du]) || 0,
      tay: cuTay >= 0 ? txt(r[cuTay]) : '' });
  }
  const tieuDe = rows.slice(0, h).map(r => (r || []).map(txt));
  const chu = tieuDe.map(r => r.filter(Boolean).join(' ')).join(' ');
  const m = chu.match(/từ ngày hiệu lực\s*([\d/]+).*?đến ngày hiệu lực\s*([\d/]+)/i);
  return { ten: tenSheet, tieuDe, header, rows: out, ky: m ? { tu: m[1], den: m[2] } : null, coTay: cuTay >= 0 };
}

// ---- Bối cảnh chấm: kho MLNS, danh mục hành chính, mã tỉnh, ngày chốt số liệu
export function taoNguCanh(M, DMHC, { tinh = '08', den = '' } = {}) {
  const bb = new Map((M?.baibo || []).map(b => [b.phan + '|' + b.ma, b]));
  const xaTen = new Map();
  for (const [ma, [ten, t]] of Object.entries(DMHC?.xa || {})) if (t === tinh) xaTen.set(boDau(ten).replace(/^(xa|phuong|dac khu)\s+/, ''), [ma, ten]);
  return { M, DMHC, tinh, denISO: ngayISO(den), bb, xaTen };
}

const tenMa = (M, phan, ma) => phan === 'khoan' ? M?.khoan?.[ma]?.[0] : phan === 'ndkt' ? M?.ndkt?.[ma]?.[0] : M?.chuong?.[ma];

// ---- Chấm một dòng → danh sách lỗi [{ loai, ghi, nhom }]
export function chamDong(r, ctx, bat = { baibo: true, dbhc: true, cap3: true }) {
  const loi = [];
  if (bat.baibo) {
    for (const [phan, ma, loai] of [['khoan', r.nkt, LOI.NKT], ['chuong', r.ch, LOI.CHUONG], ['ndkt', r.nd, LOI.NDKT]]) {
      const b = ctx.bb.get(phan + '|' + ma);
      if (!b || (ctx.denISO && ctx.denISO < b.tu)) continue;   // số liệu trước ngày hiệu lực thì chưa tính
      loi.push({ nhom: 'baibo', loai, ghi: `Đã bãi bỏ ${PHAN_TEN[phan]} ${ma} “${b.ten}” tại ${b.vb.replace('/TT-BTC', '')}, có hiệu lực từ ${ngayVN(b.tu)}${b.thay ? ` (hạch toán vào ${b.thay})` : ''}` });
    }
  }
  if (bat.cap3 && r.cap === '3') loi.push({ nhom: 'cap3', loai: LOI.CAP3, ghi: 'Cấp 3 là mã cấp ngân sách huyện, không còn sử dụng' });
  if (bat.dbhc) {
    const tk2 = r.tk.slice(0, 2), db = r.db;
    if (r.cap === '2' && TK_DBHC2.includes(tk2) && db && db !== '00000' && db !== ctx.tinh)
      loi.push({ nhom: 'dbhc', loai: LOI.DBHC, ghi: `TK cấp 2, mã ĐBHC đúng ${ctx.tinh}` });
    if (r.cap === '4' && TK_DBHC4.includes(tk2) && db && db !== '00000') {
      const x = ctx.DMHC?.xa?.[db];
      if (!x) loi.push({ nhom: 'dbhc', loai: LOI.DBHC, ghi: `Mã ĐBHC ${db} không có trong danh mục đơn vị hành chính` });
      else if (x[1] !== ctx.tinh) loi.push({ nhom: 'dbhc', loai: LOI.DBHC, ghi: `Mã ĐBHC ${db} (${x[0]}) thuộc tỉnh khác` });
      else if (r.dv.startsWith('1')) {   // đơn vị sử dụng ngân sách (không áp cho mã dự án) có tên xã trong tên đơn vị
        const m = /\b(?:xa|phuong|dac khu)\s+([^,(\-–]+)/.exec(boDau(r.ten));
        const k = m && m[1].replace(/\s+(tinh|thanh pho)\s.*$/, '').trim();
        const dung = k && ctx.xaTen.get(k);
        if (dung && dung[0] !== db) loi.push({ nhom: 'dbhc', loai: LOI.DBHC, ghi: `Đơn vị thuộc ${dung[1]}, mã ĐBHC đúng ${dung[0]} (đang hạch toán ${db} – ${x[0]})` });
      }
    }
    if (tk2 === '82' && r.cap && r.cap !== '0' && db === '00000') loi.push({ nhom: 'dbhc', loai: LOI.DBHC, ghi: 'TK chi đầu tư phải có mã ĐBHC nơi thực hiện dự án (không để 00000)' });
  }
  return loi;
}

// ---- Chấm toàn bộ file: trả mỗi dòng kèm lỗi, cùng thống kê theo phòng (mã kho bạc) × loại lỗi
export function chamTatCa(file, ctx, { bat, bo0 = true } = {}) {
  const ds = [], theoPhong = new Map(), theoLoai = new Map();
  for (const sh of file.sheets) for (const r of sh.rows) {
    const loi = (bo0 && Math.abs(r.du) < 0.5) ? [] : chamDong(r, ctx, bat);
    r.loi = loi;
    if (!loi.length) continue;
    ds.push(r);
    const p = theoPhong.get(r.kb) || { kb: r.kb, soDong: 0, loai: {} }; p.soDong++;
    for (const l of new Set(loi.map(x => x.loai))) { p.loai[l] = (p.loai[l] || 0) + 1; theoLoai.set(l, (theoLoai.get(l) || 0) + 1); }
    theoPhong.set(r.kb, p);
  }
  return { ds, phong: [...theoPhong.values()].sort((a, b) => a.kb.localeCompare(b.kb)), loai: [...theoLoai.entries()].sort((a, b) => b[1] - a[1]) };
}
