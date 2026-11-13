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
  GN: { ten: 'Lũy kế thanh toán (Tổng số) ↔ Lũy kế chi (Tổng số) − Dư tạm ứng năm trước chuyển sang',
    tt: 'Lũy kế vốn thanh toán từ đầu năm – Tổng số', b5: 'Lũy kế chi từ đầu năm (Tổng số) − Dư tạm ứng năm trước chuyển sang', ttNgan: 'Lũy kế thanh toán' },
};
const TRUONG = { KD: ['gt', 'tong'], NAM: ['gtNam', 'tongNam'], GN: ['gtGN', 'tongGN'] };
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
  if (!cDT) throw new Error('File B5-01: không tìm thấy cột "Dư dự toán năm trước chuyển sang".');
  const hs = heSo(rows), so = v => soTien(v) * hs;
  const nam = r => (cM ? so(r[cM.cot]) : 0) + (cN ? so(r[cN.cot]) : 0);
  const gn = r => (cO ? so(r[cO.cot]) : 0) - (cTU ? so(r[cTU.cot]) : 0);
  const out = new Map(); let muc = '', tongDong = null, tongNam = null, tongGN = null;
  for (let i = cDT.dong + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const a = txt(r[0]), b = txt(r[1]);
    if (tongDong === null && /^tổng số$/i.test(b)) { tongDong = so(r[cDT.cot]); tongNam = nam(r); tongGN = gn(r); continue; }
    if (/^[IVX]+$/.test(a)) { muc = b; continue; }
    const m = /^(\d{5,})\s*\.\s*(.*)$/.exec(b);
    if (!m) continue;   // dòng nguồn vốn chi tiết: số đã cộng lên dòng dự án
    const x = out.get(m[1]) || { ma_da: m[1], ten: m[2], gt: 0, gtNam: 0, gtGN: 0, tu: 0, muc: [] };
    x.gt += so(r[cDT.cot]); x.gtNam += nam(r); x.gtGN += gn(r); if (cTU) x.tu += so(r[cTU.cot]);
    if (muc && !x.muc.includes(muc)) x.muc.push(muc);
    out.set(m[1], x);
  }
  // Đơn vị lập báo cáo → mã KBNN (để lọc file THBC gồm nhiều KBNN)
  let kb = '';
  for (const r of rows.slice(0, 8)) for (const v of r || []) { const t = txt(v); if (/đơn vị lập/i.test(t)) { const p = chuanPhong(t); kb = Object.keys(KB_PHONG).find(k => KB_PHONG[k] === p) || ''; } }
  return { loai, ds: out, tong: tongDong, tongNam, tongGN, co: { KD: true, NAM: !!(cM || cN), GN: !!cO }, ky: kyIn(rows), kb };
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
      if (!r.b501 && r.tt15) ly.push(r.coXa || r.coTinh ? `B5-01 có dự án nhưng ${{ KD: 'dư dự toán', NAM: 'dự toán giao + điều chỉnh', GN: 'lũy kế chi − dư tạm ứng' }[ct]} = 0` : 'Chỉ có trên THBC, không có trên B5-01');
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
