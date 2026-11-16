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
const COT = { dac_thu: 'Tính chất dự án', ctmt: 'Chương trình mục tiêu' };
const TINH_CHAT = ['Trọng điểm', 'Chuyển đổi số'];
const CTMT = ['DTTS', 'NTM', 'GNBV', 'PTVH', 'PCMT', 'GDDT', 'SKDS'];
const CU = new Set(['Trường nội trú', 'KCM']); // giá trị cũ còn tồn tại, chưa có phương án thay thế
const chuan = (s) => String(s || '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
const MAU0 = new Map(TEN_MAU.map((t) => [chuan(t), t]));
// Danh sách chủ đầu tư chuẩn lấy từ CSDL (Danh mục chủ đầu tư), lưu đệm 30 giây
let _ct = null, _ctT = 0;
async function ctInfo() {
  if (_ct && Date.now() - _ctT < 30000) return _ct;
  let r = null; try { r = await rpc('cv_dm_cdt_ten', {}); } catch (e) { if (!_ct) r = null; else return _ct; }
  const ten = r && Array.isArray(r.ten) && r.ten.length ? r.ten : TEN_MAU;
  _ct = { ten, lon: (r && Array.isArray(r.lon)) ? r.lon : [], tt: (r && r.tt && !Array.isArray(r.tt)) ? r.tt : {}, mau: new Map(ten.map((x) => [chuan(x), x])) };
  _ctT = Date.now(); return _ct;
}
const ctReset = () => { _ct = null; };
const PER = 100;
const BT = require('./bieutong'), DMB = require('./dmcdt.json');
// Dòng có sẵn trong Biểu tổng đối chiếu THBC: khóa = tên CĐT (đã chuẩn hóa) | phòng giao dịch
const pgdChuan = (x) => String(x || '').replace(/^Phòng giao dịch (\d)/, 'Phòng giao dịch số $1');
const DONG_BIEU = new Set(DMB.filter((x) => x.ten && x.c).map((x) => BT.chuan(x.ten) + '|' + pgdChuan(x.c)));
const CO_DONG = new Set([...DONG_BIEU].map((k) => k.split('|')[0]));
// Chuẩn hóa tên dự án: Unicode NFC, bỏ khoảng trắng thừa, dấu thanh kiểu mới (hòa, thủy) cho vần mở – giống hàm cv_chuan_ten trong CSDL
function chuanTen(v) {
  let r = String(v == null ? '' : v).normalize('NFC').replace(/\s+/g, ' ').trim();
  const A = ['à', 'á', 'ả', 'ã', 'ạ'], B = ['ò', 'ó', 'ỏ', 'õ', 'ọ'], E = ['è', 'é', 'ẻ', 'ẽ', 'ẹ'], U1 = ['ỳ', 'ý', 'ỷ', 'ỹ', 'ỵ'], U2 = ['ù', 'ú', 'ủ', 'ũ', 'ụ'];
  const L = '(?![A-Za-zÀ-ỹ])';
  for (let i = 0; i < 5; i++) {
    r = r.replace(new RegExp('o' + A[i] + L, 'g'), B[i] + 'a').replace(new RegExp('O' + A[i].toUpperCase() + L, 'g'), B[i].toUpperCase() + 'A');
    r = r.replace(new RegExp('o' + E[i] + L, 'g'), B[i] + 'e').replace(new RegExp('O' + E[i].toUpperCase() + L, 'g'), B[i].toUpperCase() + 'E');
    r = r.replace(new RegExp('(?<![qQ])u' + U1[i] + L, 'g'), U2[i] + 'y').replace(new RegExp('(?<![qQ])U' + U1[i].toUpperCase() + L, 'g'), U2[i].toUpperCase() + 'Y');
  }
  return r;
}

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
    throw E(/không thuộc phòng|Không có dự án|Không có dòng|Không xóa được|đã có trong danh mục|Chưa nhập|trùng một dòng|Khối chỉ chọn|Không có đề xuất|không có trong danh mục|Không được đổi|Mã .* đã có|Chưa nhập|Cột không/.test(m) ? m : 'Lỗi Danh mục dự án: ' + m);
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
  const ci = await ctInfo();
  return Object.assign(t, { dac_thu: TINH_CHAT, ctmt: CTMT, mau: ci.ten, lon: ci.lon, ttMap: ci.tt, cot: COT, phamVi: p.kbnn || '', toanBo: !p.kbnn, per: PER });
}
async function dmDs(token, loc, trang) {
  const p = await pv(token), { kbnn, o } = locChuan(loc, p), tr = Math.max(0, parseInt(trang, 10) || 0);
  const r = await goiDs(kbnn, o, tr, PER);
  return { kpi: r.kpi, tong: r.tong, trang: tr, per: PER, rows: (r.rows || []).map(HANG) };
}
function kiemRec(rec, cho, MAU) {
  const o = {};
  for (const k of ['ten_da', 'cdt', 'cdt2', 'kbnn', 'dac_thu', 'ctmt', 'ctmt_2630']) if (rec && Object.prototype.hasOwnProperty.call(rec, k) && (cho || []).includes(k)) o[k] = s(rec[k]);
  for (const k of ['cdt', 'cdt2']) if (o[k]) {
    const t = (MAU || MAU0).get(chuan(o[k])); if (!t) throw E('"' + o[k] + '" chưa có trên mẫu báo cáo. Hãy chọn tên chủ đầu tư trong danh sách gợi ý.');
    o[k] = t;
  }
  if (o.dac_thu && !TINH_CHAT.includes(o.dac_thu) && !CU.has(o.dac_thu)) throw E('Tính chất dự án chỉ chọn: ' + TINH_CHAT.join(', ') + '.');
  if (o.ctmt && !o.ctmt.split('+').every((x) => CTMT.includes(x.trim()))) throw E('Chương trình mục tiêu chỉ chọn: ' + CTMT.join(', ') + '.');
  if (o.ten_da) o.ten_da = chuanTen(o.ten_da);
  if (o.ten_da && o.ten_da.length > 500) throw E('Tên dự án quá dài.');
  return o;
}
const CAC_COT = ['ten_da', 'cdt', 'cdt2', 'kbnn', 'dac_thu', 'ctmt'];
async function dmSua(token, ma, rec) {
  const p = await pv(token); ma = s(ma); if (!ma) throw E('Thiếu mã dự án.');
  const o = kiemRec(rec, CAC_COT, (await ctInfo()).mau); if (!Object.keys(o).length) throw E('Không có gì để lưu.');
  if (p.kbnn) delete o.kbnn;
  // Phòng giao dịch không tự sửa chủ đầu tư trực thuộc (cdt) – phải đề xuất, chuyên viên THBC duyệt
  if (p.kbnn && o.cdt && !(o.cdt2 && o.cdt2 === o.cdt)) delete o.cdt;
  if (!Object.keys(o).length) throw E('Phòng giao dịch chỉ đề xuất chủ đầu tư trực thuộc, chưa lưu trực tiếp.');
  await rpc('cv_dm_sua', { p_ma: ma, p_rec: o, p_who: p.ten + ' (CV1953)', p_gh: p.kbnn });
  return { ok: 1 };
}
async function dmThem(token, ma, rec) {
  const p = await pv(token); ma = s(ma); if (!ma) throw E('Chưa nhập mã dự án.');
  if (!/^[0-9A-Za-z._-]{3,30}$/.test(ma)) throw E('Mã dự án không hợp lệ.');
  const o = kiemRec(rec, CAC_COT, (await ctInfo()).mau);
  if (!o.cdt || !o.cdt2) throw E('Phải chọn chủ đầu tư (BC tháng) và chủ đầu tư 2 (BC tuần).');
  if (p.kbnn) o.kbnn = p.kbnn; else if (!o.kbnn) throw E('Chưa chọn phòng giao dịch (KBNN giao dịch).');
  const tt = p.kbnn && o.cdt !== o.cdt2 ? o.cdt : '';
  if (p.kbnn) o.cdt = o.cdt2;
  await rpc('cv_dm_them', { p_ma: ma, p_rec: o, p_who: p.ten + ' (CV1953)', p_gh: p.kbnn });
  if (tt) await rpc('cv_dm_dx_gui', { p_ma: ma, p_tt: tt, p_who: p.ten + ' (CV1953)', p_gh: p.kbnn });
  return { ok: 1, deXuat: tt ? 1 : 0 };
}
async function dmHangLoat(token, dsMa, cot, val) {
  const p = await pv(token);
  if (!COT[cot]) throw E('Cột không hợp lệ.');
  if (val && !(cot === 'dac_thu' ? TINH_CHAT : CTMT).includes(s(val))) throw E('Giá trị không nằm trong danh sách lựa chọn.');
  const mas = [...new Set(String(dsMa || '').split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];
  if (!mas.length) throw E('Chưa nhập mã dự án.');
  if (mas.length > 2000) throw E('Tối đa 2000 mã mỗi lần.');
  const r = await rpc('cv_dm_hangloat', { p_mas: mas, p_f: cot, p_val: s(val), p_who: p.ten + ' (CV1953)', p_gh: p.kbnn });
  return { so: r.so, tong: mas.length };
}
async function dmCanHT(token) {
  const p = await pv(token);
  const ds = await rpc('cv_dm_can_ht', { p_ten_mau: (await ctInfo()).ten, p_kbnn: p.kbnn });
  return ds || [];
}
async function dmDeXuat(token, ma, tt) {
  const p = await pv(token); ma = s(ma); tt = s(tt);
  if (!ma) throw E('Thiếu mã dự án.');
  if (!p.kbnn) throw E('Chuyên viên THBC sửa trực tiếp, không cần đề xuất.');
  if (tt) { const m = (await ctInfo()).mau.get(chuan(tt)); if (!m) throw E('"' + tt + '" chưa có trên mẫu báo cáo. Hãy chọn tên chủ đầu tư trong danh sách.'); tt = m; }
  return rpc('cv_dm_dx_gui', { p_ma: ma, p_tt: tt, p_who: p.ten + ' (CV1953)', p_gh: p.kbnn });
}
async function dmDxDs(token) {
  const p = await pv(token);
  const r = await rpc('cv_dm_dx_ds', { p_kbnn: p.kbnn }) || [];
  return { duyet: !p.kbnn, rows: r.map((x) => ({ ma_da: x[0], ten_da: x[1] || '', cdt2: x[2] || '', cdt: x[3] || '', tt: x[4] || '', nguoi: x[5] || '', kbnn: x[6] || '', luc: x[7] || '', tt_: x[8], ly_do: x[9] || '' })) };
}
async function dmDxDuyet(token, ma, ok, lyDo) {
  const p = await pv(token);
  if (p.kbnn) throw E('Chỉ chuyên viên THBC mới duyệt được chủ đầu tư trực thuộc.');
  return rpc('cv_dm_dx_duyet', { p_ma: s(ma), p_ok: !!ok, p_who: p.ten + ' (CV1953)', p_ly_do: s(lyDo) });
}
async function dmCanhBao(token) {
  const p = await pv(token);
  const r = await rpc('cv_dm_canh_bao', { p_kbnn: p.kbnn }) || {};
  return { tong: r.tong || 0, nhom: r.nhom || {}, rows: (r.rows || []).map((x) => ({ ma_da: x[0], ten_da: x[1] || '', cdt: x[2] || '', cdt2: x[3] || '', kbnn: x[4] || '', loai: x[5] || [], ly_do: x[6] || '' })) };
}
async function cdtDs(token) {
  const p = await pv(token);
  const r = await rpc('cv_dm_cdt_ds', {}) || {};
  const rows = (r.rows || []).map((x) => {
    const o = { id: x[0], khoi: x[1], lon: x[2], tt: x[3] || '', ghi_chu: x[4] || '', so: x[6] || 0, thieu: x[10] || [], co_bieu: x[11] !== false, pgd: x[7] || {}, luc: x[8] || '', boi: x[9] || '' };
    const k = BT.chuan(o.tt || o.lon);
    o.khongDong = !CO_DONG.has(k);                                   // CĐT chưa có dòng nào trong biểu
    o.thieu = Object.keys(o.pgd).filter((g) => !DONG_BIEU.has(k + '|' + pgdChuan(g))).sort(); // phòng có dự án nhưng biểu không có dòng
    return o;
  });
  return { sua: !p.kbnn, phong: p.kbnn || '', rows: p.kbnn ? rows.filter((x) => x.pgd[p.kbnn]).map((x) => Object.assign({}, x, { thieu: x.thieu.filter((k) => k === p.kbnn), so: x.pgd[p.kbnn] || 0, pgd: x.pgd[p.kbnn] ? { [p.kbnn]: x.pgd[p.kbnn] } : {} })) : rows,
    ngoai: p.kbnn ? [] : (r.ngoai || []).map((x) => ({ lon: x[0], tt: x[1], so: x[2] })) };
}
async function cdtLuu(token, id, rec) {
  const p = await pv(token); if (p.kbnn) throw E('Chỉ chuyên viên THBC mới sửa được Danh mục chủ đầu tư.');
  const o = {}; for (const k of ['khoi', 'cdt_lon', 'cdt_tt', 'ghi_chu']) o[k] = s(rec && rec[k]);
  o.chua_co_dong = false;
  if (!o.cdt_lon) throw E('Chưa nhập chủ đầu tư lớn.');
  const r = await rpc('cv_dm_cdt_luu', { p_id: id == null ? null : parseInt(id, 10), p_rec: o, p_who: p.ten + ' (CV1953)' });
  ctReset(); return r;
}
async function cdtXoa(token, id) {
  const p = await pv(token); if (p.kbnn) throw E('Chỉ chuyên viên THBC mới xóa được dòng chủ đầu tư.');
  const r = await rpc('cv_dm_cdt_xoa', { p_id: parseInt(id, 10) }); ctReset(); return r;
}
async function cdtXuat(token) {
  const d = await cdtDs(token);
  const hd = ['STT', 'Khối', 'Chủ đầu tư lớn', 'Chủ đầu tư trực thuộc', 'Số dự án', 'Phòng giao dịch (số dự án)', 'Ghi chú'];
  const rows = [[{ v: 'DANH MỤC CHỦ ĐẦU TƯ' + (d.phong ? ' – ' + d.phong.toUpperCase() : ''), s: 6 }], [], hd.map((v) => ({ v, s: 2 }))];
  d.rows.forEach((x, i) => rows.push([i + 1, x.khoi, x.lon, x.tt, x.so, Object.keys(x.pgd).sort().map((k) => k + ': ' + x.pgd[k]).join('; '), (x.co_bieu ? '' : 'Chưa có dòng nào trong biểu. ') + (x.thieu.length ? 'Thiếu dòng trong biểu tại: ' + x.thieu.join(', ') + '. ' : '') + x.ghi_chu].map((v, j) => ({ v, s: j === 0 || j === 4 ? 4 : 3 }))));
  const buf = XL.write({ name: 'Danh muc chu dau tu', cols: [6, 18, 52, 46, 10, 50, 40], rows, merges: ['A1:G1'], landscape: true });
  return { name: 'Danh_muc_chu_dau_tu.xlsx', b64: buf.toString('base64'), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
}
async function banDo() { return (await rpc('cv_dm_ban_do', {})) || []; }
async function dmXuat(token, loc) {
  const p = await pv(token), { kbnn, o } = locChuan(loc, p);
  const r = await goiDs(kbnn, o, 0, 20000), ds = (r.rows || []).map(HANG);
  const hd = ['STT', 'Mã dự án', 'Tên dự án', 'Chủ đầu tư (BC tháng)', 'Chủ đầu tư 2 (BC tuần)', 'KBNN giao dịch', 'Tính chất dự án', 'Chương trình mục tiêu', 'Cập nhật trên web'];
  const rows = [[{ v: 'DANH MỤC DỰ ÁN' + (kbnn ? ' – ' + kbnn.toUpperCase() : ''), s: 6 }], [], hd.map((v) => ({ v, s: 2 }))];
  ds.forEach((x, i) => rows.push([i + 1, x.ma_da, x.ten_da, x.cdt, x.cdt2, x.kbnn, x.dac_thu, x.ctmt, x.sua_tay ? (x.boi || 'đã sửa') : ''].map((v, j) => ({ v, s: j === 0 ? 4 : 3 }))));
  const buf = XL.write({ name: 'Danh muc du an', cols: [6, 12, 60, 38, 38, 22, 18, 22, 22], rows, merges: ['A1:I1'], landscape: true });
  return { name: 'Danh_muc_du_an.xlsx', b64: buf.toString('base64'), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
}
module.exports = { dmTuyChon, dmDs, dmSua, dmThem, dmHangLoat, dmCanHT, dmCanhBao, dmDeXuat, dmDxDs, dmDxDuyet, cdtDs, cdtLuu, cdtXoa, cdtXuat, dmXuat, _banDo: banDo, _ctInfo: ctInfo, _reset: () => { _ct = null; }, api };
