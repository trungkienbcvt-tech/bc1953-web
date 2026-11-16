// =====================================================================
//  ĐỐI CHIẾU THBC (2461_TT15 – mẫu 01b/TTKHN) ↔ B5-01 NS xã / NS tỉnh
//  Hai chỉ tiêu (đơn vị triệu đồng):
//   KD : "Kế hoạch vốn kéo dài năm trước chuyển sang" (TT15)  ↔ "Dư dự toán năm trước chuyển sang" (B5-01)
//   NAM: "Kế hoạch vốn giao trong năm…" (TT15)               ↔ "Dự toán giao đầu năm" + "Dự toán điều chỉnh (3)" (B5-01)
//   GN : "Lũy kế vốn thanh toán từ đầu năm…" – Tổng số (TT15, cột I) ↔ "Lũy kế chi từ đầu năm" – Tổng số (cột O) − "Dư tạm ứng năm trước chuyển sang" (cột L) (B5-01)
// =====================================================================
import { soTien } from './engine.js';
import { KB_PHONG, chuanPhong } from './dt.js';

const txt = v => (v === null || v === undefined) ? '' : String(v).normalize('NFC').replace(/\s+/g, ' ').replace(/ /g, ' ').trim();
const norm = v => txt(v).toLowerCase().replace(/\s+/g, ' ');
export const SAI_SO = 0.001;   // 1.000 đồng (làm tròn)
export const CHI_TIEU = {
  KD: { ten: 'KH vốn kéo dài năm trước chuyển sang ↔ Dư dự toán năm trước chuyển sang',
    tt: 'KH vốn kéo dài năm trước chuyển sang', b5: 'Dư dự toán năm trước chuyển sang', ttNgan: 'KH kéo dài' },
  NAM: { ten: 'KH vốn giao trong năm ↔ Dự toán giao đầu năm + Dự toán điều chỉnh',
    tt: 'Kế hoạch vốn giao trong năm', b5: 'Dự toán giao đầu năm + Dự toán điều chỉnh (3)', ttNgan: 'KH giao trong năm' },
  TC: { ten: 'Vốn đã thanh toán KLHT quyết toán trong năm ↔ Thực chi',
    tt: 'Tổng cộng vốn đã thanh toán KLHT quyết toán trong năm (cột V)', b5: 'Thực chi (cột P)', ttNgan: 'Thanh toán KLHT' },
  TU: { ten: 'Tạm ứng chưa thu hồi ↔ Dư tạm ứng chưa thanh toán',
    tt: 'Lũy kế số vốn tạm ứng theo chế độ chưa thu hồi đến hết năm quyết toán (cột W)', b5: 'Dư tạm ứng chưa thanh toán (cột Q)', ttNgan: 'Tạm ứng chưa thu hồi' },
  GN: { ten: 'Lũy kế thanh toán (Tổng số) ↔ Lũy kế chi (Tổng số) − Dư tạm ứng năm trước chuyển sang',
    tt: 'Lũy kế vốn thanh toán từ đầu năm – Tổng số', b5: 'Lũy kế chi từ đầu năm (Tổng số) − Dư tạm ứng năm trước chuyển sang', ttNgan: 'Lũy kế thanh toán' },
};
const TRUONG = { KD: ['gt', 'tong'], NAM: ['gtNam', 'tongNam'], GN: ['gtGN', 'tongGN'], TC: ['gtTC', 'tongTC'], TU: ['gtTU', 'tongTU'] };
// Chỉ tiêu đối chiếu của từng cặp biểu B5-01 ↔ THBC
export const CT_CAP = { TT37: ['KD', 'NAM'], TT85: ['TC', 'TU'] };
// Đơn vị của file (dòng "Đơn vị tính : …"): file in theo đồng (VD báo cáo TT37) → đổi ra triệu đồng
const heSo = rows => {
  for (const r of rows.slice(0, 12)) for (const v of r || []) {
    const t = norm(v); if (!/đơn vị/.test(t)) continue;
    if (/triệu/.test(t)) return 1;
    if (/nghìn|ngàn/.test(t)) return 1e-3;
    if (/đồng/.test(t)) return 1e-6;
  }
  return 1;
};

