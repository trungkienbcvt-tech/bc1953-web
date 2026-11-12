'use strict';
// Danh mục dự án (sheet CDT): dữ liệu nằm ở CSDL Supabase "bcgiaingan" (dùng chung với ứng dụng /tonghop/).
// Máy chủ CV 1953 gọi các hàm SQL (SECURITY DEFINER) qua REST, kèm khóa dùng chung TONGHOP_KHOA.
// Phạm vi: Cán bộ tổng hợp xem/sửa toàn bộ; Phòng giao dịch / Nghiệp vụ 2 chỉ dự án của phòng mình.
const L = require('./logic');
const XL = require('./xlsx');
const TEN_MAU = require('./tenmau.json');

const URL_ = () => process.env.TONGHOP_URL || 'https://omtcphhbbrizxybmyiuh.supabase.co';
const ANON = () => process.env.TONGHOP_ANON || 'sb_publishable_fF-qdkYisDpmjlATOuixbA_csqgP9K1';
const E = (m) => { const e = new Error(m); e.user = true; return e; };
const COT = { dac_thu: 'Đặc thù', ctmt: 'CTMTQG 2021-2025', ctmt_2630: 'CTMTQG 2026-2030' };
const chuan = (s) => String(s || '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
const MAU = new Map(TEN_MAU.map((t) => [chuan(t), t]));
const PER = 100;

// Cho phép kiểm thử thay thế đường gọi mạng
const api = { goi: null };
async function rpc(ten, body) {
  if (api.goi) return api.goi(ten, body);
  const khoa = process.env.TONGHOP_KHOA;
  if (!khoa) throw E('Chưa cấu hình kết nối Danh mục dự án (thiếu biến môi trường TONGHOP_KHOA trên Vercel).');
  const r = await fetch(URL_() + '/rest/v1/rpc/' + ten, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON(), Authorization: 'Bearer ' + ANON() },
    body: JSON.stringify(Object.assign({ p_khoa: khoa }, body)),
  });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch (e) { j = null; }
  if (!r.ok) {
    const m = (j && (j.message || j.hint)) || t.substring(0, 120);
    if (/Sai khóa/.test(m)) throw E('Khóa kết nối Danh mục dự án không đúng, báo cán bộ quản trị.');
    throw E(/không thuộc phòng|Không được đổi|Mã .* đã có|Chưa nhập|Cột không/.test(m) ? m : 'Lỗi Danh mục dự án: ' + m);
  }
  return j;
}

// Phạm vi theo tài khoản: kbnn = null → toàn bộ
async function pv(token) {
  const q = await L.quyen(token);
  if (q.vt === 'TH') return { q, kbnn: null, ten: q.tk.hoten || q.ten };
  const dv = String(q.tk.donvi || q.ten).replace(/^Phòng giao dịch (\d)/, 'Phòng giao dịch số $1');
  return { q, kbnn: dv, ten: (q.tk.hoten || q.ten) };
}
const s = (v) => (v == null ? '' : String(v).trim());
function locChuan(l, p) {
  l = l || {};
  const o = { tim: s(l.tim), cdt: s(l.cdt), dt: s(l.dac_thu), c1: s(l.ctmt), c2: s(l.ctmt_2630) };
  return { kbnn: p.kbnn || s(l.kbnn) || null, o };
}
const goiDs = (kbnn, o, trang, per) => rpc('cv_dm_ds', { p_kbnn: kbnn, p_tim: o.tim, p_cdt: o.cdt, p_dt: o.dt, p_c1: o.c1, p_c2: o.c2, p_trang: trang, p_per: per });
const HANG = (r) => ({ ma_da: r[0], ten_da: r[1] || '', cdt: r[2] || '', cdt2: r[3] || '', kbnn: r[4] || '', dac_thu: r[5] || '', ctmt: r[6] || '', ctmt_2630: r[7] || '', sua_tay: !!r[8], them_tay: !!r[9], luc: r[10] || '', boi: r[11] || '' });

