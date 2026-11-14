// =====================================================================
//  BÁO CÁO DỰ ÁN TRỌNG ĐIỂM – Biểu 01 (mẫu "Biểu đính kèm DA trọng điểm")
//  Đầu vào : sheet TW, sheet ĐP (báo cáo 01b/TTKHN xuất từ hệ thống, đơn vị đồng)
//  Danh mục: các dự án trọng điểm + kế hoạch vốn (G, H, J, K – triệu đồng), nhập tay / lấy từ sheet "Biểu 01"
//  Giải ngân: N = Σ TW!J, O = Σ ĐP!J (KHV kéo dài) ; Q = Σ TW!M, R = Σ ĐP!M (KHV năm 2026) theo mã dự án, /1.000.000
// =====================================================================
import { docNguon, docTong, docKyIn } from './engine.js';

// Kiểu dòng của danh mục
//   cdt : nhóm chủ đầu tư (I, II, …)      nda : nhóm dự án (6. Xây dựng 17 trường…)
//   da  : dự án thuộc chủ đầu tư (1, 2…)  dac : dự án thuộc nhóm dự án (6.1, 6.2…)
export const KIEU = { cdt: 'Nhóm chủ đầu tư', nda: 'Nhóm dự án', da: 'Dự án', dac: 'Dự án (thuộc nhóm dự án)' };
export const COT_KH = ['G', 'H', 'J', 'K'];
const COT_GN = ['N', 'O', 'Q', 'R'];
export const COT = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V'];
export const PCT = new Set(['S', 'T', 'U']);