// Tìm cột theo tiêu đề trong các dòng đầu bảng
function timCot(rows, re, tu = 0, den = 25) {
  for (let i = tu; i < Math.min(rows.length, den); i++) {
    const r = rows[i] || [];
    for (let c = 0; c < r.length; c++) if (re.test(norm(r[c]))) return { dong: i, cot: c };
  }
  return null;
}
const kyIn = rows => {
  for (const r of rows.slice(0, 12)) for (const v of r || []) {
    const t = txt(v);
    let m = /từ ngày(?: hiệu lực)?\s*([\d/]+)\s*đến ngày(?: hiệu lực)?\s*([\d/]+)/i.exec(t);
    if (m) return { tu: m[1], den: m[2], text: t };
  }
  return null;
};

// Nhận dạng loại file từ nội dung
export function nhanDang(rows) {
  const dau = rows.slice(0, 12).map(r => (r || []).map(txt).join(' ')).join(' ').toLowerCase();
  if (/b5\s*-\s*01/.test(dau) || /dư dự toán năm trước chuyển sang/.test(rows.slice(0, 15).map(r => (r || []).map(norm).join(' ')).join(' '))) {
    if (/phường|xã/.test(dau) && /cấp phường|phường\/xã|cấp xã/.test(dau)) return 'XA';
    if (/tỉnh/.test(dau)) return 'TINH';
    return 'B501';
  }
  if (/sổ tổng hợp tình hình tạm ứng, thanh toán/.test(dau)) return 'DTKB';   // ĐTKB-GD: Sổ tổng hợp tình hình tạm ứng, thanh toán của đơn vị
  if (/03kbqt|báo cáo quyết toán các nguồn vốn/.test(dau)) return 'TT85';   // BC TT 85 (biểu 03KBQT)
  if (/01b\/ttkhn|kế hoạch vốn kéo dài năm trước chuyển sang/.test(dau + ' ' + rows.slice(0, 15).map(r => (r || []).map(norm).join(' ')).join(' '))) return 'TT15';
  return null;
}

