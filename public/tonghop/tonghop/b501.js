// =====================================================================
//  ĐỐI CHIẾU THBC (2461_TT15 – mẫu 01b/TTKHN) ↔ B5-01 NS xã / NS tỉnh
//  So sánh: "Kế hoạch vốn kéo dài năm trước chuyển sang" (TT15)
//        với "Dư dự toán năm trước chuyển sang" (B5-01) – đơn vị triệu đồng
// =====================================================================
import { soTien } from './engine.js';

const txt = v => (v === null || v === undefined) ? '' : String(v).normalize('NFC').replace(/\s+/g, ' ').replace(/ /g, ' ').trim();
const norm = v => txt(v).toLowerCase().replace(/\s+/g, ' ');
export const SAI_SO = 0.001;   // 1.000 đồng (làm tròn)

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
  if (!cMa || !cKD) throw new Error('File TT15: không tìm thấy cột "Mã số dự án" hoặc "Kế hoạch vốn kéo dài năm trước chuyển sang".');
  let start = rows.findIndex(r => txt(r?.[0]) === '1' && txt(r?.[1]) === '2');
  start = start < 0 ? Math.max(cMa.dong, cKD.dong) + 1 : start + 1;
  const out = new Map(); let kb = '', tongDong = null, ghiThu = false;
  const daCo = new Set();
  for (let i = start; i < rows.length; i++) {
    const r = rows[i] || [];
    const ma = txt(r[cMa.cot]);
    if (tongDong === null && /tổng cộng|tổng số/i.test(txt(r[1]))) tongDong = soTien(r[cKD.cot]);
    if (!ma) {
      if (/^\d{4}$/.test(txt(r[0])) && /kbnn|kho bạc/i.test(txt(r[1]))) kb = txt(r[0]);
      // Báo cáo TT37: dự án vốn nước ngoài liệt kê 2 lần trong mục "Theo cơ chế ghi thu, ghi chi" → tính 1 lần
      if (txt(r[0])) { ghiThu = /ghi thu/i.test(txt(r[1])); daCo.clear(); }
      continue;
    }
    if (!/^\d{4,}$/.test(ma)) continue;
    if (ghiThu) { const k = ma + '|' + r.slice(cMa.cot + 1).map(txt).join('|'); if (daCo.has(k)) continue; daCo.add(k); }
    const x = out.get(ma) || { ma_da: ma, ten: txt(r[1]).replace(new RegExp('^' + ma + '\\s*-\\s*'), ''), kb, gt: 0, so_dong: 0 };
    x.gt += soTien(r[cKD.cot]); x.so_dong++;
    out.set(ma, x);
  }
  return { loai: 'TT15', ds: out, tong: tongDong, ky: kyIn(rows) };
}

// B5-01: tổng theo mã dự án cột "Dư dự toán năm trước chuyển sang" (+ dư tạm ứng để tham khảo)
export function docB501(rows, loai) {
  const cDT = timCot(rows, /dư dự toán năm trước chuyển sang/);
  const cTU = timCot(rows, /dư tạm ứng năm trước chuyển sang/);
  if (!cDT) throw new Error('File B5-01: không tìm thấy cột "Dư dự toán năm trước chuyển sang".');
  const out = new Map(); let muc = '', tongDong = null;
  for (let i = cDT.dong + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const a = txt(r[0]), b = txt(r[1]);
    if (tongDong === null && /^tổng số$/i.test(b)) { tongDong = soTien(r[cDT.cot]); continue; }
    if (/^[IVX]+$/.test(a)) { muc = b; continue; }
    const m = /^(\d{5,})\s*\.\s*(.*)$/.exec(b);
    if (!m) continue;   // dòng nguồn vốn chi tiết: số đã cộng lên dòng dự án
    const x = out.get(m[1]) || { ma_da: m[1], ten: m[2], gt: 0, tu: 0, muc: [] };
    x.gt += soTien(r[cDT.cot]); if (cTU) x.tu += soTien(r[cTU.cot]);
    if (muc && !x.muc.includes(muc)) x.muc.push(muc);
    out.set(m[1], x);
  }
  return { loai, ds: out, tong: tongDong, ky: kyIn(rows) };
}

// So sánh từng dự án
export function soSanhB501(tt, xa, tinh) {
  const ma = new Set([...tt.ds.keys(), ...xa.ds.keys(), ...tinh.ds.keys()]);
  const rows = [];
  for (const m of ma) {
    const a = tt.ds.get(m), x = xa.ds.get(m), t = tinh.ds.get(m);
    const r = {
      ma_da: m, ten: a?.ten || x?.ten || t?.ten || '', kb: a?.kb || '',
      tt15: a?.gt || 0, xa: x?.gt || 0, tinh: t?.gt || 0, tu: (x?.tu || 0) + (t?.tu || 0),
      coTT: !!a, coXa: !!x, coTinh: !!t,
    };
    r.b501 = r.xa + r.tinh; r.lech = r.tt15 - r.b501;
    r.coLech = Math.abs(r.lech) >= SAI_SO;
    if (!r.coLech && !r.tt15 && !r.b501) continue;
    const ly = [];
    if (r.coLech) {
      if (!r.b501 && r.tt15) ly.push(r.coXa || r.coTinh ? 'B5-01 có dự án nhưng dư dự toán = 0' : 'Chỉ có trên TT15, không có trên B5-01');
      else if (!r.tt15 && r.b501) ly.push(r.coTT ? 'TT15 có dự án nhưng KH kéo dài = 0' : 'Chỉ có trên B5-01, không có trên TT15');
      else ly.push(r.lech > 0 ? 'TT15 lớn hơn B5-01' : 'B5-01 lớn hơn TT15');
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
    dongTong: { tt15: tt.tong, xa: xa.tong, tinh: tinh.tong },
    soLech: rows.filter(r => r.coLech).length,
  };
}