const txt = v => (v === null || v === undefined) ? '' : String(v).normalize('NFC').replace(/ /g, ' ').trim();
const so = v => { if (typeof v === 'number') return v; const n = Number(String(v ?? '').replace(/\s/g, '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
const LA_MA = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];

// ---- Nhận dạng sheet
export function nhanDang(ten, rows) {
  const t = txt(ten).toLowerCase();
  const dau = rows.slice(0, 20).map(r => (r || []).map(txt).join(' ')).join(' ').toLowerCase();
  if (/tên công trình, dự án/.test(dau) && /mã qhns/.test(dau)) return 'BIEU';
  if (/^tw$|trung ương|nstw/.test(t)) return 'TW';
  if (/^(đp|dp)$|địa phương|nsđp/.test(t)) return 'DP';
  if (!/01b\/ttkhn/.test(dau)) return '';
  const all = rows.slice(0, 40).map(r => txt(r?.[1])).join(' ').toLowerCase();
  if (/ngân sách trung ương/.test(all) && !/cân đối ngân sách địa phương/.test(all)) return 'TW';
  if (/cân đối ngân sách địa phương/.test(all)) return 'DP';
  return '';
}

// ---- Đọc sheet TW / ĐP (01b/TTKHN): cộng theo mã dự án cột J (TT KHV kéo dài – tổng) và M (TT KHV năm – tổng)
export function docNguonTD(rows) {
  const ds = docNguon(rows, 'TD');                 // bỏ dòng lặp trong mục "Theo cơ chế ghi thu, ghi chi"
  const m = new Map();
  for (const r of ds) {
    const x = m.get(r.ma_da) || { J: 0, M: 0, so_dong: 0 };
    x.J += r.so.J || 0; x.M += r.so.M || 0; x.so_dong++;
    m.set(r.ma_da, x);
  }
  const t = docTong(rows, 'TD');
  return { ds: m, tong: { J: t.tong.J || 0, M: t.tong.M || 0 }, ky: docKyIn(rows), soDong: ds.length };
}

// ---- Đọc danh mục + kế hoạch vốn từ sheet "Biểu 01"
export function docBieu01(rows) {
  const i0 = rows.findIndex(r => /^tổng số$/i.test(txt(r?.[1])));
  if (i0 < 0) throw new Error('Sheet "Biểu 01": không tìm thấy dòng "TỔNG SỐ".');
  const out = [];
  for (let i = i0 + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const stt = txt(r[0]), ten = txt(r[1]), ma = txt(r[2]).replace(/\s+/g, '');
    if (!ten) { if (!stt && !ma) break; continue; }
    let kieu;
    if (/^[IVXLC]+$/.test(stt)) kieu = 'cdt';
    else if (stt.includes('.')) kieu = 'dac';
    else kieu = ma ? 'da' : 'nda';
    const d = { kieu, ten, ma_da: ma, dia_diem: txt(r[3]).replace(/\s*\n\s*/g, ' ').trim(), ghi_chu: txt(r[22]).replace(/^[.\s]+$/, '') };
    for (const [c, j] of [['g', 6], ['h', 7], ['j', 9], ['k', 10]]) d[c] = Math.round(so(r[j]) * 1000) / 1000;
    if (kieu === 'cdt' || kieu === 'nda') { delete d.ma_da; for (const c of ['g', 'h', 'j', 'k']) d[c] = 0; }
    out.push(d);
  }
  if (!out.length) throw new Error('Sheet "Biểu 01": không có dòng dự án nào sau dòng "TỔNG SỐ".');
  return out;
}

// ---- Cấu trúc cây: cha của từng dòng + số thứ tự tự động (I, 1, 6.1…)
export function cauTruc(dm) {
  const cha = [], stt = [];
  let iCdt = -1, iNda = -1, nCdt = 0, nDa = 0, nCon = 0;
  dm.forEach((d, i) => {
    if (d.kieu === 'cdt') { iCdt = i; iNda = -1; nDa = 0; cha[i] = -1; stt[i] = LA_MA[nCdt++] || String(nCdt); return; }
    if (d.kieu === 'dac' && iNda >= 0) { cha[i] = iNda; stt[i] = `${stt[iNda]}.${++nCon}`; return; }
    cha[i] = iCdt; stt[i] = String(++nDa);
    if (d.kieu === 'nda') { iNda = i; nCon = 0; } else iNda = -1;
  });
  return { cha, stt };
}

// ---- Tính Biểu 01. so: {ma_da: [TW kéo dài, TW năm, ĐP kéo dài, ĐP năm]} (đồng)
export function tinhBieu(dm, soLieu = {}) {
  const { cha, stt } = cauTruc(dm);
  const o = dm.map(() => Object.fromEntries([...COT_KH, ...COT_GN].map(c => [c, 0])));
  const tong = Object.fromEntries([...COT_KH, ...COT_GN].map(c => [c, 0]));
  const thieu = [];
  dm.forEach((d, i) => {
    if (d.kieu !== 'da' && d.kieu !== 'dac') return;
    const x = o[i];
    x.G = +d.g || 0; x.H = +d.h || 0; x.J = +d.j || 0; x.K = +d.k || 0;
    const s = soLieu[d.ma_da];
    if (s) { x.N = s[0] / 1e6; x.Q = s[1] / 1e6; x.O = s[2] / 1e6; x.R = s[3] / 1e6; }
    else if (d.ma_da) thieu.push(i);
    // cộng lên nhóm dự án, nhóm chủ đầu tư, tổng số
    for (let p = cha[i]; p >= 0; p = cha[p]) for (const c of [...COT_KH, ...COT_GN]) o[p][c] += x[c];
    for (const c of [...COT_KH, ...COT_GN]) tong[c] += x[c];
  });
  const sinh = x => {
    x.F = x.G + x.H; x.I = x.J + x.K; x.E = x.F + x.I;
    x.M = x.N + x.O; x.P = x.Q + x.R; x.L = x.M + x.P;
    x.S = x.E ? x.L / x.E : null; x.T = x.F ? x.M / x.F : null; x.U = x.I ? x.P / x.I : null;
    x.V = x.E - x.L; return x;
  };
  return { dong: o.map(sinh), tong: sinh(tong), stt, cha, thieu };
}

// ---- Gói số liệu 2 sheet thành {ma: [TW J, TW M, ĐP J, ĐP M]} (làm tròn đồng)
export function goiSo(tw, dp) {
  const out = {};
  for (const [m, k] of [[tw.ds, 0], [dp.ds, 2]]) for (const [ma, x] of m) {
    const a = out[ma] ||= [0, 0, 0, 0];
    a[k] += Math.round(x.J); a[k + 1] += Math.round(x.M);
  }
  return out;
}

// "Báo cáo in từ ngày 01/01/2026 đến ngày 13/11/2026" → '2026-11-13'
export function ngayTuKy(kyIn) {
  const m = /đến ngày\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(kyIn || '');
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}
export const ngayVN = iso => { const [y, m, d] = String(iso || '').split('-'); return d ? `${d}/${m}/${y}` : ''; };