// 2461_TT15: tổng theo mã dự án cột "Kế hoạch vốn kéo dài năm trước chuyển sang"
export function docTT15(rows) {
  const cMa = timCot(rows, /mã số dự án|mã dự án/);
  const cKD = timCot(rows, /kế hoạch vốn kéo dài năm trước chuyển sang/);
  const cNam = timCot(rows, /kế hoạch vốn giao trong năm/);
  const cLK = timCot(rows, /lũy kế vốn thanh toán từ đầu năm|luỹ kế vốn thanh toán từ đầu năm/);   // ô gộp: cột đầu = "Tổng số" (cột I)
  if (!cMa || !cKD) throw new Error('File TT15: không tìm thấy cột "Mã số dự án" hoặc "Kế hoạch vốn kéo dài năm trước chuyển sang".');
  const hs = heSo(rows), so = v => soTien(v) * hs;
  const nam = r => cNam ? so(r[cNam.cot]) : 0;
  const gn = r => cLK ? so(r[cLK.cot]) : 0;
  let start = rows.findIndex(r => txt(r?.[0]) === '1' && txt(r?.[1]) === '2');
  start = start < 0 ? Math.max(cMa.dong, cKD.dong) + 1 : start + 1;
  const out = new Map(); let kb = '', tongDong = null, tongNam = null, tongGN = null, ghiThu = false;
  const daCo = new Set();
  for (let i = start; i < rows.length; i++) {
    const r = rows[i] || [];
    const ma = txt(r[cMa.cot]);
    if (tongDong === null && /tổng cộng|tổng số/i.test(txt(r[1]))) { tongDong = so(r[cKD.cot]); tongNam = nam(r); tongGN = gn(r); }
    if (!ma) {
      if (/^\d{4}$/.test(txt(r[0])) && /kbnn|kho bạc/i.test(txt(r[1]))) kb = txt(r[0]);
      // Báo cáo TT37: dự án vốn nước ngoài liệt kê 2 lần trong mục "Theo cơ chế ghi thu, ghi chi" → tính 1 lần
      if (txt(r[0])) { ghiThu = /ghi thu/i.test(txt(r[1])); daCo.clear(); }
      continue;
    }
    if (!/^\d{4,}$/.test(ma)) continue;
    if (ghiThu) { const k = ma + '|' + r.slice(cMa.cot + 1).map(txt).join('|'); if (daCo.has(k)) continue; daCo.add(k); }
    const x = out.get(ma) || { ma_da: ma, ten: txt(r[1]).replace(new RegExp('^' + ma + '\\s*-\\s*'), ''), kb, gt: 0, gtNam: 0, gtGN: 0, so_dong: 0 };
    const g = so(r[cKD.cot]), gNam = nam(r), gGN = gn(r);
    x.gt += g; x.gtNam += gNam; x.gtGN += gGN; x.so_dong++;
    const t = (x.theoKB ||= {})[kb] ||= { gt: 0, gtNam: 0, gtGN: 0 }; t.gt += g; t.gtNam += gNam; t.gtGN += gGN;   // file nhiều KBNN (TT37)
    out.set(ma, x);
  }
  // Dòng tổng của từng khối KBNN (để lọc khi file gồm nhiều KBNN)
  const kbTong = {};
  for (const r of rows) if (/^\d{4}$/.test(txt(r?.[0])) && /kbnn|kho bạc/i.test(txt(r?.[1])) && !txt(r[cMa.cot])) {
    const k = kbTong[txt(r[0])] ||= { tong: 0, tongNam: 0, tongGN: 0 }; k.tong += so(r[cKD.cot]); k.tongNam += nam(r); k.tongGN += gn(r);
  }
  const kbs = new Set([...out.values()].map(x => x.kb));
  return { loai: 'TT15', ds: out, tong: tongDong, tongNam, tongGN, co: { KD: true, NAM: !!cNam, GN: !!cLK }, ky: kyIn(rows), kbTong, nhieuKB: kbs.size > 1 };
}

