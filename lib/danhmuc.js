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
const PER = 15;
const DOI = require('./dmdoichieu'), BT = require('./bieutong'), DMB = require('./dmcdt.json');
// Dòng có sẵn trong Biểu tổng đối chiếu THBC: khóa = tên CĐT (đã chuẩn hóa) | phòng giao dịch
const pgdChuan = (x) => String(x || '').replace(/^Phòng giao dịch (\d)/, 'Phòng giao dịch số $1');
let DONG_BIEU = new Set(), CO_DONG = new Set();
const lapDong = () => { DONG_BIEU = new Set(DMB.filter((x) => x.ten && x.c).map((x) => BT.chuan(x.ten) + '|' + pgdChuan(x.c))); CO_DONG = new Set([...DONG_BIEU].map((k) => k.split('|')[0])); }; lapDong();
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
// Dự án có tên B501 khác nội dung với tên TT85: chỉ được chọn một trong hai tên, không sửa tay
const KHAC_TEN = { 'Khác nội dung tên': 1, 'Tên một bên ngắn hơn (thiếu phần đuôi)': 1 };
function haiTen(ma) { const o = DOI.ss()[ma]; return o && o.s === 'BT' && KHAC_TEN[o.x] && o.b && o.t ? [o.b, o.t] : null; }
// Mã CTMT theo B501 (cột "Mã chương trình, mục tiêu và dự án quốc gia") tra tên gọi trong file danh mục mã CTMT (lib/ctmt_list.json)
const CT_GD = ['2021-2025', '2026-2030', 'khac'], CT_NHAN = { '0470': 'GNBV', '0490': 'NTM', '0510': 'DTTS' };
function ctG(L, g, c) { return L[g + '|' + c] || L[CT_GD[0] + '|' + c] || L[CT_GD[1] + '|' + c] || L[CT_GD[2] + '|' + c]; }
// Gộp mã CTMT đã gắn sẵn (ctmt_map.json) với mã quét từ các file B501 tải lên (kv dmup:ct); x = mã không có trong mục lục NSNN
// Nhãn chương trình mục tiêu theo mã (hiển thị ở Tra cứu; cột "Chương trình mục tiêu" cũ DTTS/NTM/GNBV… giữ nguyên cho báo cáo)
const CT_LABEL = { '0470': 'GNBV 21-25', '0490': 'NTM 21-25', '0510': 'DTTS 21-25', '0100': 'NTM-GNBV-DTTS 26-30', '0170': 'VHXH-NT-DTMN 26-35', '0030': 'PTVH 25-35', '0060': 'PCMT 2030', '0130': 'SKDS 26-30', '0150': 'GDDT 26-30' };
const laQg = (c) => { const n = nhanMa([c]); return !!n && n !== 'Không xác định'; };   // mã thuộc CTMT QG (ra được nhãn chương trình)
function nhanMa(codes) {
  const LS = require('./ctmt_list.json'), set = new Set();
  (codes || []).forEach((c) => { const g = CT_GD.find((k) => LS[k + '|' + c]); if (!g) return; let e = LS[g + '|' + c], m = c, n = 0; while (e && e.c && n++ < 5) { m = e.c; e = LS[g + '|' + m]; } if (CT_LABEL[m]) set.add(CT_LABEL[m]); });
  return set.size ? [...set].sort().join(' + ') : ((codes || []).length ? 'Không xác định' : '');
}
async function kvDoc(k) { try { const r = await L._.db().q('SELECT v FROM kv WHERE k=$1', [k]); return r.length ? (JSON.parse(r[0].v) || {}) : {}; } catch (e) { return {}; } }
async function ctmtGop() {
  const LS = require('./ctmt_list.json'), M0 = JSON.parse(JSON.stringify(require('./ctmt_map.json')));
  const up = await kvDoc('dmup:ct'), tay = await kvDoc('dmct:tay');
  const dan = (o) => {   // giai đoạn + nhãn chương trình (GNBV/NTM/DTTS) suy từ mã
    const gs = new Set(); o.c.forEach((c) => { const g = CT_GD.find((k) => LS[k + '|' + c]); if (g) gs.add(g); }); o.g = [...gs];
    const nh = new Set(); o.c.forEach((c) => { let e = ctG(LS, o.g[0] || CT_GD[0], c), n = 0; while (e && e.c && n++ < 4) e = ctG(LS, o.g[0] || CT_GD[0], e.c); const k = e && Object.keys(LS).find((q) => LS[q] === e); if (k && CT_NHAN[k.split('|')[1]]) nh.add(CT_NHAN[k.split('|')[1]]); });
    o.n = [...nh].sort().join('+');
  };
  Object.keys(up).forEach((m) => { const o = M0[m] = M0[m] || { c: [], g: [], n: '' }; o.c = [...new Set(o.c.concat(up[m]))].sort(); dan(o); });
  Object.keys(tay).forEach((m) => { const o = M0[m] = M0[m] || { c: [], g: [], n: '' }; o.c = [...new Set(tay[m])].sort(); dan(o); });   // nhập tay thay hẳn mã từ B501
  const khac = await kvDoc('dmct:khac');   // {mã DA: {c:[mã CTMT không thuộc CTMT QG], t:'tên CTMT do cán bộ nhập'}} (bản cũ: chuỗi mã)
  const hopLe = (o, c) => !!ctG(LS, (o.g || [])[0] || CT_GD[0], c);
  Object.keys(khac).forEach((m) => { let k = khac[m]; if (typeof k === 'string') k = { c: k.split(/[;,\s]+/).filter(Boolean), t: '' }; const o = M0[m] = M0[m] || { c: [], g: [], n: '' }; o.c = tay[m] ? [...new Set(tay[m])].sort() : o.c.filter((c) => CT_GD.some((g) => LS[g + '|' + c])); dan(o); o.k = k.c || []; o.kt = k.t || ''; });
  Object.keys(M0).forEach((m) => { const o = M0[m]; if (!o.k) { o.k = []; o.kt = ''; } const qg = o.c.filter((c) => hopLe(o, c) && laQg(c)); o.k = [...new Set(o.k.concat(o.c.filter((c) => !qg.includes(c))))]; o.c = qg; o.x = o.kt ? [] : o.k; });   // mã không thuộc CTMT QG (không ra nhãn NTM/GNBV/DTTS…) = mã CTMT, phải điền tên   // x = mã CTMT chưa xác định → vào nhóm bắt buộc hoàn thiện
  return M0;
}
// Tra mã CTMT (nhập mã nhiệm vụ/dự án như 1102 → ra cả tiểu chương trình 0102 và chương trình 0100, kèm tên gọi)
const CAP = { ctmt: 'Chương trình mục tiêu', tieu: 'Tiểu chương trình / dự án thành phần', nv: 'Nhiệm vụ, dự án' };
function ctmtTra(text) {
  const LS = require('./ctmt_list.json'), out = [], loi = [], seen = new Set();
  String(text || '').split(/[;,\s]+/).filter(Boolean).forEach((raw) => {
    let c = raw.replace(/\D/g, ''); if (c.length === 5) c = c.slice(1); if (c.length !== 4) { loi.push(raw); return; }
    if (seen.has(c)) return; seen.add(c);
    const g = CT_GD.find((k) => LS[k + '|' + c]); if (!g) { loi.push(c); return; }
    const chuoi = []; let e = LS[g + '|' + c], m = c, n = 0;
    while (e && n++ < 5) { chuoi.unshift({ ma: m, ten: e.t, cap: CAP[e.p] || '', p: e.p }); m = e.c; e = e.c ? ctG(LS, g, e.c) : null; }
    out.push({ ma: c, gd: g, chuoi, nhan: nhanMa([c]), qg: laQg(c), tenMuc: (chuoi[chuoi.length - 1] || {}).ten || '' });
  });
  return { rows: out, loi };
}
async function dmCtmtTra(token, text) { await pv(token); return ctmtTra(text); }
async function dmCtmtLuu(token, ma, text, tenKhac) {
  const p = await pv(token); ma = s(ma); if (!ma) throw E('Thiếu mã dự án.');
  const r = ctmtTra(text);
  if (p.kbnn) { const b = (await banDo()).find((x) => x[0] === ma); if (!b || (b[4] || '') !== p.kbnn) throw E('Dự án không thuộc phòng giao dịch của bạn.'); }
  const qgR = r.rows.filter((x) => laQg(x.ma)), khR = r.rows.filter((x) => !laQg(x.ma)).map((x) => x.ma), loi = khR.concat(r.loi);
  const tay = await kvDoc('dmct:tay'); if (qgR.length || loi.length) tay[ma] = qgR.map((x) => x.ma); else delete tay[ma];
  await L._.db().q('INSERT INTO kv (k,v) VALUES ($1,$2) ON CONFLICT (k) DO UPDATE SET v=excluded.v', ['dmct:tay', JSON.stringify(tay)]);
  {
    const kh = await kvDoc('dmct:khac'), cu = kh[ma] && typeof kh[ma] === 'object' ? kh[ma] : {};
    if (loi.length) kh[ma] = { c: loi, t: tenKhac !== undefined ? s(tenKhac).replace(/\s+/g, ' ').substring(0, 200) : ((cu.c || []).join(';') === loi.join(';') ? (cu.t || '') : '') }; else delete kh[ma];
    await L._.db().q('INSERT INTO kv (k,v) VALUES ($1,$2) ON CONFLICT (k) DO UPDATE SET v=excluded.v', ['dmct:khac', JSON.stringify(kh)]);
  }
  _ctmtC = null; _cbM.v = null; return { ok: 1, so: r.rows.length, khac: loi.length };
}
// ---- Xuất Excel danh sách dự án cần hoàn thiện (chỉ để xem) ----
const HT_NGAN = { 'Tên B501 khác TT85': 'Tên B501 ≠ TT85', 'Thiếu tên dự án': 'Thiếu tên', 'Thiếu KBNN giao dịch': 'Thiếu phòng GD', 'KBNN không chuẩn': 'Phòng GD không chuẩn', 'CĐT không có trong danh mục chuẩn': 'Chủ đầu tư không có trong Danh mục chủ đầu tư', 'Phòng chưa có dòng chủ đầu tư này trong biểu': 'Chưa có dòng trong biểu', 'Chủ đầu tư chưa có dòng nào trong biểu': 'Chưa có dòng trong biểu' };
const HT_HD = ['STT', 'Mã dự án', 'Tên dự án', 'Phòng giao dịch', 'Tình trạng', 'Chủ đầu tư lớn', 'Chủ đầu tư trực thuộc', 'Mã CTMT', 'Cán bộ chuyên quản'];
async function dmHtXuat(token, tinhTrang) {
  const p = await pv(token), cb = await dmCanhBao(token), CM = await ctmtMap(), tt = s(tinhTrang), CQ = new Map((await cbqDoc()).map((x) => [x.ma, x]));
  const tts = tt ? tt.split('|') : [], ds = cb.rows.filter((x) => tts.length ? x.loai.some((l) => tts.includes(HT_NGAN[l] || l)) : x.loai.some((l) => l !== 'Bỏ qua trực thuộc' && l !== 'Đã phân công cán bộ'));
  const rows = [[{ v: 'DANH SÁCH DỰ ÁN CẦN HOÀN THIỆN' + (p.kbnn ? ' – ' + p.kbnn.toUpperCase() : '') + (tt ? ' – ' + tt.split('|').join(', ') : ''), s: 6 }],
    [], HT_HD.map((v) => ({ v, s: 2 }))];
  ds.forEach((x, i) => rows.push([i + 1, x.ma_da, x.ten_da, x.kbnn, [...new Set(x.loai.map((l) => HT_NGAN[l] || l))].join('; '), x.cdt2 || x.cdt || '', (x.cdt2 && x.cdt && x.cdt !== x.cdt2) ? x.cdt : '', [(CM.get(x.ma_da) || {}).ma, (CM.get(x.ma_da) || {}).k].filter(Boolean).join('; '), (CQ.get(x.cq) ? CQ.get(x.cq).ten + ' (' + x.cq + ')' : '')].map((v, j) => ({ v, s: j === 0 ? 4 : 3 }))));
  const buf = XL.write({ name: 'Hoan thien', cols: [6, 13, 60, 22, 34, 40, 40, 18, 24], rows, merges: ['A1:I1'], landscape: true });
  return { name: 'Hoan_thien_du_an' + (tt ? '_loc' : '') + '.xlsx', b64: buf.toString('base64'), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', so: ds.length };
}
async function ctmtRows() {
  const L = require('./ctmt_list.json'), M0 = await ctmtGop(), out = [];
  const tenCha = (g, c) => { const e = ctG(L, g, c); if (!e) return ''; if (e.p === 'ctmt') return e.t; const f = ctG(L, g, e.c); return f ? (f.p === 'ctmt' ? f.t : (ctG(L, g, f.c) || {}).t || f.t) : ''; };
  Object.keys(M0).forEach((m) => { const o = M0[m], g = (o.g[0] || ''); out.push({ m, c: o.c.join('; '), k: (o.k || []).join('; '), kt: o.kt || '', t: o.c.map((c) => (ctG(L, g, c) || {}).t || '').join(' | '), h: [...new Set(o.c.map((c) => tenCha(g, c)))].filter(Boolean).join(' | '), g: o.g.join('+'), n: o.n, l: nhanMa(o.c) }); });
  return out;
}
async function dmCtmtDongBo(token, ghi) {
  const p = await pv(token); if (p.kbnn) throw E('Chỉ Phòng NV2 được gắn mã CTMT hàng loạt.');
  const r = await rpc('cv_dm_ctmt_dong_bo', { p_rows: await ctmtRows(), p_ghi: !!ghi, p_who: p.ten + ' (gắn mã CTMT theo B501)' });
  _ctmtC = null; return r;
}
let _ctmtC = null, _ctmtT = 0;
async function ctmtMap() {
  if (_ctmtC && Date.now() - _ctmtT < 60000) return _ctmtC;
  // Nền: mã CTMT lấy trực tiếp từ các file B501 đã tải (ctmt_map.json + kv dmup:ct), không cần bấm "Gắn mã CTMT"; bảng cv_ctmt_da (nếu đã gắn) ghi đè
  const m = new Map(); try { (await ctmtRows()).forEach((x) => m.set(x.m, { ma: x.c, ten: x.t, gd: x.g, cha: x.h, nhan: x.l, k: x.k, kt: x.kt })); } catch (e) { /* bỏ qua */ }
  let r = []; try { const z = await rpc('cv_ctmt_ds', {}); r = Array.isArray(z) ? z : []; } catch (e) { /* chưa gọi được CSDL */ }
  r.forEach((x) => { if (!m.has(x[0])) m.set(x[0], { ma: x[1], ten: x[2], gd: x[3], cha: x[4], nhan: nhanMa(String(x[1] || '').split(/[;\s]+/).filter(Boolean)) }); });
  _ctmtC = m; _ctmtT = Date.now(); return m;
}
let _cbM = { k: '', t: 0, v: null };
async function canhBaoMa(token) {
  const p = await pv(token), key = p.kbnn || '*';
  if (_cbM.v && _cbM.k === key && Date.now() - _cbM.t < 15000) return _cbM.v;
  const v = new Set(((await dmCanhBao(token)).rows || []).filter((x) => x.loai.some((l) => l !== 'Bỏ qua trực thuộc' && l !== 'Đã phân công cán bộ')).map((x) => x.ma_da)); _cbM = { k: key, t: Date.now(), v }; return v;
}
async function dmDs(token, loc, trang) {
  await DOI.nap(); const CM = await ctmtMap(), ctm = (x) => { const c = CM.get(x.ma_da); if (c && c.k) { x.ctK = c.k; x.ctKt = c.kt || ''; } return c ? Object.assign(x, { ctMa: c.ma, ctTen: c.ten, ctNhan: c.nhan || '' }) : x; };
  const p = await pv(token), { kbnn, o } = locChuan(loc, p), tr = Math.max(0, parseInt(trang, 10) || 0);
  if (loc && loc.sach) {   // tra cứu: không hiện dự án đang bị cảnh báo cần hoàn thiện
    const ex = await canhBaoMa(token), r0 = await goiDs(kbnn, o, 0, 20000);
    let tat = (r0.rows || []).map(HANG).filter((x) => !ex.has(x.ma_da)).filter((x) => { const c = CM.get(x.ma_da); return !(c && c.k && !c.kt); });   // mã CTMT không thuộc QG phải có tên mới vào danh mục
    const qg = (x) => !!(CM.get(x.ma_da) || {}).ma, kk = (x) => !!(CM.get(x.ma_da) || {}).k, soQg = tat.filter(qg).length, soKhac = tat.filter((x) => !qg(x) && kk(x)).length, soCo = soQg + soKhac, soKhong = tat.length - soCo;
    if (loc.ctf === 'qg') tat = tat.filter(qg); else if (loc.ctf === 'khac') tat = tat.filter((x) => !qg(x) && kk(x)); else if (loc.ctf === 'co') tat = tat.filter((x) => qg(x) || kk(x)); else if (loc.ctf === 'khong') tat = tat.filter((x) => !qg(x) && !kk(x));
    return { kpi: r0.kpi, soCo, soQg, soKhac, soKhong, tong: tat.length, trang: tr, per: PER, rows: tat.slice(tr * PER, tr * PER + PER).map((x) => { const t = haiTen(x.ma_da); return ctm(t ? Object.assign(x, { tenB: t[0], tenT: t[1] }) : x); }) };
  }
  const r = await goiDs(kbnn, o, tr, PER);
  return { kpi: r.kpi, tong: r.tong, trang: tr, per: PER, rows: (r.rows || []).map(HANG).map((x) => { const t = haiTen(x.ma_da); return ctm(t ? Object.assign(x, { tenB: t[0], tenT: t[1] }) : x); }) };
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
  _cbM.v = null;
  await DOI.nap();
  const p = await pv(token); ma = s(ma); if (!ma) throw E('Thiếu mã dự án.');
  const o = kiemRec(rec, CAC_COT, (await ctInfo()).mau); if (!Object.keys(o).length) throw E('Không có gì để lưu.');
  if (p.kbnn) { delete o.ten_da; delete o.kbnn; }   // tên dự án, mã dự án, phòng giao dịch: chỉ Chuyên viên THBC được sửa
  // Tên dự án chỉ Chuyên viên THBC được sửa (PGD đã bị bỏ ten_da ở trên): chọn tên B501 / TT85, hoặc nhập tên khác khi cả hai đều chưa đúng
  // Phòng giao dịch không tự sửa chủ đầu tư trực thuộc (cdt) – phải đề xuất, chuyên viên THBC duyệt
  if (p.kbnn && o.cdt && !(o.cdt2 && o.cdt2 === o.cdt)) delete o.cdt;
  if (!Object.keys(o).length) throw E('Phòng giao dịch chỉ đề xuất chủ đầu tư trực thuộc, chưa lưu trực tiếp.');
  await rpc('cv_dm_sua', { p_ma: ma, p_rec: o, p_who: p.ten + ' (CV1953)', p_gh: p.kbnn });
  return { ok: 1 };
}
async function dmThem(token, ma, rec) {
  _cbM.v = null;
  const p = await pv(token); ma = s(ma); if (!ma) throw E('Chưa nhập mã dự án.');
  if (!/^[0-9A-Za-z._-]{3,30}$/.test(ma)) throw E('Mã dự án không hợp lệ.');
  const o = kiemRec(rec, CAC_COT, (await ctInfo()).mau);
  if (!o.cdt || !o.cdt2) throw E('Phải chọn chủ đầu tư lớn.');
  if (p.kbnn) o.kbnn = p.kbnn; else if (!o.kbnn) throw E('Chưa chọn phòng giao dịch (KBNN giao dịch).');
  const tt = p.kbnn && o.cdt !== o.cdt2 ? o.cdt : '';
  if (p.kbnn) o.cdt = o.cdt2;
  await rpc('cv_dm_them', { p_ma: ma, p_rec: o, p_who: p.ten + ' (CV1953)', p_gh: p.kbnn });
  if (tt) { await rpc('cv_dm_dx_gui', { p_ma: ma, p_tt: tt, p_who: p.ten + ' (CV1953)', p_gh: p.kbnn }); try { await dongBoDx(); } catch (e) { /* bỏ qua */ } }
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
// Cập nhật tên dự án theo file "So sánh tên DA B501 – TT85": chỉ đổi tên khi độ giống >= 60% (cột "Xử lý tên" = "Đã thay…"),
// thêm dự án chưa có trong danh mục (chưa có chủ đầu tư). Các dự án độ giống thấp được giữ nguyên để rà soát.
async function dmTenFile(token, tenFile, b64, ghi) {
  const p = await pv(token); if (p.kbnn) throw E('Chỉ Phòng NV2 được cập nhật tên dự án hàng loạt.');
  const { docXlsx } = require('./xlsxread'), nf = (x) => String(x == null ? '' : x).normalize('NFC').trim(), buf = Buffer.from(String(b64 || ''), 'base64');
  const doc = (re) => { try { return docXlsx(buf, re); } catch (e) { throw E(e.message || 'Không đọc được file Excel.'); } };
  const a = doc(/So s[aá]nh t[eê]n/i), b = doc(/B5 c[oó]/i);
  const tim = (rows, tieuDe) => { const h = rows.findIndex((r) => (r || []).some((x) => nf(x) === tieuDe)); return h; };
  const ha = tim(a, 'Mã dự án'), hb = tim(b, 'Mã dự án');
  if (ha < 0 || hb < 0) throw E('File không đúng mẫu "So sánh tên DA B501 – TT85" (cần sheet "So sánh tên B5-TT85" và "B5 có - TT85 không").');
  const ca = (re) => a[ha].findIndex((x) => re.test(nf(x))), cb = (re) => b[hb].findIndex((x) => re.test(nf(x)));
  const cMa = ca(/^Mã dự án/), cTen = ca(/^Tên trong B501/), cGiong = ca(/^Độ giống/), cXl = ca(/^Xử lý tên/);
  const bMa = cb(/^Mã dự án/), bTen = cb(/^Tên dự án \(B501\)/), bCdt = cb(/^Chủ đầu tư lớn/);
  if ([cMa, cTen, cGiong, cXl, bMa, bTen, bCdt].some((x) => x < 0)) throw E('Thiếu cột trong file (Mã dự án, Tên trong B501, Độ giống, Xử lý tên…).');
  const ren = [], giu = []; let khop = 0;
  for (const r of a.slice(ha + 1)) {
    const ma = nf(r[cMa]); if (!ma) continue; const gi = Number(String(r[cGiong]).replace(',', '.')), xl = nf(r[cXl]);
    if (/^Đã thay/i.test(xl) && gi >= 0.6 && nf(r[cTen])) ren.push({ m: ma, t: nf(r[cTen]) });
    else if (/^Giữ/i.test(xl)) giu.push(ma); else khop++;
  }
  const add = []; for (const r of b.slice(hb + 1)) { const ma = nf(r[bMa]); if (ma && /^Chưa có trong Danh mục/i.test(nf(r[bCdt])) && nf(r[bTen])) add.push({ m: ma, t: nf(r[bTen]) }); }
  const kq = { soDoiTen: ren.length, soThem: add.length, soGiu: giu.length, soKhop: khop };
  if (!ghi) return kq;
  const r = await rpc('cv_dm_cap_nhat_ten', { p_ren: ren, p_add: add, p_who: p.ten + ' (cập nhật theo file B501)' });
  return Object.assign(kq, { daDoi: r.doi, daThem: r.them });
}
// Áp dụng danh sách đã chốt (lib/b501_ten.json, lập từ file so sánh B501 – TT85): đổi tên khi độ giống >= 60%, thêm dự án chưa có trong danh mục
async function dmTenCoSan(token, ghi) {
  const p = await pv(token); if (p.kbnn) throw E('Chỉ Phòng NV2 được cập nhật tên dự án hàng loạt.');
  const d = require('./b501_ten.json'), kq = { soDoiTen: d.ren.length, soThem: d.add.length, soGiu: d.giu, soKhop: d.khop };
  if (!ghi) return kq;
  const r = await rpc('cv_dm_cap_nhat_ten', { p_ren: d.ren, p_add: d.add, p_who: p.ten + ' (cập nhật tên theo B501)' });
  return Object.assign(kq, { daDoi: r.doi, daThem: r.them });
}
// Đồng bộ danh mục theo B501 + TT85 (lib/dm_moi.json): giữ dự án có số liệu, tên theo B501, phòng GD theo mã kho bạc. ghi=false chỉ đếm.
async function dmDongBo(token, ghi) {
  _cbM.v = null;
  const p = await pv(token); if (p.kbnn) throw E('Chỉ Phòng NV2 được cập nhật danh mục hàng loạt.');
  const r = await rpc('cv_dm_dong_bo', { p_rows: require('./dm_moi.json'), p_ghi: !!ghi, p_who: p.ten + ' (đồng bộ danh mục theo B501/TT85)' });
  _ct = null; return r;
}
async function dmCanHT(token) {
  const p = await pv(token);
  const ds = await rpc('cv_dm_can_ht', { p_ten_mau: (await ctInfo()).ten, p_kbnn: p.kbnn });
  return ds || [];
}
async function dmDeXuat(token, ma, tt) {
  const p = await pv(token); ma = s(ma); tt = s(tt);
  if (!ma) throw E('Thiếu mã dự án.');
  if (!p.kbnn) throw E('Phòng NV2 sửa trực tiếp, không cần đề xuất.');
  if (tt) { const m = (await ctInfo()).mau.get(chuan(tt)); if (!m) throw E('"' + tt + '" chưa có trên mẫu báo cáo. Hãy chọn tên chủ đầu tư trong danh sách.'); tt = m; }
  const r = await rpc('cv_dm_dx_gui', { p_ma: ma, p_tt: tt, p_who: p.ten + ' (CV1953)', p_gh: p.kbnn });
  try { await dongBoDx(); } catch (e) { /* không chặn việc gửi đề xuất */ }
  return r;
}
// Khóa so sánh tên chủ đầu tư: bỏ khác biệt viết hoa, "&" = "và", "VP" = "Văn phòng", dấu câu, khoảng trắng
const khoaTen = (x) => String(x || '').toLowerCase().replace(/&/g, ' và ').replace(/\bvp\b/g, ' văn phòng ').replace(/[.,;:()\-–/]/g, ' ').replace(/\s+/g, ' ').trim();
// Đề xuất chủ đầu tư trực thuộc đang chờ duyệt: tự đổi đúng từng ký tự theo tên chuẩn đã có trong Danh mục chủ đầu tư (tên cũ nhất trong các cách viết giống nhau)
async function dongBoDx() {
  const ld = await rpc('cv_dm_dx_ds', { p_kbnn: null }); if (!Array.isArray(ld)) return 0;
  let cho = ld.filter((x) => x[8] === 'cho' && x[4]); if (!cho.length) return 0;
  const dm = ((await rpc('cv_dm_cdt_ds', {}) || {}).rows || []).filter((x) => x[3]).map((x) => ({ id: x[0], lon: x[2], tt: x[3] }));
  const idx = new Map(); dm.slice().sort((a, b) => a.id - b.id).forEach((x) => { const k = khoaTen(x.lon) + '|' + khoaTen(x.tt); if (!idx.has(k)) idx.set(k, x.tt); });
  const co = new Set(dm.map((x) => x.lon + '|' + x.tt)); let tu = 0;
  for (const x of cho) {
    let tt = x[4]; const t = idx.get(khoaTen(x[2]) + '|' + khoaTen(x[4]));
    if (t && t !== tt) { await rpc('cv_dm_dx_doi_tt', { p_ma: x[0], p_tt: t }); tt = t; }
    // Chủ đầu tư trực thuộc đã có trong Danh mục chủ đầu tư (đã được Chuyên viên THBC duyệt): tự duyệt đề xuất của dự án
    if (co.has(x[2] + '|' + tt)) { await rpc('cv_dm_dx_duyet', { p_ma: x[0], p_ok: true, p_who: 'Hệ thống (tự duyệt – chủ đầu tư trực thuộc đã có trong danh mục)', p_ly_do: '' }); tu++; }
  }
  if (tu) _cbM.v = null;
  return tu;
}
async function dmDxDs(token) {
  const p = await pv(token);
  if (!p.kbnn) { try { await dongBoDx(); } catch (e) { /* không chặn việc xem danh sách */ } }
  const r = await rpc('cv_dm_dx_ds', { p_kbnn: p.kbnn }) || [];
  return { duyet: !p.kbnn, rows: r.map((x) => ({ ma_da: x[0], ten_da: x[1] || '', cdt2: x[2] || '', cdt: x[3] || '', tt: x[4] || '', nguoi: x[5] || '', kbnn: x[6] || '', luc: x[7] || '', tt_: x[8], ly_do: x[9] || '' })) };
}
async function dmDxDuyet(token, ma, ok, lyDo) {
  const p = await pv(token);
  if (p.kbnn) throw E('Chỉ Phòng NV2 mới duyệt được chủ đầu tư trực thuộc.');
  ma = s(ma);
  const ld = ok ? await rpc('cv_dm_dx_ds', { p_kbnn: null }) : null, dx = Array.isArray(ld) ? ld.find((x) => x[0] === ma) : null;
  const r = await rpc('cv_dm_dx_duyet', { p_ma: ma, p_ok: !!ok, p_who: p.ten + ' (CV1953)', p_ly_do: s(lyDo) });
  _cbM.v = null;
  if (ok && dx && dx[4] && dx[2]) {   // duyệt xong: cặp CĐT lớn › trực thuộc chưa có trong Danh mục chủ đầu tư thì tự thêm
    const k = (x) => chuan(x || ''), d = await cdtDs(token);
    if (!d.rows.some((x) => k(x.lon) === k(dx[2]) && k(x.tt) === k(dx[4]))) {
      const l = d.rows.find((x) => k(x.lon) === k(dx[2]));
      await cdtLuu(token, null, { khoi: l ? l.khoi : 'Khối tỉnh', cdt_lon: dx[2], cdt_tt: dx[4], ghi_chu: '' });
    }
  }
  return r;
}
async function dmCanhBao(token) {
  const p = await pv(token);
  const r = await rpc('cv_dm_canh_bao', { p_kbnn: p.kbnn }) || {};
  const rows = (r.rows || []).map((x) => ({ ma_da: x[0], ten_da: x[1] || '', cdt: x[2] || '', cdt2: x[3] || '', kbnn: x[4] || '', loai: x[5] || [], ly_do: x[6] || '' }));
  const nhom = Object.assign({}, r.nhom || {}); let tong = r.tong || 0;
  // Cảnh báo "chưa có dòng trong biểu" do CSDL tính theo khung cũ: bỏ nếu khung biểu (đã tự thêm chủ đầu tư/phòng mới) nay đã có dòng
  try {
    await require('./dmdyn').nap(); lapDong();
    const L1 = 'Phòng chưa có dòng chủ đầu tư này trong biểu', L2 = 'Chủ đầu tư chưa có dòng nào trong biểu';
    for (let i = rows.length - 1; i >= 0; i--) {
      const x = rows[i], k = BT.chuan(x.cdt || x.cdt2 || '');
      x.loai = x.loai.filter((l) => !((l === L1 && DONG_BIEU.has(k + '|' + pgdChuan(x.kbnn))) || (l === L2 && CO_DONG.has(k))));
      if (!x.loai.length) rows.splice(i, 1);
    }
    Object.keys(nhom).forEach((k) => { nhom[k] = 0; }); rows.forEach((x) => x.loai.forEach((l) => { nhom[l] = (nhom[l] || 0) + 1; }));
    Object.keys(nhom).forEach((k) => { if (!nhom[k]) delete nhom[k]; });
  } catch (e) { /* giữ nguyên cảnh báo gốc nếu lỗi */ }
  tong = rows.length;
  // Cảnh báo đối chiếu B501 / TT85 (theo file so sánh lib/so_sanh_b501_tt85.json)
  try {
    const SS = await DOI.nap(), KHAC = { 'Khác nội dung tên': 1, 'Tên một bên ngắn hơn (thiếu phần đuôi)': 1 }, idx = new Map(rows.map((x) => [x.ma_da, x])), HX = await htDoc();
    const them = (b, nhan, ly) => {
      if (HX[b[0]] && nhan !== 'CTMT chưa xác định') return;   // đã hoàn thiện ở màn hình Hoàn thiện (chọn tên / xác nhận theo dõi)
      let e = idx.get(b[0]); if (!e) { e = { ma_da: b[0], ten_da: b[1] || '', cdt: b[2] || '', cdt2: b[3] || '', kbnn: b[4] || '', loai: [], ly_do: '' }; idx.set(b[0], e); rows.push(e); tong++; }
      e.loai.push(nhan); e.ly_do = (e.ly_do ? e.ly_do + '; ' : '') + ly; nhom[nhan] = (nhom[nhan] || 0) + 1;
    };
    (await banDo()).forEach((b) => {
      if (p.kbnn && (b[4] || '') !== p.kbnn) return;
      const o = SS[b[0]];
      if (!o) return them(b, 'Không có ở B501 và TT85', 'Mã dự án không có trong file B501 và TT85');
      if (o.s === 'B') return them(b, 'Có ở B501, không có ở TT85', o.n ? 'B501 có số liệu, TT85 không có mã này' : 'B501 toàn số 0, TT85 không có mã này');
      if (o.s === 'T') return them(b, 'Có ở TT85, không có ở B501', 'TT85: ' + (o.t || '') + (o.ph ? ' (phần ' + o.ph + ')' : ''));
      if (KHAC[o.x]) them(b, 'Tên B501 khác TT85', 'B501: ' + o.b + ' | TT85: ' + (o.t || '') + ' (giống ' + Math.round((o.g || 0) * 100) + '%)');
    });
    // Mã CTMT trên B501 không có trong mục lục ngân sách (TT 324/2016, TT 130/2025, TT 123/2026) – có thể hạch toán sai
    const M0 = await ctmtGop(), BD = new Map((await banDo()).map((b) => [b[0], b]));
    Object.keys(M0).forEach((m) => { const x = M0[m].x, b = BD.get(m); if (!x || !x.length || !b || (p.kbnn && (b[4] || '') !== p.kbnn)) return; them(b, 'CTMT chưa xác định', 'Mã CTMT ' + x.join(', ') + ' không thuộc CTMT QG – xác định là CTMT và điền tên CTMT (hoặc sửa thành mã CTMT QG đúng)'); });
  } catch (e) { /* bỏ qua cảnh báo bổ sung nếu lỗi */ }
  // Bổ sung thông tin: chưa có cán bộ chuyên quản; thiếu chủ đầu tư trực thuộc (chỉ khi chủ đầu tư lớn có đơn vị trực thuộc trong Danh mục; được bỏ qua nếu không có)
  const LBQ = 'Bỏ qua trực thuộc';
  try {
    const cq = (await kvDoc('dm:cbcq')).m || {}, bq = (await kvDoc('dm:ttbq')).m || {}, cbMa = new Set((await cbqDoc()).map((x) => x.ma)), ci = await ctInfo();
    const ttL = new Map(); Object.keys(ci.tt || {}).forEach((k) => { if ((ci.tt[k] || []).length) ttL.set(chuan(k), 1); });
    const idx = new Map(rows.map((x) => [x.ma_da, x])), them = (b, nhan, ly) => {
      let e = idx.get(b[0]); if (!e) { e = { ma_da: b[0], ten_da: b[1] || '', cdt: b[2] || '', cdt2: b[3] || '', kbnn: b[4] || '', loai: [], ly_do: '' }; idx.set(b[0], e); rows.push(e); }
      e.loai.push(nhan);
    };
    (await banDo()).forEach((b) => {
      if (p.kbnn && (b[4] || '') !== p.kbnn) return;
      if (!cq[b[0]] || !cbMa.has(cq[b[0]])) them(b, 'Chưa có cán bộ chuyên quản'); else them(b, 'Đã phân công cán bộ');
      const lon = b[3] || b[2] || '';
      if (lon && ttL.has(chuan(lon)) && (!b[2] || b[2] === lon)) them(b, bq[b[0]] ? LBQ : 'Thiếu chủ đầu tư trực thuộc');
    });
    rows.forEach((x) => { x.cq = cbMa.has(cq[x.ma_da]) ? cq[x.ma_da] : ''; });
  } catch (e) { /* bỏ qua phần bổ sung nếu lỗi */ }
  try { const CM = await ctmtMap(), BD = new Map((await banDo()).map((b) => [b[0], b[6] || ''])); rows.forEach((x) => { const c = CM.get(x.ma_da); if (c) { x.ctMa = c.ma; x.ctTen = c.ten; x.ctNhan = c.nhan || ''; } if (c && c.k) { x.ctK = c.k; x.ctKt = c.kt || ''; } x.ctmt = BD.get(x.ma_da) || ''; }); } catch (e) { /* thiếu CTMT thì bỏ qua */ }
  Object.keys(nhom).forEach((k) => delete nhom[k]); rows.forEach((x) => x.loai.forEach((l) => { nhom[l] = (nhom[l] || 0) + 1; }));
  tong = rows.filter((x) => x.loai.some((l) => l !== LBQ && l !== 'Đã phân công cán bộ')).length;
  return { tong, nhom, rows };
}
// ---- Cán bộ chuyên quản: danh sách khai báo theo phòng (kv dm:cbql) và gán cho dự án (kv dm:cbcq: mã dự án -> mã nhân viên) ----
const CBQ_MA = /^[a-z][a-z0-9._-]{2,31}$/;
const kvGhi = (k, v) => L._.db().q('INSERT INTO kv (k,v) VALUES ($1,$2) ON CONFLICT (k) DO UPDATE SET v=excluded.v', [k, JSON.stringify(v)]);
async function cbqDoc() { const r = await kvDoc('dm:cbql'); return Array.isArray(r.ds) ? r.ds : []; }
async function cbqDem() { const m = (await kvDoc('dm:cbcq')).m || {}, c = {}; Object.keys(m).forEach((k) => { c[m[k]] = (c[m[k]] || 0) + 1; }); return c; }
// ---- Hoàn thiện phòng giao dịch: dự án chưa có phòng giao dịch, mọi phòng đều thấy và gán được ----
const dsPgd = () => [...new Set(Object.values(MA_PGD))].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
async function pgdThieuDs(token) {
  await pv(token);
  const rows = (await banDo()).filter((b) => !(b[4] || '').trim()).map((b) => ({ ma: b[0], ten: b[1] || '', cdt2: b[3] || '', cdt: b[2] || '' }));
  return { rows: rows.sort((a, b) => a.ma.localeCompare(b.ma)), pgd: dsPgd() };
}
async function pgdThieuGan(token, ma, kbnn) {
  const p = await pv(token); ma = s(ma); kbnn = s(kbnn);
  if (!ma) throw E('Thiếu mã dự án.');
  if (!dsPgd().includes(kbnn)) throw E('Phòng giao dịch không hợp lệ.');
  const b = (await banDo()).find((x) => x[0] === ma);
  if (!b) throw E('Không có mã dự án ' + ma + '.');
  if ((b[4] || '').trim()) throw E('Dự án ' + ma + ' đã có phòng giao dịch (' + b[4] + '), tải lại danh sách.');
  await rpc('cv_dm_sua', { p_ma: ma, p_rec: { kbnn }, p_who: p.ten + ' (CV1953 – hoàn thiện phòng GD)', p_gh: null });
  _cbM.v = null; return { ok: 1 };
}
async function cbqDs(token) {
  const p = await pv(token), ds = (await cbqDoc()).filter((x) => !p.kbnn || x.kbnn === p.kbnn), dem = await cbqDem();
  return { phong: p.kbnn || '', phongs: p.kbnn ? [] : [...new Set(Object.values(MA_PGD))], rows: ds.sort((a, b) => (a.kbnn || '').localeCompare(b.kbnn || '', 'vi') || (a.ten || '').localeCompare(b.ten || '', 'vi')).map((x) => Object.assign({}, x, { so: dem[x.ma] || 0 })) };
}
async function cbqLuu(token, rec) {
  const p = await pv(token); rec = rec || {}; const ten = s(rec.ten).replace(/\s+/g, ' '), ma = s(rec.ma).toLowerCase(), id = s(rec.id);
  if (ten.length < 2 || ten.length > 60) throw E('Nhập họ và tên cán bộ chuyên quản (2–60 ký tự).');
  if (!CBQ_MA.test(ma)) throw E('Mã nhân viên gồm chữ cái đầu, chữ thường hoặc số, 3–32 ký tự, ví dụ: hanhht04.');
  const kb = p.kbnn || s(rec.kbnn); if (!kb) throw E('Chọn phòng giao dịch của cán bộ.');
  const ds = await cbqDoc(), trung = ds.find((x) => x.ma === ma && x.id !== id); if (trung) throw E('Mã nhân viên "' + ma + '" đã có (' + trung.ten + ' – ' + trung.kbnn + ').');
  if (id) {
    const i = ds.findIndex((x) => x.id === id); if (i < 0) throw E('Không tìm thấy cán bộ.');
    const cu = ds[i]; if (p.kbnn && cu.kbnn !== p.kbnn) throw E('Cán bộ không thuộc phòng giao dịch của bạn.');
    if (cu.ma !== ma) { const d = (await kvDoc('dm:cbcq')).m || {}; let n = 0; Object.keys(d).forEach((k) => { if (d[k] === cu.ma) { d[k] = ma; n++; } }); if (n) await kvGhi('dm:cbcq', { m: d }); }
    ds[i] = Object.assign({}, cu, { ten, ma });
  } else ds.push({ id: Date.now() + '' + Math.floor(Math.random() * 1000), ten, ma, kbnn: kb, nguoi: p.ten, luc: Date.now() });
  await kvGhi('dm:cbql', { ds }); _cbM.v = null; return { ok: 1 };
}
async function cbqXoa(token, id) {
  const p = await pv(token), ds = await cbqDoc(), x = ds.find((y) => y.id === s(id)); if (!x) throw E('Không tìm thấy cán bộ.');
  if (p.kbnn && x.kbnn !== p.kbnn) throw E('Cán bộ không thuộc phòng giao dịch của bạn.');
  const n = (await cbqDem())[x.ma] || 0; if (n) throw E('Cán bộ đang được phân công cho ' + n + ' dự án – không xóa được.');
  await kvGhi('dm:cbql', { ds: ds.filter((y) => y.id !== x.id) }); _cbM.v = null; return { ok: 1 };
}
async function kiemDa(p, mas) {   // dự án có trong danh mục; phòng giao dịch chỉ thao tác dự án của phòng mình
  const BD = new Map((await banDo()).map((b) => [b[0], b]));
  mas.forEach((m) => { const b = BD.get(m); if (!b) throw E('Dự án ' + m + ' không có trong danh mục.'); if (p.kbnn && (b[4] || '') !== p.kbnn) throw E('Dự án ' + m + ' không thuộc phòng giao dịch của bạn.'); });
  return BD;
}
const dsMa = (mas) => { mas = (Array.isArray(mas) ? mas : [mas]).map(s).filter(Boolean); if (!mas.length) throw E('Thiếu mã dự án.'); if (mas.length > 500) throw E('Quá nhiều dự án một lần (tối đa 500).'); return mas; };
// Gán cán bộ chuyên quản (mã nhân viên) cho dự án; maNv rỗng = hủy phân công. Cán bộ phải thuộc đúng phòng giao dịch của dự án.
async function dmCbcqLuu(token, mas, maNv) {
  const p = await pv(token); maNv = s(maNv).toLowerCase(); mas = dsMa(mas);
  const BD = await kiemDa(p, mas);
  if (maNv) { const cb = (await cbqDoc()).find((x) => x.ma === maNv); if (!cb) throw E('Cán bộ "' + maNv + '" chưa có trong danh sách – khai báo ở mục Cán bộ chuyên quản.'); mas.forEach((m) => { const kb = BD.get(m)[4] || ''; if (kb !== cb.kbnn) throw E('Dự án ' + m + ' thuộc ' + kb + ', còn cán bộ ' + cb.ten + ' thuộc ' + cb.kbnn + '.'); }); }
  const m = (await kvDoc('dm:cbcq')).m || {}; mas.forEach((x) => { if (maNv) m[x] = maNv; else delete m[x]; });
  await kvGhi('dm:cbcq', { m }); _cbM.v = null; return { ok: 1, so: mas.length };
}
// Tiến độ danh mục (trang chủ): bao nhiêu dự án đã xong, chưa phân công, cần hoàn thiện
async function dmTienDo(token) {
  const p = await pv(token), cb = await dmCanhBao(token), rows = cb.rows || [];
  let tong = 0; try { tong = (await banDo()).filter((b) => !p.kbnn || (b[4] || '') === p.kbnn).length; } catch (e) { tong = 0; }
  const co = (x) => x.loai.filter((l) => l !== 'Đã phân công cán bộ' && l !== 'Bỏ qua trực thuộc');
  const chuaPc = rows.filter((x) => x.loai.includes('Chưa có cán bộ chuyên quản')).length;
  const canHt = rows.filter((x) => x.cq && co(x).length).length;
  const con = rows.filter((x) => co(x).length).length;
  return { tong, xong: Math.max(0, tong - con), chuaPc, canHt };
}
// Liên hệ hỗ trợ (kv tb:lienhe): THBC ghi, mọi người xem ở trang chủ
const LIEN_HE_MAC_DINH = 'Liên hệ phòng Nghiệp vụ 2 để được hỗ trợ: Đ/c Hoàng Thúy Hạnh - 0368684368, Đ/c Trương Trung Kiên - 0962659686';   // hiện khi chưa ai nhập liên hệ
async function lhLay(token) { const p = await pv(token), r = await kvDoc('tb:lienhe'); return { text: s(r.text) || LIEN_HE_MAC_DINH, sua: !p.kbnn }; }
async function lhGhi(token, text) {
  const p = await pv(token); if (p.kbnn) throw E('Chỉ Phòng NV2 mới sửa được thông tin liên hệ.');
  text = s(text); if (text.length > 500) throw E('Thông tin liên hệ tối đa 500 ký tự.');
  await kvGhi('tb:lienhe', { text }); return { ok: 1 };
}
// Hòm thư góp ý (kv gopy): mọi tài khoản gửi; phòng giao dịch chỉ thấy góp ý của phòng mình; Phòng NV2 thấy tất cả và trả lời
const GY_LOAI = ['Lỗi / sự cố', 'Đề xuất tính năng', 'Số liệu / danh mục', 'Hướng dẫn sử dụng', 'Khác'];
async function gyGui(token, loai, nd) {
  const p = await pv(token); nd = s(nd).replace(/\r/g, '');
  if (nd.length < 5) throw E('Nội dung góp ý quá ngắn.'); if (nd.length > 1500) throw E('Nội dung góp ý tối đa 1500 ký tự.');
  const r = await kvDoc('gopy'), ds = r.ds || [];
  if (ds.length >= 1500) ds.shift();
  ds.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ten: p.ten, dv: p.kbnn || 'Phòng Nghiệp vụ 2', loai: GY_LOAI.includes(loai) ? loai : 'Khác', nd, luc: Date.now(), tl: '', tlNguoi: '', tlLuc: 0 });
  await kvGhi('gopy', { ds }); return { ok: 1 };
}
async function gyDs(token) {
  const p = await pv(token), ds = (await kvDoc('gopy')).ds || [], sua = !p.kbnn;
  return { sua, loai: GY_LOAI, chua: sua ? ds.filter((x) => !x.tl).length : 0, ds: (sua ? ds : ds.filter((x) => x.dv === p.kbnn)).slice().reverse().slice(0, 200) };
}
async function gyTraLoi(token, id, text) {
  const p = await pv(token); if (p.kbnn) throw E('Chỉ Phòng NV2 mới trả lời góp ý.');
  text = s(text); if (text.length > 1000) throw E('Nội dung trả lời tối đa 1000 ký tự.');
  const r = await kvDoc('gopy'), x = (r.ds || []).find((y) => y.id === id); if (!x) throw E('Không tìm thấy góp ý.');
  x.tl = text; x.tlNguoi = text ? p.ten : ''; x.tlLuc = text ? Date.now() : 0; await kvGhi('gopy', r); return { ok: 1 };
}
// Thông báo chung (kv tb:chung): THBC ghi, mọi người xem ở trang chủ
async function tbLay(token) { const p = await pv(token), r = await kvDoc('tb:chung'); return { text: s(r.text), luc: r.luc || 0, nguoi: s(r.nguoi), sua: !p.kbnn }; }
async function tbGhi(token, text) {
  const p = await pv(token); if (p.kbnn) throw E('Chỉ Phòng NV2 mới đăng thông báo.');
  text = s(text); if (text.length > 600) throw E('Thông báo tối đa 600 ký tự.');
  await kvGhi('tb:chung', { text, luc: Date.now(), nguoi: p.ten }); return { ok: 1 };
}
// Hoàn thiện danh mục dự án (kv dm:htxn: mã dự án -> {tn:'theo'|'tam', ly, st:''|'cho'|'duyet'}): xác nhận tên dự án / dự án chỉ có ở một trong B501, TT85.
// 'tam' = tạm chưa theo dõi (không xóa, khôi phục được); phòng giao dịch đề nghị → THBC xác nhận.
async function htDoc() { return (await kvDoc('dm:htxn')).m || {}; }
async function dmHtLuu(token, ma, tn, lyDo) {
  const p = await pv(token); ma = s(ma); tn = s(tn) || 'theo'; lyDo = s(lyDo);
  if (!ma) throw E('Thiếu mã dự án.');
  if (tn !== 'theo' && tn !== 'tam') throw E('Lựa chọn không hợp lệ.');
  if (tn === 'tam' && lyDo.length < 10) throw E('Ghi lý do tạm chưa theo dõi (ít nhất 10 ký tự).');
  await kiemDa(p, [ma]);
  const m = await htDoc(); m[ma] = { tn, ly: tn === 'tam' ? lyDo : '', st: tn === 'tam' ? (p.kbnn ? 'cho' : 'duyet') : '', nguoi: p.ten, luc: Date.now() };
  await kvGhi('dm:htxn', { m }); _cbM.v = null; return { ok: 1 };
}
async function dmHtDs(token) {   // đề nghị "tạm chưa theo dõi" đang chờ THBC xác nhận
  const p = await pv(token); if (p.kbnn) return { duyet: false, rows: [] };
  const m = await htDoc(), BD = new Map((await banDo()).map((b) => [b[0], b]));
  return { duyet: true, rows: Object.keys(m).filter((k) => m[k].st === 'cho').map((k) => ({ ma_da: k, ten_da: (BD.get(k) || [])[1] || '', kbnn: (BD.get(k) || [])[4] || '', ly: m[k].ly, nguoi: m[k].nguoi, luc: m[k].luc })) };
}
async function dmHtXacNhan(token, ma, ok) {   // ok: xác nhận tạm chưa theo dõi; không ok: tiếp tục theo dõi (cảnh báo hiện lại)
  const p = await pv(token); if (p.kbnn) throw E('Chỉ Phòng NV2 mới xác nhận được.');
  const m = await htDoc(), k = s(ma); if (!m[k]) throw E('Không còn đề nghị cho dự án này.');
  if (ok) m[k].st = 'duyet'; else delete m[k];
  await kvGhi('dm:htxn', { m }); _cbM.v = null; return { ok: 1 };
}
// Bỏ qua cảnh báo "Thiếu chủ đầu tư trực thuộc" (dự án không thuộc đơn vị trực thuộc nào); bo=false: hủy bỏ qua
async function dmTtBoQua(token, mas, bo) {
  const p = await pv(token); mas = dsMa(mas); await kiemDa(p, mas);
  const m = (await kvDoc('dm:ttbq')).m || {}; mas.forEach((x) => { if (bo) m[x] = 1; else delete m[x]; });
  await kvGhi('dm:ttbq', { m }); _cbM.v = null; return { ok: 1, so: mas.length };
}
async function cdtDs(token) {
  const p = await pv(token);
  await require('./dmdyn').nap(); lapDong();   // khung dòng của biểu đã tự thêm chủ đầu tư mới
  const r = await rpc('cv_dm_cdt_ds', {}) || {};
  const rows = (r.rows || []).map((x) => {
    const o = { id: x[0], khoi: x[1], lon: x[2], tt: x[3] || '', ghi_chu: x[4] || '', so: x[6] || 0, thieu: x[10] || [], co_bieu: x[11] !== false, pgd: x[7] || {}, luc: x[8] || '', boi: x[9] || '' };
    const k = BT.chuan(o.tt || o.lon);
    o.khongDong = !CO_DONG.has(k);                                   // CĐT chưa có dòng nào trong biểu
    o.thieu = Object.keys(o.pgd).filter((g) => !DONG_BIEU.has(k + '|' + pgdChuan(g))).sort(); // phòng có dự án nhưng biểu không có dòng
    return o;
  });
  return { sua: !p.kbnn, phong: p.kbnn || '', tatCa: rows.map((x) => ({ khoi: x.khoi, lon: x.lon, tt: x.tt })), rows: p.kbnn ? rows.filter((x) => x.pgd[p.kbnn]).map((x) => Object.assign({}, x, { thieu: x.thieu.filter((k) => k === p.kbnn), so: x.pgd[p.kbnn] || 0, pgd: x.pgd[p.kbnn] ? { [p.kbnn]: x.pgd[p.kbnn] } : {} })) : rows,
    ngoai: p.kbnn ? [] : (r.ngoai || []).map((x) => ({ lon: x[0], tt: x[1], so: x[2] })) };
}
async function cdtLuu(token, id, rec) {
  const p = await pv(token); if (p.kbnn) throw E('Chỉ Phòng NV2 mới sửa được Danh mục chủ đầu tư.');
  const o = {}; for (const k of ['khoi', 'cdt_lon', 'cdt_tt', 'ghi_chu']) o[k] = s(rec && rec[k]);
  o.chua_co_dong = false;
  if (!o.cdt_lon) throw E('Chưa nhập chủ đầu tư lớn.');
  if (o.cdt_tt) {   // không thêm một cách viết khác của tên đã có (VP/Văn phòng, &/và, hoa/thường) – dùng đúng tên chuẩn
    const kl = khoaTen(o.cdt_lon), kt = khoaTen(o.cdt_tt), dm = (await rpc('cv_dm_cdt_ds', {}) || {}).rows || [];
    const trung = dm.find((x) => x[0] !== (id == null ? null : parseInt(id, 10)) && x[3] && khoaTen(x[2]) === kl && khoaTen(x[3]) === kt && x[3] !== o.cdt_tt && (id == null || false));
    if (trung) throw E('Danh mục đã có tên chuẩn "' + trung[3] + '" (chỉ khác cách viết). Hãy dùng đúng tên đó, hoặc sửa/xóa dòng cũ trước.');
  }
  let cu = null;
  if (id != null) { const l = await rpc('cv_dm_cdt_ds', {}) || {}, h = (l.rows || []).find((x) => x[0] === parseInt(id, 10)); if (h) cu = { lon: h[2], tt: h[3] || '' }; }
  const r = await rpc('cv_dm_cdt_luu', { p_id: id == null ? null : parseInt(id, 10), p_rec: o, p_who: p.ten + ' (CV1953)' });
  if (cu && cu.tt !== o.cdt_tt && o.cdt_tt) {   // đổi tên trực thuộc: đề xuất dự án đang chờ duyệt theo tên cũ đổi sang tên mới
    try { const ld = await rpc('cv_dm_dx_ds', { p_kbnn: null }); if (Array.isArray(ld)) for (const x of ld) if (x[8] === 'cho' && x[2] === cu.lon && x[4] === cu.tt) await rpc('cv_dm_dx_doi_tt', { p_ma: x[0], p_tt: o.cdt_tt }); } catch (e) { /* bỏ qua */ }
  }
  if (cu) {   // đổi tên: các đề xuất đã duyệt trước đó hiện theo tên mới
    const ds = await cdtDxDoc(); let doi = 0;
    ds.forEach((x) => { if (x.st === 'duyet' && x.lon === cu.lon && (x.tt || '') === cu.tt) { x.lon = o.cdt_lon; x.tt = o.cdt_tt; doi++; } else if (x.st === 'duyet' && x.lon === cu.lon && o.cdt_lon !== cu.lon) { x.lon = o.cdt_lon; doi++; } });
    if (doi) await cdtDxLuu(ds);
  }
  ctReset(); try { await dongBoDx(); } catch (e) { /* đồng bộ đề xuất không chặn việc lưu */ }
  return r;
}
async function cdtXoa(token, id) {
  const p = await pv(token); if (p.kbnn) throw E('Chỉ Phòng NV2 mới xóa được dòng chủ đầu tư.');
  const r = await rpc('cv_dm_cdt_xoa', { p_id: parseInt(id, 10) }); ctReset(); return r;
}
// Đề xuất thêm chủ đầu tư (lớn hoặc trực thuộc) từ phòng giao dịch → Chuyên viên THBC duyệt rồi mới vào Danh mục chủ đầu tư
const KHOI = ['Khối tỉnh', 'Khối xã, phường'];
async function cdtDxDoc() { const r = await kvDoc('cdt:dx'); return Array.isArray(r.ds) ? r.ds : []; }
const cdtDxLuu = (ds) => L._.db().q('INSERT INTO kv (k,v) VALUES ($1,$2) ON CONFLICT (k) DO UPDATE SET v=excluded.v', ['cdt:dx', JSON.stringify({ ds })]);
async function cdtDeXuat(token, rec) {
  const p = await pv(token); if (!p.kbnn) throw E('Phòng NV2 thêm trực tiếp vào danh mục, không cần đề xuất.');
  const khoi = s(rec && rec.khoi), lon = s(rec && rec.cdt_lon), tt = s(rec && rec.cdt_tt), gc = s(rec && rec.ghi_chu);
  if (!KHOI.includes(khoi)) throw E('Chọn khối: ' + KHOI.join(' / ') + '.');
  if (!lon) throw E('Chưa nhập chủ đầu tư lớn.'); if (lon.length > 300 || tt.length > 300 || gc.length > 300) throw E('Tên quá dài.');
  const d = await cdtDs(token), k = (x) => chuan(x || ''), co = d.rows.some((x) => k(x.lon) === k(lon) && k(x.tt) === k(tt));
  if (co) throw E('Chủ đầu tư này đã có trong Danh mục chủ đầu tư.');
  const ds = await cdtDxDoc();
  if (ds.some((x) => x.st === 'cho' && k(x.lon) === k(lon) && k(x.tt) === k(tt))) throw E('Đã có đề xuất giống như vậy đang chờ duyệt.');
  ds.push({ id: Date.now() + '' + Math.floor(Math.random() * 1000), khoi, lon, tt, gc, kbnn: p.kbnn, nguoi: p.ten, luc: Date.now(), st: 'cho', ly: '' });
  await cdtDxLuu(ds.slice(-300)); return { ok: 1 };
}
// Phòng giao dịch sửa lại đề xuất bị Phòng NV2 từ chối rồi gửi lại để duyệt
async function cdtDxSua(token, id, rec) {
  const p = await pv(token); if (!p.kbnn) throw E('Phòng NV2 dùng chức năng Sửa & duyệt.');
  const ds = await cdtDxDoc(), x = ds.find((y) => y.id === String(id));
  if (!x || x.kbnn !== p.kbnn) throw E('Không tìm thấy đề xuất của phòng bạn.');
  if (x.st !== 'tu_choi') throw E('Chỉ sửa được đề xuất đã bị từ chối.');
  const khoi = s(rec && rec.khoi), lon = s(rec && rec.cdt_lon), tt = s(rec && rec.cdt_tt), gc = s(rec && rec.ghi_chu);
  if (!KHOI.includes(khoi)) throw E('Chọn khối: ' + KHOI.join(' / ') + '.');
  if (!lon) throw E('Chưa nhập chủ đầu tư lớn.'); if (lon.length > 300 || tt.length > 300 || gc.length > 300) throw E('Tên quá dài.');
  const d = await cdtDs(token), k = (v) => chuan(v || '');
  if (d.rows.some((r) => k(r.lon) === k(lon) && k(r.tt) === k(tt))) throw E('Chủ đầu tư này đã có trong Danh mục chủ đầu tư.');
  if (ds.some((y) => y !== x && y.st === 'cho' && k(y.lon) === k(lon) && k(y.tt) === k(tt))) throw E('Đã có đề xuất giống như vậy đang chờ duyệt.');
  x.truoc = { khoi: x.khoi, lon: x.lon, tt: x.tt, gc: x.gc, ly: x.ly, boi: x.boi, luc2: x.luc2 };
  x.khoi = khoi; x.lon = lon; x.tt = tt; x.gc = gc; x.nguoi = p.ten; x.luc = Date.now(); x.st = 'cho'; x.an = 0; x.ly = ''; x.boi = ''; x.luc2 = 0;
  await cdtDxLuu(ds); return { ok: 1 };
}
// Phòng giao dịch xóa đề xuất của phòng mình (đang chờ hoặc đã bị từ chối); đề xuất đã duyệt thì giữ lại làm lịch sử
async function cdtDxXoa(token, id) {
  const p = await pv(token); if (!p.kbnn) throw E('Phòng NV2 xử lý đề xuất bằng Duyệt hoặc Từ chối.');
  const ds = await cdtDxDoc(), x = ds.find((y) => y.id === String(id));
  if (!x || x.kbnn !== p.kbnn) throw E('Không tìm thấy đề xuất của phòng bạn.');
  if (x.st === 'duyet') throw E('Đề xuất đã được duyệt, không xóa được.');
  await cdtDxLuu(ds.filter((y) => y !== x)); return { ok: 1 };
}
// Phòng NV2 gỡ đề xuất đã từ chối khỏi danh sách của mình; phòng giao dịch vẫn thấy để sửa, gửi lại hoặc xóa
async function cdtDxAn(token, id) {
  const p = await pv(token); if (p.kbnn) throw E('Chỉ Phòng NV2 dùng được chức năng này.');
  const ds = await cdtDxDoc(), x = ds.find((y) => y.id === String(id));
  if (!x || x.st !== 'tu_choi') throw E('Chỉ gỡ được đề xuất đã bị từ chối.');
  x.an = 1; await cdtDxLuu(ds); return { ok: 1 };
}
async function cdtDxDs(token) {
  const p = await pv(token), ds = await cdtDxDoc(), rows = ds.filter((x) => p.kbnn ? x.kbnn === p.kbnn : !x.an).sort((a, b) => b.luc - a.luc);
  return { duyet: !p.kbnn, rows: rows.filter((x) => x.st === 'cho').concat(rows.filter((x) => x.st !== 'cho').slice(0, 20)) };
}
async function cdtDxDuyet(token, id, ok, ly, rec) {
  const p = await pv(token); if (p.kbnn) throw E('Chỉ Phòng NV2 được duyệt.');
  const ds = await cdtDxDoc(), x = ds.find((y) => y.id === String(id)); if (!x || x.st !== 'cho') throw E('Đề xuất không còn chờ duyệt.');
  if (ok && rec) {   // THBC sửa lại nội dung đề xuất rồi duyệt
    const khoi = s(rec.khoi), lon = s(rec.cdt_lon), tt = s(rec.cdt_tt), gc = s(rec.ghi_chu);
    if (!KHOI.includes(khoi)) throw E('Chọn khối: ' + KHOI.join(' / ') + '.'); if (!lon) throw E('Chưa nhập chủ đầu tư lớn.');
    x.sua = { khoi: x.khoi, lon: x.lon, tt: x.tt, gc: x.gc }; x.khoi = khoi; x.lon = lon; x.tt = tt; x.gc = gc;
  }
  if (ok) await cdtLuu(token, null, { khoi: x.khoi, cdt_lon: x.lon, cdt_tt: x.tt, ghi_chu: x.gc });
  x.st = ok ? 'duyet' : 'tu_choi'; x.ly = s(ly); x.boi = p.ten; x.luc2 = Date.now(); await cdtDxLuu(ds); return { ok: 1 };
}
// Đề xuất tên dự án khác cả hai tên B501/TT85: phòng giao dịch nhập + bắt buộc ghi lý do → Chuyên viên THBC duyệt
async function tenDxDoc() { const r = await kvDoc('dm:tendx'); return Array.isArray(r.ds) ? r.ds : []; }
const tenDxLuu = (ds) => L._.db().q('INSERT INTO kv (k,v) VALUES ($1,$2) ON CONFLICT (k) DO UPDATE SET v=excluded.v', ['dm:tendx', JSON.stringify({ ds })]);
async function dmTenDeXuat(token, ma, tenMoi, lyDo) {
  const p = await pv(token); ma = s(ma); tenMoi = chuanTen(s(tenMoi)); lyDo = s(lyDo);
  if (!p.kbnn) throw E('Phòng NV2 sửa tên trực tiếp, không cần đề xuất.');
  if (!ma) throw E('Thiếu mã dự án.'); if (!tenMoi) throw E('Chưa nhập tên dự án đề xuất.'); if (tenMoi.length > 500) throw E('Tên dự án quá dài.');
  const h = haiTen(ma), theoMot = h && (tenMoi === h[0] || tenMoi === h[1]);
  if (!theoMot && lyDo.length < 10) throw E('Bắt buộc ghi lý do tên dự án khác cả hai tên B501 và TT85 (ít nhất 10 ký tự).');
  const b = (await banDo()).find((x) => x[0] === ma); if (!b || (b[4] || '') !== p.kbnn) throw E('Dự án không thuộc phòng giao dịch của bạn.');
  if (theoMot && !lyDo) lyDo = 'Đề nghị chọn tên theo ' + (tenMoi === h[0] ? 'B501' : 'TT85');
  const ds = (await tenDxDoc()).filter((x) => !(x.ma === ma && x.st === 'cho'));
  ds.push({ id: Date.now() + '' + Math.floor(Math.random() * 1000), ma, ten_cu: b[1] || '', ten_moi: tenMoi, ly: lyDo, kbnn: p.kbnn, nguoi: p.ten, luc: Date.now(), st: 'cho', ly_tc: '' });
  await tenDxLuu(ds.slice(-300)); return { ok: 1 };
}
async function dmTenDxDs(token) {
  const p = await pv(token), ds = (await tenDxDoc()).filter((x) => !p.kbnn || x.kbnn === p.kbnn).sort((a, b) => b.luc - a.luc);
  return { duyet: !p.kbnn, rows: ds.filter((x) => x.st === 'cho').concat(ds.filter((x) => x.st !== 'cho').slice(0, 20)) };
}
async function dmTenDxDuyet(token, id, ok, ly) {
  const p = await pv(token); if (p.kbnn) throw E('Chỉ Phòng NV2 được duyệt.');
  const ds = await tenDxDoc(), x = ds.find((y) => y.id === String(id)); if (!x || x.st !== 'cho') throw E('Đề xuất không còn chờ duyệt.');
  if (ok) await dmSua(token, x.ma, { ten_da: x.ten_moi });
  x.st = ok ? 'duyet' : 'tu_choi'; x.ly_tc = s(ly); x.boi = p.ten; x.luc2 = Date.now(); await tenDxLuu(ds); return { ok: 1, ma: x.ma, ten: x.ten_moi };
}
async function cdtXuat(token, kieu) {
  const d = await cdtDs(token), lon = kieu === 'lon';   // 'lon': chỉ chủ đầu tư lớn; còn lại: gồm cả trực thuộc
  let rs = d.rows;
  if (lon) { const g = new Map(); d.rows.forEach((x) => { const k = x.khoi + '|' + x.lon, e = g.get(k) || { khoi: x.khoi, lon: x.lon, tt: '', so: 0, pgd: {}, ghi_chu: '', co_bieu: true, thieu: [], nTt: 0 }; e.so += x.so; Object.keys(x.pgd).forEach((q) => { e.pgd[q] = (e.pgd[q] || 0) + x.pgd[q]; }); if (x.tt) e.nTt++; if (!x.co_bieu) e.co_bieu = false; g.set(k, e); }); rs = [...g.values()]; }
  const hd = lon ? ['STT', 'Khối', 'Chủ đầu tư lớn', 'Số chủ đầu tư trực thuộc', 'KBNN nơi giao dịch', 'Tổng số dự án', 'Ghi chú'] : ['STT', 'Khối', 'Chủ đầu tư lớn', 'Chủ đầu tư trực thuộc', 'KBNN nơi giao dịch', 'Tổng số dự án', 'Ghi chú'];
  const rows = [[{ v: 'DANH MỤC CHỦ ĐẦU TƯ' + (lon ? ' (CHỦ ĐẦU TƯ LỚN)' : ' (GỒM CHỦ ĐẦU TƯ TRỰC THUỘC)') + (d.phong ? ' – ' + d.phong.toUpperCase() : ''), s: 6 }], [], hd.map((v) => ({ v, s: 2 }))];
  rs.forEach((x, i) => rows.push([i + 1, x.khoi, x.lon, lon ? x.nTt : x.tt, Object.keys(x.pgd).sort().join('; '), x.so, lon ? '' : ((x.co_bieu ? '' : 'Chưa có dòng nào trong biểu. ') + (x.thieu.length ? 'Thiếu dòng trong biểu tại: ' + x.thieu.join(', ') + '. ' : '') + x.ghi_chu)].map((v, j) => ({ v, s: j === 0 || j === 5 || (lon && j === 3) ? 4 : 3 }))));
  const buf = XL.write({ name: 'Danh muc chu dau tu', cols: [6, 18, 52, 46, 36, 14, 40], rows, merges: ['A1:G1'], landscape: true });
  return { name: lon ? 'Danh_muc_chu_dau_tu_lon.xlsx' : 'Danh_muc_chu_dau_tu_gom_truc_thuoc.xlsx', b64: buf.toString('base64'), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
}
async function banDo() { return (await rpc('cv_dm_ban_do', {})) || []; }
async function dmXuat(token, loc) {
  const p = await pv(token), { kbnn, o } = locChuan(loc, p);
  const r = await goiDs(kbnn, o, 0, 20000), ds = (r.rows || []).map(HANG);
  const CM = await ctmtMap();
  const hd = ['STT', 'Mã dự án', 'Tên dự án', 'Chủ đầu tư lớn', 'Chủ đầu tư trực thuộc', 'KBNN giao dịch', 'Tính chất dự án', 'Chương trình mục tiêu', 'Mã CTMT', 'Nhãn CTMT theo mã', 'Tên gọi theo danh mục mã CTMT', 'Cập nhật trên web'];
  const rows = [[{ v: 'DANH MỤC DỰ ÁN' + (kbnn ? ' – ' + kbnn.toUpperCase() : ''), s: 6 }], [], hd.map((v) => ({ v, s: 2 }))];
  ds.forEach((x, i) => rows.push([i + 1, x.ma_da, x.ten_da, x.cdt2 || x.cdt, (x.cdt2 && x.cdt !== x.cdt2) ? x.cdt : '', x.kbnn, x.dac_thu, x.ctmt, [(CM.get(x.ma_da) || {}).ma, (CM.get(x.ma_da) || {}).k].filter(Boolean).join('; '), (CM.get(x.ma_da) || {}).nhan || '', (CM.get(x.ma_da) || {}).ten || '', x.sua_tay ? (x.boi || 'đã sửa') : ''].map((v, j) => ({ v, s: j === 0 ? 4 : 3 }))));
  const buf = XL.write({ name: 'Danh muc du an', cols: [6, 12, 60, 38, 38, 22, 18, 22, 16, 24, 60, 22], rows, merges: ['A1:L1'], landscape: true });
  return { name: 'Danh_muc_du_an.xlsx', b64: buf.toString('base64'), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
}
// Xuất danh mục dự án kèm cột đề xuất hoàn thiện (chỉ để xem trước, KHÔNG ghi gì vào hệ thống).
// Đề xuất phòng GD: theo mã kho bạc ở file B501 (lib/de_xuat.json). Đề xuất chủ đầu tư: chỉ khi tên dự án có tên xã/phường duy nhất và xã đó vẫn giao dịch ở đúng phòng suy ra từ B501.
const MA_PGD = { 2461: 'Phòng Nghiệp vụ 2', 2465: 'Phòng giao dịch số 17', 2466: 'Phòng giao dịch số 18', 2462: 'Phòng giao dịch số 19', 2470: 'Phòng giao dịch số 20', 2471: 'Phòng giao dịch số 21', 2472: 'Phòng giao dịch số 22', 2473: 'Phòng giao dịch số 23', 2474: 'Phòng giao dịch số 24', 2475: 'Phòng giao dịch số 25', 2476: 'Phòng giao dịch số 26', 2477: 'Phòng giao dịch số 27' };
async function dmXuatDeXuat(token) {
  const p = await pv(token); if (p.kbnn) throw E('Chỉ Phòng NV2 được xuất danh mục đề xuất.');
  const dx = require('./de_xuat.json'), ci = await ctInfo();
  const r = await goiDs(null, locChuan({}, p).o, 0, 20000), ds = (r.rows || []).map(HANG);
  // phòng giao dịch chính của từng xã/phường (theo các dự án đã có)
  const dem = {}; ds.forEach((x) => { const c = x.cdt2 || x.cdt; if (x.kbnn && /^(Xã|Phường) /.test(c)) { (dem[c] = dem[c] || {})[x.kbnn] = ((dem[c] || {})[x.kbnn] || 0) + 1; } });
  const chinh = {}; Object.keys(dem).forEach((c) => { chinh[c] = Object.keys(dem[c]).sort((a, b) => dem[c][b] - dem[c][a])[0]; });
  const xa = Object.keys(chinh).map((c) => ({ c, re: new RegExp('(?:^|[^\\p{L}])(?:xã|phường|thị trấn|tt\\.?)\\s+' + c.replace(/^(Xã|Phường) /, '').toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}\\d])', 'iu') }));
  const SS = await DOI.nap(), nt = (v) => String(v || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
  const hd = ['STT', 'Mã dự án', 'Tên dự án (trên web)', 'Chủ đầu tư lớn', 'Chủ đầu tư trực thuộc', 'KBNN giao dịch', 'Tính chất dự án', 'Chương trình mục tiêu', 'ĐỀ XUẤT: KBNN giao dịch', 'ĐỀ XUẤT: Chủ đầu tư lớn', 'Căn cứ đề xuất', 'Cần rà soát', 'Tên theo B501 (để đối chiếu)', 'Có ở B501', 'Có ở TT85', 'So sánh tên với B501', 'Tên TT85 gốc (khi khác)', 'KBNN theo TT85 (mã mở TK)', 'KBNN web so với TT85'];
  const rows = [[{ v: 'DANH MỤC DỰ ÁN CÓ SỐ LIỆU – ĐỐI CHIẾU B501 / TT85 VÀ ĐỀ XUẤT HOÀN THIỆN (xem trước, chưa sửa trên web)', s: 6 }], [{ v: 'Các cột "ĐỀ XUẤT" chỉ điền cho dự án thiếu phòng giao dịch / chủ đầu tư. Dự án nghi sai tên, thiếu thông tin được GIỮ NGUYÊN và ghi ở cột "Cần rà soát".', s: 7 }], [], hd.map((v) => ({ v, s: 2 }))];
  const dem2 = { lech: 0, pgd: 0, pgdCao: 0, cdtCao: 0, cdtThap: 0, giu: 0, rs: 0 }, cnt = { BT: 0, B: 0, T: 0, khong: 0, khop: 0, khac: 0 };
  const khoiCua = (c) => (/^(Xã|Phường|Thị trấn) /.test(c || '') ? 'Khối xã, phường' : 'Khối tỉnh');
  const nhomCdt = {}, nhomPgd = {}, khacTen = [], webKhongB = [], inDb = new Set(), PG = Object.keys(MA_PGD).map((k) => MA_PGD[k]);
  const loai = { khong: 0, bKhong: 0 }; let stt = 0;
  ds.forEach((x) => {
    inDb.add(x.ma_da);
    const s0 = SS[x.ma_da];
    if (!s0) { loai.khong++; return; }
    if (!s0.n && !s0.ta && !s0.tl) { loai.bKhong++; return; }
    const i = stt++;
    const nhan = [], cc = [], d1 = dx.pgd[x.ma_da], ss = SS[x.ma_da]; let dPgd = '', dCdt = '', b501 = '', soTen = '', tt85g = '';
    const cdtL = x.cdt2 || x.cdt, cdtT = (x.cdt2 && x.cdt !== x.cdt2) ? x.cdt : '';
    if (!x.kbnn) {
      if (s0.k && s0.k.length === 1 && MA_PGD[s0.k[0]] && !(d1 && d1.ma && d1.ma.length === 1 && MA_PGD[d1.ma[0]])) { dPgd = MA_PGD[s0.k[0]]; cc.push('Phòng GD: TT85, mã KBNN mở TK ' + s0.k[0]); dem2.pgd++; }
      else if (d1 && d1.ma && d1.ma.length === 1 && MA_PGD[d1.ma[0]]) { dPgd = MA_PGD[d1.ma[0]]; cc.push('Phòng GD: B501 ' + d1.src + ', mã kho bạc ' + d1.ma[0]); dem2.pgd++; }
      else if (d1 && d1.ma && d1.ma.length > 1) cc.push('B501 có nhiều mã kho bạc (' + d1.ma.join(', ') + ') – cần chọn tay');
      else if (d1) cc.push('B501 ' + d1.src + ' không có mã kho bạc – cần xác định phòng GD'); else cc.push('Không tìm thấy trong 2 file B501 – cần xác định phòng GD');
      nhan.push('Thiếu phòng giao dịch');
    }
    if (!cdtL) {
      nhan.push('Thiếu chủ đầu tư');
      const kq = xa.filter((a) => a.re.test(x.ten_da)).map((a) => a.c);
      if (kq.length === 1) {
        const pd = dPgd || x.kbnn;
        if (pd && chinh[kq[0]] === pd) { dCdt = kq[0]; cc.push('Chủ đầu tư: tên dự án có "' + kq[0] + '", xã này giao dịch tại ' + pd + ' (khớp mã kho bạc) – độ tin cậy cao'); dem2.cdtCao++; }
        else { cc.push('Tên dự án có "' + kq[0] + '" nhưng phòng GD không khớp (xã này thường ở ' + chinh[kq[0]] + ') – cần kiểm tra, chưa đề xuất'); dem2.cdtThap++; }
      } else if (kq.length > 1) { cc.push('Tên dự án nhắc nhiều xã/phường (' + kq.join(', ') + ') – cần chọn tay'); dem2.cdtThap++; }
      else cc.push('Không nhận diện được chủ đầu tư từ tên dự án – để trống');
    } else if (!ci.mau.get(chuan(x.cdt)) || !ci.mau.get(chuan(x.cdt2))) nhan.push('Chủ đầu tư không có trong danh mục chuẩn');
    if (!x.ten_da) nhan.push('Thiếu tên dự án');
    const g = dx.giu[x.ma_da]; if (g) { nhan.push('Tên nghi sai (độ giống với B501 chỉ ' + Math.round(g.g * 100) + '%) – giữ nguyên'); b501 = g.t; dem2.giu++; }
    // đối chiếu B501 / TT85
    const coB = ss && (ss.s === 'BT' || ss.s === 'B'), coT = ss && (ss.s === 'BT' || ss.s === 'T');
    if (!ss) { cnt.khong++; soTen = 'Không có trong B501 và TT85'; nhan.push('Không có ở B501 và TT85'); webKhongB.push([x, 'Không có ở cả B501 và TT85']); }
    else if (ss.s === 'T') { cnt.T++; soTen = 'Chỉ có ở TT85 (B501 không có)'; webKhongB.push([x, 'Chỉ có ở TT85' + (ss.ph ? ' (phần ' + ss.ph + ')' : '') + ' – ' + (ss.dg || '')]); }
    else {
      cnt[ss.s]++; b501 = b501 || ss.b || '';
      if (nt(ss.b) === nt(x.ten_da)) { soTen = 'Khớp B501'; cnt.khop++; b501 = g ? b501 : ''; }
      else { cnt.khac++; soTen = 'Khác B501' + (ss.g != null ? ' (độ giống ' + Math.round(ss.g * 100) + '%)' : ''); tt85g = ss.t || ''; b501 = ss.b || ''; khacTen.push([x, ss, soTen]); if (!g) nhan.push('Tên web khác tên B501'); }
    }
    if (nhan.length) dem2.rs++;
    const kt = (ss && ss.k || []).map((c) => (MA_PGD[c] || c)).join('; ');
    const lech = !x.kbnn || !(ss && ss.k && ss.k.length) ? '' : (ss.k.some((c) => MA_PGD[c] === x.kbnn) ? 'Khớp' : 'LỆCH: web ' + x.kbnn + ' ≠ TT85 ' + kt);
    if (lech.indexOf('LỆCH') === 0) { nhan.push('KBNN trên web lệch TT85'); dem2.lech++; }
    // thống kê theo CĐT và KBNN
    const kg = cdtL || '(chưa có chủ đầu tư)', k2 = kg + '|' + cdtT, kp = x.kbnn || '(chưa có phòng GD)';
    const o = nhomCdt[k2] = nhomCdt[k2] || { lon: kg, tt: cdtT, khoi: cdtL ? khoiCua(cdtL) : '', so: 0, p: {}, b: 0, kb: 0, khac: 0 };
    o.so++; o.p[kp] = (o.p[kp] || 0) + 1; if (coB) o.b++; else o.kb++; if (soTen.indexOf('Khác') === 0) o.khac++;
    const q = nhomPgd[kp] = nhomPgd[kp] || { so: 0, bt: 0, b: 0, t: 0, kh: 0, khop: 0, khac: 0, cdt: new Set(), thieuCdt: 0 };
    q.so++; if (ss && ss.s === 'BT') q.bt++; else if (ss && ss.s === 'B') q.b++; else if (ss && ss.s === 'T') q.t++; else q.kh++; if (soTen === 'Khớp B501') q.khop++; if (soTen.indexOf('Khác') === 0) q.khac++; if (cdtL) q.cdt.add(cdtL); else q.thieuCdt++;
    const nb = (v, j) => ({ v, s: j === 0 ? 4 : ((j === 8 || j === 9) && v ? 8 : 3) });
    rows.push([i + 1, x.ma_da, x.ten_da, cdtL, cdtT, x.kbnn, x.dac_thu, x.ctmt, dPgd, dCdt, cc.join('; '), nhan.join('; '), b501, coB ? 'Có' : 'Không', coT ? (ss.ta ? 'Có' : 'Có (chỉ dư tạm ứng)') : 'Không', soTen, tt85g, kt, lech].map(nb));
  });
  // Sheet theo chủ đầu tư
  const hdC = ['STT', 'Khối', 'Chủ đầu tư lớn', 'Chủ đầu tư trực thuộc', 'Tổng số dự án'].concat(PG, ['(chưa có phòng GD)', 'Có ở B501', 'Không có ở B501', 'Tên khác B501']);
  const cd = Object.keys(nhomCdt).map((k) => nhomCdt[k]).sort((a, b) => (a.khoi < b.khoi ? -1 : a.khoi > b.khoi ? 1 : a.lon.localeCompare(b.lon, 'vi') || a.tt.localeCompare(b.tt, 'vi')));
  const rC = [[{ v: 'DỰ ÁN THEO TỪNG CHỦ ĐẦU TƯ VÀ PHÒNG GIAO DỊCH (theo danh mục trên web)', s: 6 }], [], hdC.map((v) => ({ v, s: 2 }))];
  cd.forEach((o, i) => rC.push([i + 1, o.khoi, o.lon, o.tt, o.so].concat(PG.map((p) => o.p[p] || 0), [o.p['(chưa có phòng GD)'] || 0, o.b, o.kb, o.khac]).map((v, j) => ({ v, s: j >= 4 ? 4 : 3 }))));
  // Sheet theo KBNN
  const rP = [[{ v: 'DỰ ÁN THEO PHÒNG GIAO DỊCH – ĐỐI CHIẾU B501 / TT85', s: 6 }], [], ['Phòng giao dịch', 'Tổng số dự án', 'Số chủ đầu tư', 'Có ở cả B501 và TT85', 'Chỉ có ở B501', 'Chỉ có ở TT85', 'Không có ở cả hai', 'Tên khớp B501', 'Tên khác B501', 'Dự án chưa có chủ đầu tư'].map((v) => ({ v, s: 2 }))];
  PG.concat(['(chưa có phòng GD)']).concat(Object.keys(nhomPgd).filter((k) => PG.indexOf(k) < 0 && k !== '(chưa có phòng GD)')).filter((k) => nhomPgd[k]).forEach((k) => { const q = nhomPgd[k]; rP.push([k, q.so, q.cdt.size, q.bt, q.b, q.t, q.kh, q.khop, q.khac, q.thieuCdt].map((v, j) => ({ v, s: j === 0 ? 3 : 4 }))); });
  // Sheet tên khác B501
  const rK = [[{ v: 'DỰ ÁN CÓ TÊN TRÊN WEB KHÁC TÊN TRONG B501', s: 6 }], [], ['STT', 'Mã dự án', 'Tên trên web', 'Tên theo B501', 'Tên TT85 gốc', 'Độ giống', 'Loại khác biệt', 'Chủ đầu tư lớn', 'KBNN giao dịch'].map((v) => ({ v, s: 2 }))];
  khacTen.sort((a, b) => (a[1].g == null ? 1 : a[1].g) - (b[1].g == null ? 1 : b[1].g)).forEach((e, i) => rK.push([i + 1, e[0].ma_da, e[0].ten_da, e[1].b, e[1].t || '', e[1].g == null ? '' : Math.round(e[1].g * 100) + '%', e[1].x || '', e[0].cdt2 || e[0].cdt, e[0].kbnn].map((v, j) => ({ v, s: j === 0 ? 4 : 3 }))));
  // B501 có - web không có
  const rB = [[{ v: 'DỰ ÁN CÓ TRONG B501 NHƯNG CHƯA CÓ TRONG DANH MỤC TRÊN WEB', s: 6 }], [], ['STT', 'Mã dự án', 'Tên dự án (B501)', 'File B501', 'Có ở TT85', 'Đánh giá', 'Lý do'].map((v) => ({ v, s: 2 }))];
  Object.keys(SS).filter((m) => SS[m].s !== 'T' && SS[m].n && !inDb.has(m)).forEach((m, i) => rB.push([i + 1, m, SS[m].b, SS[m].f || '', SS[m].s === 'BT' ? 'Có' : 'Không', SS[m].dg || '', SS[m].ly || ''].map((v, j) => ({ v, s: j === 0 ? 4 : 3 }))));
  // Web có - B501 không có (TT85 có hoặc không)
  const rW = [[{ v: 'DỰ ÁN CÓ TRÊN WEB NHƯNG KHÔNG CÓ TRONG B501', s: 6 }], [], ['STT', 'Mã dự án', 'Tên dự án (trên web)', 'Chủ đầu tư lớn', 'Chủ đầu tư trực thuộc', 'KBNN giao dịch', 'Tình trạng'].map((v) => ({ v, s: 2 }))];
  webKhongB.forEach((e, i) => rW.push([i + 1, e[0].ma_da, e[0].ten_da, e[0].cdt2 || e[0].cdt, (e[0].cdt2 && e[0].cdt !== e[0].cdt2) ? e[0].cdt : '', e[0].kbnn, e[1]].map((v, j) => ({ v, s: j === 0 ? 4 : 3 }))));
  const soB = Object.keys(SS).filter((m) => SS[m].s !== 'T' && SS[m].n && !inDb.has(m)).length;
  const tt = [[{ v: 'TÓM TẮT', s: 6 }], [], ['Tổng số dự án trong danh mục trên web', ds.length], ['Loại bỏ: không có ở cả B501 và TT85', loai.khong], ['Loại bỏ: B501 = 0 và TT85 không có số liệu (kể cả dư tạm ứng)', loai.bKhong], ['Số dự án giữ lại trong file này', stt], ['  Có ở cả B501 và TT85 (gồm các dự án B501 = 0 nhưng có ở TT85)', cnt.BT], ['  Chỉ có ở B501 (không có ở TT85)', cnt.B], ['  Chỉ có ở TT85 (không có ở B501)', cnt.T], ['Tên trên web khớp B501', cnt.khop], ['Tên trên web khác B501 (sheet "Ten khac B501")', cnt.khac], ['Dự án có số liệu trong B501 nhưng chưa có trên web (sheet "B501 co - web khong")', soB], ['Dự án thiếu phòng GD được đề xuất theo mã kho bạc B501', dem2.pgd], ['Dự án thiếu chủ đầu tư được đề xuất (độ tin cậy cao)', dem2.cdtCao], ['Dự án thiếu chủ đầu tư có gợi ý nhưng cần kiểm tra', dem2.cdtThap], ['Dự án nghi sai tên (giữ nguyên)', dem2.giu], ['Dự án có KBNN trên web lệch với TT85', dem2.lech], ['Dự án có ít nhất một mục cần rà soát', dem2.rs]].map((r, i) => (i < 2 ? r : [{ v: r[0], s: 3 }, { v: r[1], s: 4 }]));
  const nC = hdC.length, col = (n) => String.fromCharCode(64 + n);
  const buf = XL.writeMulti([
    { name: 'Danh muc tong the', cols: [6, 12, 60, 36, 36, 22, 16, 18, 22, 34, 60, 50, 60, 10, 10, 26, 50, 26, 34], rows, merges: ['A1:S1', 'A2:S2'], landscape: true },
    { name: 'Theo chu dau tu', cols: [6, 16, 40, 38, 10].concat(PG.map(() => 11), [12, 11, 12, 11]), rows: rC, merges: ['A1:' + col(nC) + '1'], landscape: true },
    { name: 'Theo phong GD', cols: [24, 12, 12, 14, 12, 12, 12, 12, 12, 14], rows: rP, merges: ['A1:J1'], landscape: true },
    { name: 'Ten khac B501', cols: [6, 12, 60, 60, 50, 10, 30, 36, 22], rows: rK, merges: ['A1:I1'], landscape: true },
    { name: 'B501 co - web khong', cols: [6, 12, 70, 16, 10, 16, 50], rows: rB, merges: ['A1:G1'], landscape: true },
    { name: 'Web co - B501 khong', cols: [6, 12, 60, 36, 36, 22, 50], rows: rW, merges: ['A1:G1'], landscape: true },
    { name: 'Tom tat', cols: [72, 14], rows: tt, merges: ['A1:B1'], landscape: false }]);
  return { name: 'Danh_muc_du_an_tong_the.xlsx', b64: buf.toString('base64'), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
}

/* ---------- Tài khoản quản trị (vt 'AD'): không xem/sửa số liệu, chỉ quản trị hệ thống ---------- */
async function adQ(token) { const q = await L.quyen(token, null, true); if (!q.ad) throw E('Chỉ tài khoản quản trị mới dùng được chức năng này.');
  if (String(q.tk.ma).toLowerCase() === 'bc1953') throw E('Hãy đổi mật khẩu mặc định của tài khoản quản trị trước (nút "Đổi mật khẩu" ở góc trên).'); return q; }
const MA_MD = ['123456', 'bc1953'];   // mật khẩu mặc định: người dùng đổi rồi thì không còn nằm trong danh sách này, và màn hình quản trị không hiện mật khẩu riêng của họ
async function adDs(token) {
  await adQ(token);
  const uu = { TH: 0, NV2: 1, PGD: 2 }, ds = require('./common').DS_PGD;
  return (await L._.db().q('SELECT ten,vt,donvi,cv,hoten,ma FROM accounts')).filter((a) => a.vt !== 'AD' && a.ten !== require('./common').TK_NV2_LD)
    .map((a) => ({ ten: a.ten, vt: a.vt, donvi: a.donvi || (a.vt === 'PGD' ? a.ten : ''), cv: a.cv || '', hoten: a.hoten || '', ma: MA_MD.includes(String(a.ma).toLowerCase()) ? a.ma : '', macdinh: MA_MD.includes(String(a.ma).toLowerCase()) }))
    .sort((a, b) => (uu[a.vt] ?? 9) - (uu[b.vt] ?? 9) || ds.indexOf(a.donvi) - ds.indexOf(b.donvi) || (a.ten < b.ten ? -1 : 1));
}
async function adDatMa(token, ten, ma) {
  const q = await adQ(token); ten = s(ten); ma = s(ma);
  if (!/^[A-Za-z0-9]{6,12}$/.test(ma)) throw E('Mật khẩu gồm 6 đến 12 ký tự chữ hoặc số, không dấu, không khoảng trắng.');
  const r = await L._.db().q('SELECT vt FROM accounts WHERE ten=$1', [ten]);
  if (!r.length || r[0].vt === 'AD') throw E('Không tìm thấy tài khoản.');
  await L._.db().q('UPDATE accounts SET ma=$1 WHERE ten=$2', [ma, ten]);
  if (ten === require('./common').TK_TH_TP) { await L._.db().q('UPDATE accounts SET ma=$1 WHERE ten=$2', [ma, require('./common').TK_NV2_LD]); await L._.db().q('DELETE FROM sessions WHERE ten=$1', [require('./common').TK_NV2_LD]); }
  await L._.db().q('DELETE FROM sessions WHERE ten=$1', [ten]);   // buộc đăng nhập lại bằng mật khẩu mới
  await L._.db().q('DELETE FROM fails WHERE ten=$1', [ten]);
  await L._.nk(q.ten, 'Quản trị đặt lại mật khẩu', ten, '', ''); return { ok: 1 };
}
async function adNoiDung(token) {
  await adQ(token); const a = await kvDoc('tb:chung'), b = await kvDoc('tb:lienhe');
  return { tb: s(a.text), lh: s(b.text) || LIEN_HE_MAC_DINH };
}
async function adTbGhi(token, text) {
  const q = await adQ(token); text = s(text); if (text.length > 600) throw E('Thông báo tối đa 600 ký tự.');
  await kvGhi('tb:chung', { text, luc: Date.now(), nguoi: 'Quản trị hệ thống' }); return { ok: 1 };
}
async function adLhGhi(token, text) {
  await adQ(token); text = s(text); if (text.length > 500) throw E('Thông tin liên hệ tối đa 500 ký tự.');
  await kvGhi('tb:lienhe', { text }); return { ok: 1 };
}

// Trưởng phòng Tổng hợp chỉ xem Danh mục dự án: mọi thao tác ghi bị chặn ở máy chủ
const GHI = ['pgdThieuGan', 'dmHtLuu', 'dmHtXacNhan', 'cbqLuu', 'cbqXoa', 'dmTtBoQua', 'dmCbcqLuu', 'dmCtmtDongBo', 'cdtDeXuat', 'cdtDxSua', 'cdtDxXoa', 'cdtDxAn', 'cdtDxDuyet', 'dmTenDeXuat', 'dmTenDxDuyet', 'dmCtmtLuu', 'dmDongBo', 'dmSua', 'dmThem', 'dmHangLoat', 'dmDeXuat', 'dmDxDuyet', 'cdtLuu', 'cdtXoa'];
const chanGhi = (fn) => async function (token, ...a) {
  const q = await L.quyen(token);
  if (q.ten === require('./common').TK_TH_TP) throw E('Tài khoản Lãnh đạo phòng Tổng hợp chỉ được xem Danh mục dự án, không sửa.');
  return fn.call(this, token, ...a);
};
module.exports = { gyGui, gyDs, gyTraLoi, pgdThieuDs, pgdThieuGan, adDs, adDatMa, adNoiDung, adTbGhi, adLhGhi, lhLay, lhGhi, dmTienDo, tbLay, tbGhi, dmHtLuu, dmHtDs, dmHtXacNhan, cbqDs, cbqLuu, cbqXoa, dmTtBoQua, dmHtXuat, dmCbcqLuu, dmCtmtDongBo, _cbReset: () => { _cbM.v = null; _ctmtC = null; }, cdtDeXuat, cdtDxSua, cdtDxXoa, cdtDxAn, cdtDxDs, cdtDxDuyet, dmTenDeXuat, dmTenDxDs, dmTenDxDuyet, ctmtGop, ctmtTra, dmCtmtTra, dmCtmtLuu, _pv: pv, _rpc: rpc, _MA_PGD: MA_PGD, dmDongBo, dmXuatDeXuat, dmTenCoSan, dmTenFile, dmTuyChon, dmDs, dmSua, dmThem, dmHangLoat, dmCanHT, dmCanhBao, dmDeXuat, dmDxDs, dmDxDuyet, cdtDs, cdtLuu, cdtXoa, cdtXuat, dmXuat, _banDo: banDo, _ctInfo: ctInfo, _reset: () => { _ct = null; }, api };
GHI.forEach((k) => { if (typeof module.exports[k] === 'function') module.exports[k] = chanGhi(module.exports[k]); });