async function dmTuyChon(token) {
  const p = await pv(token);
  const t = await rpc('cv_dm_tuychon', { p_kbnn: p.kbnn });
  return Object.assign(t, { mau: TEN_MAU, cot: COT, phamVi: p.kbnn || '', toanBo: !p.kbnn, per: PER });
}
async function dmDs(token, loc, trang) {
  const p = await pv(token), { kbnn, o } = locChuan(loc, p), tr = Math.max(0, parseInt(trang, 10) || 0);
  const r = await goiDs(kbnn, o, tr, PER);
  return { kpi: r.kpi, tong: r.tong, trang: tr, per: PER, rows: (r.rows || []).map(HANG) };
}
function kiemRec(rec, cho) {
  const o = {};
  for (const k of ['ten_da', 'cdt', 'cdt2', 'kbnn', 'dac_thu', 'ctmt', 'ctmt_2630']) if (rec && Object.prototype.hasOwnProperty.call(rec, k) && (cho || []).includes(k)) o[k] = s(rec[k]);
  for (const k of ['cdt', 'cdt2']) if (o[k]) {
    const t = MAU.get(chuan(o[k])); if (!t) throw E('"' + o[k] + '" chưa có trên mẫu báo cáo. Hãy chọn tên chủ đầu tư trong danh sách gợi ý.');
    o[k] = t;
  }
  if (o.ten_da && o.ten_da.length > 500) throw E('Tên dự án quá dài.');
  return o;
}
const CAC_COT = ['ten_da', 'cdt', 'cdt2', 'kbnn', 'dac_thu', 'ctmt', 'ctmt_2630'];
async function dmSua(token, ma, rec) {
  const p = await pv(token); ma = s(ma); if (!ma) throw E('Thiếu mã dự án.');
  const o = kiemRec(rec, CAC_COT); if (!Object.keys(o).length) throw E('Không có gì để lưu.');
  if (p.kbnn) delete o.kbnn;
  await rpc('cv_dm_sua', { p_ma: ma, p_rec: o, p_who: p.ten + ' (CV1953)', p_gh: p.kbnn });
  return { ok: 1 };
}
async function dmThem(token, ma, rec) {
  const p = await pv(token); ma = s(ma); if (!ma) throw E('Chưa nhập mã dự án.');
  if (!/^[0-9A-Za-z._-]{3,30}$/.test(ma)) throw E('Mã dự án không hợp lệ.');
  const o = kiemRec(rec, CAC_COT);
  if (!o.cdt || !o.cdt2) throw E('Phải chọn chủ đầu tư (BC tháng) và chủ đầu tư 2 (BC tuần).');
  if (p.kbnn) o.kbnn = p.kbnn; else if (!o.kbnn) throw E('Chưa chọn phòng giao dịch (KBNN giao dịch).');
  await rpc('cv_dm_them', { p_ma: ma, p_rec: o, p_who: p.ten + ' (CV1953)', p_gh: p.kbnn });
  return { ok: 1 };
}
async function dmHangLoat(token, dsMa, cot, val) {
  const p = await pv(token);
  if (!COT[cot]) throw E('Cột không hợp lệ.');
  const mas = [...new Set(String(dsMa || '').split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];
  if (!mas.length) throw E('Chưa nhập mã dự án.');
  if (mas.length > 2000) throw E('Tối đa 2000 mã mỗi lần.');
  const r = await rpc('cv_dm_hangloat', { p_mas: mas, p_f: cot, p_val: s(val), p_who: p.ten + ' (CV1953)', p_gh: p.kbnn });
  return { so: r.so, tong: mas.length };
}
async function dmCanHT(token) {
  const p = await pv(token);
  const ds = await rpc('cv_dm_can_ht', { p_ten_mau: TEN_MAU, p_kbnn: p.kbnn });
  return ds || [];
}
async function dmXuat(token, loc) {
  const p = await pv(token), { kbnn, o } = locChuan(loc, p);
  const r = await goiDs(kbnn, o, 0, 20000), ds = (r.rows || []).map(HANG);
  const hd = ['STT', 'Mã dự án', 'Tên dự án', 'Chủ đầu tư (BC tháng)', 'Chủ đầu tư 2 (BC tuần)', 'KBNN giao dịch', 'Đặc thù', 'CTMTQG 2021-2025', 'CTMTQG 2026-2030', 'Cập nhật trên web'];
  const rows = [[{ v: 'DANH MỤC DỰ ÁN' + (kbnn ? ' – ' + kbnn.toUpperCase() : ''), s: 6 }], [], hd.map((v) => ({ v, s: 2 }))];
  ds.forEach((x, i) => rows.push([i + 1, x.ma_da, x.ten_da, x.cdt, x.cdt2, x.kbnn, x.dac_thu, x.ctmt, x.ctmt_2630, x.sua_tay ? (x.boi || 'đã sửa') : ''].map((v, j) => ({ v, s: j === 0 ? 4 : 3 }))));
  const buf = XL.write({ name: 'Danh muc du an', cols: [6, 12, 60, 38, 38, 22, 18, 22, 22, 22], rows, merges: ['A1:J1'], landscape: true });
  return { name: 'Danh_muc_du_an.xlsx', b64: buf.toString('base64'), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
}
module.exports = { dmTuyChon, dmDs, dmSua, dmThem, dmHangLoat, dmCanHT, dmXuat, api };