// B5-01: tổng theo mã dự án cột "Dư dự toán năm trước chuyển sang" (+ dư tạm ứng để tham khảo)
export function docB501(rows, loai) {
  const cDT = timCot(rows, /dư dự toán năm trước chuyển sang/);
  const cTU = timCot(rows, /dư tạm ứng năm trước chuyển sang/);
  const cM = timCot(rows, /dự toán giao đầu năm/), cN = timCot(rows, /dự toán điều chỉnh/);
  const cO = timCot(rows, /lũy kế chi từ đầu năm|luỹ kế chi từ đầu năm/);   // ô gộp: cột đầu = "Tổng số" (cột O)
  const cP = timCot(rows, /^thực chi$/), cQ = timCot(rows, /dư tạm ứng chưa thanh toán/);   // cột P, Q (chia ra của Lũy kế chi)
  if (!cDT) throw new Error('File B5-01: không tìm thấy cột "Dư dự toán năm trước chuyển sang".');
  const hs = heSo(rows), so = v => soTien(v) * hs;
  const nam = r => (cM ? so(r[cM.cot]) : 0) + (cN ? so(r[cN.cot]) : 0);
  const gn = r => (cO ? so(r[cO.cot]) : 0) - (cTU ? so(r[cTU.cot]) : 0);
  const tc = r => cP ? so(r[cP.cot]) : 0, tu2 = r => cQ ? so(r[cQ.cot]) : 0;
  const cKB = timCot(rows, /mã kho bạc/);
  const out = new Map(); let muc = '', tongDong = null, tongNam = null, tongGN = null, tongTC = null, tongTU = null, cur = null;
  for (let i = cDT.dong + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const a = txt(r[0]), b = txt(r[1]);
    if (tongDong === null && /^tổng số$/i.test(b)) { tongDong = so(r[cDT.cot]); tongNam = nam(r); tongGN = gn(r); tongTC = tc(r); tongTU = tu2(r); continue; }
    if (/^[IVX]+$/.test(a)) { muc = b; cur = null; continue; }
    const m = /^(\d{5,})\s*\.\s*(.*)$/.exec(b);
    if (!m) {
      // dòng nguồn vốn chi tiết: số đã cộng lên dòng dự án; chỉ ghi nhận theo mã kho bạc (file nhiều KBNN)
      const k = cKB ? txt(r[cKB.cot]) : '';
      if (cur && /^\d{4}$/.test(k)) { const t = (cur.theoKB ||= {})[k] ||= { gt: 0, gtNam: 0, gtGN: 0, gtTC: 0, gtTU: 0 }; t.gt += so(r[cDT.cot]); t.gtNam += nam(r); t.gtGN += gn(r); t.gtTC += tc(r); t.gtTU += tu2(r); }
      continue;
    }
    const x = out.get(m[1]) || { ma_da: m[1], ten: m[2], gt: 0, gtNam: 0, gtGN: 0, gtTC: 0, gtTU: 0, tu: 0, muc: [] };
    x.gt += so(r[cDT.cot]); x.gtNam += nam(r); x.gtGN += gn(r); x.gtTC += tc(r); x.gtTU += tu2(r); if (cTU) x.tu += so(r[cTU.cot]);
    if (muc && !x.muc.includes(muc)) x.muc.push(muc);
    out.set(m[1], x); cur = x;
  }
  // Đơn vị lập báo cáo → mã KBNN (để lọc file THBC gồm nhiều KBNN)
  let kb = '';
  for (const r of rows.slice(0, 8)) for (const v of r || []) { const t = txt(v); if (/đơn vị lập/i.test(t)) { const p = chuanPhong(t); kb = Object.keys(KB_PHONG).find(k => KB_PHONG[k] === p) || ''; } }
  return { loai, ds: out, tong: tongDong, tongNam, tongGN, tongTC, tongTU, co: { KD: true, NAM: !!(cM || cN), GN: !!cO, TC: !!cP, TU: !!cQ }, ky: kyIn(rows), kb };
}

