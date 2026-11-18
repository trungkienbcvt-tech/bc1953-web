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
  if (!o.cdt || !o.cdt2) throw E('Phải chọn chủ đầu tư lớn.');
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
// Cập nhật tên dự án theo file "So sánh tên DA B501 – TT85": chỉ đổi tên khi độ giống >= 60% (cột "Xử lý tên" = "Đã thay…"),
// thêm dự án chưa có trong danh mục (chưa có chủ đầu tư). Các dự án độ giống thấp được giữ nguyên để rà soát.
async function dmTenFile(token, tenFile, b64, ghi) {
  const p = await pv(token); if (p.kbnn) throw E('Chỉ Chuyên viên THBC được cập nhật tên dự án hàng loạt.');
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
  const p = await pv(token); if (p.kbnn) throw E('Chỉ Chuyên viên THBC được cập nhật tên dự án hàng loạt.');
  const d = require('./b501_ten.json'), kq = { soDoiTen: d.ren.length, soThem: d.add.length, soGiu: d.giu, soKhop: d.khop };
  if (!ghi) return kq;
  const r = await rpc('cv_dm_cap_nhat_ten', { p_ren: d.ren, p_add: d.add, p_who: p.ten + ' (cập nhật tên theo B501)' });
  return Object.assign(kq, { daDoi: r.doi, daThem: r.them });
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
  const hd = ['STT', 'Mã dự án', 'Tên dự án', 'Chủ đầu tư lớn', 'Chủ đầu tư trực thuộc', 'KBNN giao dịch', 'Tính chất dự án', 'Chương trình mục tiêu', 'Cập nhật trên web'];
  const rows = [[{ v: 'DANH MỤC DỰ ÁN' + (kbnn ? ' – ' + kbnn.toUpperCase() : ''), s: 6 }], [], hd.map((v) => ({ v, s: 2 }))];
  ds.forEach((x, i) => rows.push([i + 1, x.ma_da, x.ten_da, x.cdt2 || x.cdt, (x.cdt2 && x.cdt !== x.cdt2) ? x.cdt : '', x.kbnn, x.dac_thu, x.ctmt, x.sua_tay ? (x.boi || 'đã sửa') : ''].map((v, j) => ({ v, s: j === 0 ? 4 : 3 }))));
  const buf = XL.write({ name: 'Danh muc du an', cols: [6, 12, 60, 38, 38, 22, 18, 22, 22], rows, merges: ['A1:I1'], landscape: true });
  return { name: 'Danh_muc_du_an.xlsx', b64: buf.toString('base64'), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
}
// Xuất danh mục dự án kèm cột đề xuất hoàn thiện (chỉ để xem trước, KHÔNG ghi gì vào hệ thống).
// Đề xuất phòng GD: theo mã kho bạc ở file B501 (lib/de_xuat.json). Đề xuất chủ đầu tư: chỉ khi tên dự án có tên xã/phường duy nhất và xã đó vẫn giao dịch ở đúng phòng suy ra từ B501.
const MA_PGD = { 2461: 'Phòng Nghiệp vụ 2', 2465: 'Phòng giao dịch số 17', 2466: 'Phòng giao dịch số 18', 2462: 'Phòng giao dịch số 19', 2470: 'Phòng giao dịch số 20', 2471: 'Phòng giao dịch số 21', 2472: 'Phòng giao dịch số 22', 2473: 'Phòng giao dịch số 23', 2474: 'Phòng giao dịch số 24', 2475: 'Phòng giao dịch số 25', 2476: 'Phòng giao dịch số 26', 2477: 'Phòng giao dịch số 27' };
async function dmXuatDeXuat(token) {
  const p = await pv(token); if (p.kbnn) throw E('Chỉ Chuyên viên THBC được xuất danh mục đề xuất.');
  const dx = require('./de_xuat.json'), ci = await ctInfo();
  const r = await goiDs(null, locChuan({}, p).o, 0, 20000), ds = (r.rows || []).map(HANG);
  // phòng giao dịch chính của từng xã/phường (theo các dự án đã có)
  const dem = {}; ds.forEach((x) => { const c = x.cdt2 || x.cdt; if (x.kbnn && /^(Xã|Phường) /.test(c)) { (dem[c] = dem[c] || {})[x.kbnn] = ((dem[c] || {})[x.kbnn] || 0) + 1; } });
  const chinh = {}; Object.keys(dem).forEach((c) => { chinh[c] = Object.keys(dem[c]).sort((a, b) => dem[c][b] - dem[c][a])[0]; });
  const xa = Object.keys(chinh).map((c) => ({ c, re: new RegExp('(?:^|[^\\p{L}])(?:xã|phường|thị trấn|tt\\.?)\\s+' + c.replace(/^(Xã|Phường) /, '').toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}\\d])', 'iu') }));
  const hd = ['STT', 'Mã dự án', 'Tên dự án', 'Chủ đầu tư lớn', 'Chủ đầu tư trực thuộc', 'KBNN giao dịch', 'Tính chất dự án', 'Chương trình mục tiêu', 'ĐỀ XUẤT: KBNN giao dịch', 'ĐỀ XUẤT: Chủ đầu tư lớn', 'Căn cứ đề xuất', 'Cần rà soát', 'Tên theo B501 (để đối chiếu)'];
  const rows = [[{ v: 'DANH MỤC DỰ ÁN – BẢN ĐỀ XUẤT HOÀN THIỆN (xem trước, chưa sửa trên web)', s: 6 }], [{ v: 'Các cột "ĐỀ XUẤT" chỉ điền cho dự án thiếu phòng giao dịch / chủ đầu tư. Dự án nghi sai tên, thiếu thông tin được GIỮ NGUYÊN và ghi ở cột "Cần rà soát".', s: 7 }], [], hd.map((v) => ({ v, s: 2 }))];
  const dem2 = { pgd: 0, pgdCao: 0, cdtCao: 0, cdtThap: 0, giu: 0, rs: 0 };
  ds.forEach((x, i) => {
    const nhan = [], cc = [], d1 = dx.pgd[x.ma_da]; let dPgd = '', dCdt = '', b501 = '';
    const cdtL = x.cdt2 || x.cdt;
    if (!x.kbnn) {
      if (d1 && d1.ma && d1.ma.length === 1 && MA_PGD[d1.ma[0]]) { dPgd = MA_PGD[d1.ma[0]]; cc.push('Phòng GD: B501 ' + d1.src + ', mã kho bạc ' + d1.ma[0]); dem2.pgd++; }
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
    if (nhan.length) dem2.rs++;
    const nb = (v, j) => ({ v, s: j === 0 ? 4 : ((j === 8 || j === 9) && v ? 8 : 3) });
    rows.push([i + 1, x.ma_da, x.ten_da, x.cdt2 || x.cdt, (x.cdt2 && x.cdt !== x.cdt2) ? x.cdt : '', x.kbnn, x.dac_thu, x.ctmt, dPgd, dCdt, cc.join('; '), nhan.join('; '), b501].map(nb));
  });
  const tt = [[{ v: 'TÓM TẮT', s: 6 }], [], ['Tổng số dự án trong danh mục', ds.length], ['Dự án thiếu phòng GD được đề xuất theo mã kho bạc B501', dem2.pgd], ['Dự án thiếu chủ đầu tư được đề xuất (độ tin cậy cao)', dem2.cdtCao], ['Dự án thiếu chủ đầu tư có gợi ý nhưng cần kiểm tra', dem2.cdtThap], ['Dự án nghi sai tên (giữ nguyên)', dem2.giu], ['Dự án có ít nhất một mục cần rà soát', dem2.rs]].map((r, i) => (i < 2 ? r : [{ v: r[0], s: 3 }, { v: r[1], s: 4 }]));
  const buf = XL.writeMulti([{ name: 'Danh muc de xuat', cols: [6, 12, 60, 36, 36, 22, 16, 18, 22, 34, 60, 50, 60], rows, merges: ['A1:M1', 'A2:M2'], landscape: true }, { name: 'Tom tat', cols: [62, 14], rows: tt, merges: ['A1:B1'], landscape: false }]);
  return { name: 'Danh_muc_du_an_de_xuat_hoan_thien.xlsx', b64: buf.toString('base64'), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
}
module.exports = { dmXuatDeXuat, dmTenCoSan, dmTenFile, dmTuyChon, dmDs, dmSua, dmThem, dmHangLoat, dmCanHT, dmCanhBao, dmDeXuat, dmDxDs, dmDxDuyet, cdtDs, cdtLuu, cdtXoa, cdtXuat, dmXuat, _banDo: banDo, _ctInfo: ctInfo, _reset: () => { _ct = null; }, api };