// So sánh từng dự án
export function soSanhB501(tt, xa, tinh, ct = 'KD') {
  const [f, ft] = TRUONG[ct], ten = CHI_TIEU[ct].ttNgan;
  // File THBC gồm nhiều KBNN (VD báo cáo TT37 toàn khu vực): chỉ lấy khối KBNN của đơn vị lập B5-01
  const kbLoc = tt.nhieuKB ? (xa.kb || tinh.kb) : '';
  const gtTT = a => !a ? 0 : kbLoc ? (a.theoKB?.[kbLoc]?.[f] || 0) : a[f];
  const coTT = a => !!a && (!kbLoc || !!a.theoKB?.[kbLoc]);
  const ma = new Set([...tt.ds.keys(), ...xa.ds.keys(), ...tinh.ds.keys()]);
  const rows = [];
  for (const m of ma) {
    const a = tt.ds.get(m), x = xa.ds.get(m), t = tinh.ds.get(m);
    const r = {
      ma_da: m, ten: a?.ten || x?.ten || t?.ten || '', kb: a?.kb || '',
      tt15: gtTT(a), xa: x?.[f] || 0, tinh: t?.[f] || 0, tu: ct === 'KD' ? (x?.tu || 0) + (t?.tu || 0) : 0,
      coTT: coTT(a), coXa: !!x, coTinh: !!t,
    };
    r.b501 = r.xa + r.tinh; r.lech = r.tt15 - r.b501;
    r.coLech = Math.abs(r.lech) >= SAI_SO;
    if (!r.coLech && !r.tt15 && !r.b501) continue;
    const ly = [];
    if (r.coLech) {
      if (!r.b501 && r.tt15) ly.push(r.coXa || r.coTinh ? `B5-01 có dự án nhưng ${{ KD: 'dư dự toán', NAM: 'dự toán giao + điều chỉnh', GN: 'lũy kế chi − dư tạm ứng', TC: 'thực chi', TU: 'dư tạm ứng chưa thanh toán' }[ct]} = 0` : 'Chỉ có trên THBC, không có trên B5-01');
      else if (!r.tt15 && r.b501) ly.push(r.coTT ? `THBC có dự án nhưng ${ten} = 0` : 'Chỉ có trên B5-01, không có trên THBC');
      else ly.push(r.lech > 0 ? 'THBC lớn hơn B5-01' : 'B5-01 lớn hơn THBC');
      if (r.tu && Math.abs(Math.abs(r.lech) - r.tu) < SAI_SO) ly.push('chênh lệch đúng bằng dư tạm ứng năm trước');
      if (r.xa && r.tinh) ly.push('có ở cả B5-01 NS xã và NS tỉnh');
    }
    r.ly_do = ly.join('; ');
    rows.push(r);
  }
  const sum = f => rows.reduce((s, r) => s + r[f], 0);
  return {
    rows,
    tong: { tt15: sum('tt15'), xa: sum('xa'), tinh: sum('tinh'), b501: sum('b501'), lech: sum('lech'), tu: sum('tu') },
    dongTong: { tt15: kbLoc ? tt.kbTong?.[kbLoc]?.[ft] ?? null : tt[ft], xa: xa[ft], tinh: tinh[ft] }, ct, kbLoc,
    soLech: rows.filter(r => r.coLech).length,
  };
}

// ---- THBC lấy từ số liệu đã nạp ở "Dữ liệu đầu vào" (đơn vị đồng, toàn khu vực, theo mã KBNN)
//   Đổi về cùng dạng kết quả docTT15 để dùng chung các phép đối chiếu.
//   KD: KH vốn kéo dài năm trước chuyển sang; NAM: KH vốn giao trong năm; GN: Lũy kế thanh toán – Tổng số
export const COT_THBC = {
  TT37: { KD: ['F'], NAM: ['H'], GN: ['K', 'L', 'N', 'O'] },
  TT85: { KD: ['J'], NAM: ['P'], GN: ['L', 'M', 'R', 'S'], TC: ['V'], TU: ['W'] },
};
// Từng cột TT85 riêng lẻ (đối chiếu với ĐTKB-GD): giữ theo dự án và mã KBNN trong x.c / theoKB[kb].c
export const COT_LE = { TT85: ['L', 'M', 'R', 'S'] };
export function tuNguonLuu(rows, file, loai) {
  const C = COT_THBC[loai], tr = (so, cs) => cs.reduce((s, c) => s + (so?.[c] || 0), 0) / 1e6;
  const out = new Map();
  for (const r of rows || []) {
    const ma = String(r.ma_da || '').trim(); if (!ma) continue;
    const g = tr(r.so, C.KD), gNam = tr(r.so, C.NAM), gGN = tr(r.so, C.GN), gTC = C.TC ? tr(r.so, C.TC) : 0, gTU = C.TU ? tr(r.so, C.TU) : 0, kb = r.kb || '';
    const x = out.get(ma) || { ma_da: ma, ten: String(r.ten || '').replace(new RegExp('^(' + ma + '\\s*-\\s*)+'), ''), kb, gt: 0, gtNam: 0, gtGN: 0, gtTC: 0, gtTU: 0, so_dong: 0, theoKB: {} };
    x.gt += g; x.gtNam += gNam; x.gtGN += gGN; x.gtTC += gTC; x.gtTU += gTU; x.so_dong++;
    const t = x.theoKB[kb] ||= { gt: 0, gtNam: 0, gtGN: 0, gtTC: 0, gtTU: 0 }; t.gt += g; t.gtNam += gNam; t.gtGN += gGN; t.gtTC += gTC; t.gtTU += gTU;
    for (const c of COT_LE[loai] || []) { const v = (r.so?.[c] || 0) / 1e6; (x.c ||= {})[c] = (x.c[c] || 0) + v; (t.c ||= {})[c] = (t.c[c] || 0) + v; }
    out.set(ma, x);
  }
  const kbTong = {};
  for (const [k, v] of Object.entries(file?.tong?.kb || {})) kbTong[k] = { tong: tr(v.so, C.KD), tongNam: tr(v.so, C.NAM), tongGN: tr(v.so, C.GN), tongTC: C.TC ? tr(v.so, C.TC) : 0, tongTU: C.TU ? tr(v.so, C.TU) : 0 };
  const t = file?.tong?.tong;
  const m = /từ ngày\s*([\d/]+)\s*đến ngày\s*([\d/]+)/i.exec(file?.ky_in || '');
  // TT85 nạp trước khi có cột V, W thì chưa có số → báo cần nạp lại
  const coVW = loai !== 'TT85' || (t && 'V' in t) || (rows || []).some(r => r.so && ('V' in r.so || 'W' in r.so));
  return { loai, ds: out, tong: t ? tr(t, C.KD) : null, tongNam: t ? tr(t, C.NAM) : null, tongGN: t ? tr(t, C.GN) : null,
    tongTC: t && C.TC ? tr(t, C.TC) : null, tongTU: t && C.TU ? tr(t, C.TU) : null,
    co: { KD: true, NAM: true, GN: true, TC: !!C.TC && coVW, TU: !!C.TU && coVW }, ky: m ? { tu: m[1], den: m[2], text: file.ky_in } : null, kbTong, nhieuKB: true,
    ten_file: file?.ten_file || '', luu: true, tai_luc: file?.tai_luc };
}

// ---- Đối chiếu 2 biểu THBC (TT37 ↔ TT85) theo từng dự án và mã KBNN
export function soSanhTHBC(a, b, ct = 'GN') {
  const [f, ft] = TRUONG[ct];
  const rows = [];
  for (const m of new Set([...a.ds.keys(), ...b.ds.keys()])) {
    const x = a.ds.get(m), y = b.ds.get(m);
    for (const kb of new Set([...Object.keys(x?.theoKB || {}), ...Object.keys(y?.theoKB || {})])) {
      const r = { ma_da: m, ten: x?.ten || y?.ten || '', kb, a: x?.theoKB?.[kb]?.[f] || 0, b: y?.theoKB?.[kb]?.[f] || 0, coA: !!x?.theoKB?.[kb], coB: !!y?.theoKB?.[kb] };
      r.lech = r.a - r.b; r.coLech = Math.abs(r.lech) >= SAI_SO;
      if (!r.coLech && !r.a && !r.b) continue;
      r.ly_do = !r.coLech ? '' : !r.coB ? `Chỉ có trên ${a.loai}` : !r.coA ? `Chỉ có trên ${b.loai}` : r.lech > 0 ? `${a.loai} lớn hơn ${b.loai}` : `${b.loai} lớn hơn ${a.loai}`;
      rows.push(r);
    }
  }
  const phong = new Map();
  for (const r of rows) { const p = phong.get(r.kb) || { kb: r.kb, a: 0, b: 0, lech: 0, soDA: 0, soLech: 0 }; p.a += r.a; p.b += r.b; p.lech += r.lech; p.soDA++; if (r.coLech) p.soLech++; phong.set(r.kb, p); }
  const sum = k => rows.reduce((s, r) => s + r[k], 0);
  return { rows, phong: [...phong.values()].sort((x, y) => x.kb.localeCompare(y.kb)), ct,
    tong: { a: sum('a'), b: sum('b'), lech: sum('lech') }, dongTong: { a: a[ft], b: b[ft] }, soLech: rows.filter(r => r.coLech).length };
}


// ---- ĐTKB-GD: "Sổ tổng hợp tình hình tạm ứng, thanh toán của đơn vị" (một KBNN lập sổ)
//   Cột đối chiếu (theo số thứ tự cột in trên sổ): 15 = TTKLHT vốn KH kéo dài (cột W), 16 = tạm ứng chưa thu hồi KH kéo dài (Y),
//   18 = TTKLHT vốn KH năm (AC), 19 = tạm ứng chưa thu hồi KH năm (AD). Dòng có STT là dòng tổng của dự án.
export const COT_DTKB = { W: '15', Y: '16', AC: '18', AD: '19' };
const COT_DTKB_MD = { W: 22, Y: 24, AC: 28, AD: 29 };
// Mã KBNN từ tên đơn vị: "… Phòng Nghiệp vụ 2" → 2461, "… Phòng giao dịch số 19 / PGD số 19" → 2462 …
export function kbTuTen(t) {
  const s = norm(t);
  if (/nghiệp vụ\s*2|pnv\s*2/.test(s)) return Object.keys(KB_PHONG).find(k => KB_PHONG[k] === 'NV2') || '';
  const m = /(?:giao dịch|pgd)\s*(?:số)?\s*(\d+)/.exec(s);
  return m ? Object.keys(KB_PHONG).find(k => KB_PHONG[k] === m[1]) || '' : '';
}
export function docDTKB(rows) {
  const cMa = timCot(rows, /^mã dự án/), cStt = timCot(rows, /^stt$/), cTen = timCot(rows, /^tên dự án/);
  if (!cMa) throw new Error('Không tìm thấy cột "Mã dự án" trong sổ ĐTKB-GD.');
  // cột theo dòng đánh số (1, 2, 3 … 15, 16, 18, 19), không có thì theo vị trí mặc định
  let cot = { ...COT_DTKB_MD }, dauDL = cMa.dong + 1;
  for (let i = cMa.dong; i < Math.min(rows.length, cMa.dong + 8); i++) {
    const r = rows[i] || [], so = r.map(v => txt(v));
    if (so.filter(v => /^\d+$/.test(v)).length >= 8) {
      for (const [c, n] of Object.entries(COT_DTKB)) { const j = so.indexOf(n); if (j >= 0) cot[c] = j; }
      dauDL = i + 1; break;
    }
  }
  let heSo = 1e6;
  for (const r of rows.slice(0, 10)) for (const v of r || []) { const t = norm(v); if (/đơn vị tính/.test(t)) heSo = /triệu/.test(t) ? 1 : /nghìn|ngàn/.test(t) ? 1e3 : 1e6; }
  let donVi = '';
  for (const r of rows.slice(0, 4)) for (const v of r || []) if (!donVi && /kbnn|kho bạc/i.test(txt(v))) donVi = txt(v);
  const kb = kbTuTen(donVi);
  const dau = new Map(), ct = new Map();   // dòng tổng dự án (có STT) / cộng dòng chi tiết
  for (let i = dauDL; i < rows.length; i++) {
    const r = rows[i] || [], ma = txt(r[cMa.cot]); if (!/^\d{5,}$/.test(ma)) continue;
    const v = Object.fromEntries(Object.entries(cot).map(([c, j]) => [c, soTien(r[j]) / heSo]));
    const laDau = cStt && txt(r[cStt.cot]) !== '';
    const m = laDau ? dau : ct, x = m.get(ma) || { ma_da: ma, ten: cTen ? txt(r[cTen.cot]) : '', v: { W: 0, Y: 0, AC: 0, AD: 0 } };
    if (!x.ten && cTen) x.ten = txt(r[cTen.cot]);
    for (const c in v) x.v[c] += v[c];
    m.set(ma, x);
  }
  for (const [ma, x] of ct) if (!dau.has(ma)) dau.set(ma, x);
  for (const x of dau.values()) { x.kb = kb; if (!x.ten) x.ten = ct.get(x.ma_da)?.ten || ''; }
  return { loai: 'DTKB', ds: dau, kb, donVi, ky: kyIn(rows) };
}
