'use strict';
// Công văn gửi Sở Tài chính kèm báo cáo CV 1953 (phần Tổng hợp toàn tỉnh): soạn sẵn theo mẫu công văn tháng trước, số liệu tình hình gửi báo cáo lấy tự động.
const L = require('./logic'), C = require('./common');
const E = (m) => { const e = new Error(m); e.user = true; return e; };
const db = () => L._.db();
const pad = (n) => (n < 10 ? '0' + n : String(n));
const cuoiThang = (ky) => { const y = Number(ky.substring(0, 4)), m = Number(ky.substring(5, 7)); return pad(new Date(y, m, 0).getDate()) + '/' + pad(m) + '/' + y; };
const CAN_CU = `Thực hiện Thông báo số 47/TB-UBND ngày 24/3/2026 của UBND tỉnh Tuyên Quang về Kết luận của đồng chí Phan Huy Ngọc, Chủ tịch Ủy ban nhân dân (UBND) tỉnh tại Hội nghị thúc đẩy giải ngân vốn đầu tư công năm 2026 (Sáng ngày 24/3/2026); Văn bản số 3942/UBND-KTTH ngày 29/5/2026 của UBND tỉnh về việc báo cáo kết quả thực hiện và giải ngân vốn đầu tư công năm 2026.
Căn cứ Công văn số 1953/STC-NS ngày 26/3/2026 của Sở Tài chính tỉnh Tuyên Quang về việc thống nhất số liệu và mẫu báo cáo kết quả vốn đầu tư công năm 2026; Công văn số 4135/STC-ĐTC ngày 31/5/2026 của Sở Tài chính tỉnh Tuyên Quang về việc báo cáo kết quả thực hiện và giải ngân vốn đầu tư công năm 2026; Công văn số 6384/STC-TH ngày 31/07/2026 của Sở Tài chính tỉnh Tuyên Quang về việc phối hợp thực hiện chế độ báo cáo tình hình thực hiện và tiến độ giải ngân các chương trình MTQG.
Kho bạc Nhà nước (KBNN) khu vực VIII địa bàn Tuyên Quang tổng hợp kết quả giải ngân dựa trên cơ sở số liệu đã được đối chiếu thống nhất giữa đơn vị được giao kế hoạch vốn cấp tỉnh (Chủ đầu tư), UBND cấp xã/phường với KBNN nơi giao dịch; đối với các Chủ đầu tư, UBND cấp xã/phường không gửi báo cáo kết quả giải ngân, KBNN khu vực VIII tổng hợp theo số liệu theo dõi tại KBNN.`;
const MAC_DINH = (ky) => ({
  diaDanh: 'Phú Thọ', so: '', ngay: '', denNgay: cuoiThang(ky),
  trichYeu: 'báo cáo số liệu giải ngân vốn đầu tư công đến ngày {denNgay}',
  kinhGui: 'Sở Tài chính tỉnh Tuyên Quang', canCu: CAN_CU,
  kt: 'KT. GIÁM ĐỐC', chucVu: 'PHÓ GIÁM ĐỐC', nguoiKy: 'Đặng Kim Liên',
  noiNhan: 'Như trên;\nGiám đốc KBVIII (báo cáo);\nLãnh đạo KBVIII địa bàn TQ;\nPhòng giao dịch KBVIII từ số 17 đến số 27;\nLưu: VT, NV2, tronglx (2b).',
});
async function doc(ky) {
  const r = await db().q('SELECT v FROM kv WHERE k=$1', ['cv1953:' + ky]); let cu = {}; try { cu = r.length ? JSON.parse(r[0].v) : {}; } catch (e) { cu = {}; }
  return Object.assign(MAC_DINH(ky), cu);
}
async function quyenTh(token) { const q = await L.quyen(token); if (q.vt !== 'TH') throw E('Chỉ cán bộ tổng hợp mới lập công văn.'); return q; }
async function kyChon(kyIn) { return (await L._.chonKy(kyIn)); }
// số liệu tình hình gửi báo cáo của các chủ đầu tư, UBND xã/phường (theo đơn vị báo cáo)
async function soLieu(token, ky) {
  const r = await require('./tinhtrang').tinh(token, ky, '*'), kh = r.rows.filter((x) => x.k === 'khoi' && x.u), I = (kh[0] || {}).u || {}, II = (kh[1] || {}).u || {}, t = r.tk;
  const g = (u, k) => Number(u[k]) || 0;
  return { n: t.n, daGui: t.n - t.chua, dayDu: t.dung + t.cham, dayDuTinh: g(I, 'dung') + g(I, 'cham'), dayDuXa: g(II, 'dung') + g(II, 'cham'), chuaDayDu: t.du, chuaDuTinh: g(I, 'du'), chuaDuXa: g(II, 'du'), chuaGui: t.chua };
}
async function cvLay(token, kyIn) {
  await quyenTh(token); const c = await kyChon(kyIn);
  return { ky: c.ky, nhan: c.nhan, vb: await doc(c.ky), so: await soLieu(token, c.ky) };
}
async function cvLuu(token, kyIn, o) {
  const q = await quyenTh(token), c = await kyChon(kyIn), mac = MAC_DINH(c.ky), v = {}, cat = (x, n) => String(x == null ? '' : x).replace(/\r/g, '').substring(0, n);
  Object.keys(mac).forEach((k) => { v[k] = o && o[k] !== undefined ? cat(o[k], k === 'canCu' ? 4000 : (k === 'noiNhan' ? 1500 : 300)).trim() : mac[k]; });
  if (v.ngay && !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v.ngay)) throw E('Ngày văn bản nhập dạng 03/11/2026.');
  if (v.denNgay && !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v.denNgay)) throw E('Số liệu đến ngày nhập dạng 31/10/2026.');
  await db().q('INSERT INTO kv (k,v) VALUES ($1,$2) ON CONFLICT (k) DO UPDATE SET v=excluded.v', ['cv1953:' + c.ky, JSON.stringify(v)]);
  await L._.nk(q.ten, 'Lưu thông tin công văn BC 1953', c.ky, v.so, ''); return cvLay(token, kyIn);
}
async function cvXuat(token, kyIn) {
  const D = require('./docx'), d = await cvLay(token, kyIn), vb = d.vb, so = d.so, nam = d.ky.substring(0, 4), R = D.run, P = D.para, C0 = { jc: 'center' };
  const den = vb.denNgay || cuoiThang(d.ky), ty = String(vb.trichYeu || '').split('{denNgay}').join(den);
  const dm = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(vb.ngay || ''), ngay = dm ? { d: pad(+dm[1]), m: pad(+dm[2]), y: dm[3] } : null;
  const [trai, phai] = D.dauVanBan({ so: vb.so, trichYeu: ty, diaNgay: (vb.diaDanh || 'Phú Thọ') + ', ngày ' + (ngay ? ngay.d : '......') + ' tháng ' + (ngay ? ngay.m : '......') + ' năm ' + (ngay ? ngay.y : nam) });
  const B = (t, o) => P(R(t, o), Object.assign({ first: 720, before: 60, ln: 312 }, o && o.p));
  const BI = (a, b) => P(R(a, {}) + R(b, { i: 1 }), { first: 720, before: 60, ln: 312 });
  const bi = (x) => (x < 10 ? '0' + x : String(x));
  const chua = (a, b) => { const p = []; if (a) p.push(bi(a) + ' đơn vị khối tỉnh'); if (b) p.push(bi(b) + ' đơn vị xã/phường'); return p.length ? 'gồm ' + p.join(' và ') : '0 đơn vị'; };
  const nd = [
    P(R('Kính gửi:  ', {}) + R(vb.kinhGui + '.', {}), { jc: 'center', before: 240, after: 80 }),
    ...String(vb.canCu || '').split(/\n+/).filter(Boolean).map((t) => B(t)),
    B('KBNN khu vực VIII (địa bàn Tuyên Quang) tổng hợp số liệu giải ngân vốn đầu tư công đến hết ngày ' + den + ', cụ thể như sau:'),
    B('I. Kết quả giải ngân vốn đầu tư năm ' + nam + ' (đối với Chủ đầu tư, UBND cấp xã đã gửi báo cáo):', { b: 1 }),
    BI('1. Báo cáo tổng hợp kết quả giải ngân vốn đầu tư ngân sách địa phương theo chủ đầu tư năm ' + nam + ' ', '(chi tiết tại Biểu 01-KBNN đính kèm).'),
    BI('2. Báo cáo tổng hợp kết quả giải ngân vốn đầu tư ngân sách trung ương theo chủ đầu tư năm ' + nam + ' ', '(chi tiết tại Biểu 02-KBNN đính kèm).'),
    BI('3. Báo cáo giải ngân vốn đầu tư năm ' + nam + ' (Vốn chuyển nguồn) chương trình MTQG giai đoạn 2021-2025 ', '(chi tiết tại Biểu 03.KBNN.21-25(ĐT) đính kèm).'),
    BI('4. Báo cáo giải ngân vốn đầu tư năm ' + nam + ' chương trình MTQG giai đoạn 2026-2030 ', '(chi tiết tại Biểu 03.KBNN.26-30(ĐT) đính kèm).'),
    B('II. Tình hình thực hiện báo cáo của các Chủ đầu tư, UBND xã.', { b: 1 }),
    B('Tổng số chủ đầu tư và UBND xã/phường được giao kế hoạch vốn năm ' + nam + ' là ' + so.n + ' đơn vị, trong đó:'),
    B('- Đơn vị đã gửi báo cáo: ' + so.daGui + ' đơn vị, trong đó:'),
    B('+ Đơn vị đã gửi báo cáo đầy đủ: ' + so.dayDu + ' đơn vị, chia ra: ' + so.dayDuTinh + ' đơn vị khối tỉnh và ' + so.dayDuXa + ' xã/phường.', { p: { first: 1000 } }),
    B('+ Đơn vị báo cáo chưa đầy đủ: ' + chua(so.chuaDuTinh, so.chuaDuXa) + '.', { p: { first: 1000 } }),
    B('- Đơn vị chưa gửi báo cáo: ' + so.chuaGui + ' đơn vị.'),
    P(R('(chi tiết tại Phụ lục số 01 đính kèm)', { i: 1 }), { jc: 'center', before: 60 }),
    B('Kho bạc Nhà nước khu vực VIII trân trọng gửi ' + String(vb.kinhGui).replace(/\s*tỉnh Tuyên Quang\s*$/i, '') + ' tổng hợp số liệu báo cáo./.'),
  ].join('');
  const nn = [P(R('Nơi nhận:', { sz: 24, b: 1, i: 1 }), { jc: 'left', keep: 1 }), ...String(vb.noiNhan).split(/\n+/).filter(Boolean).map((t) => P(R('- ' + t.replace(/^-\s*/, ''), { sz: 22 }), { jc: 'left' }))].join('');
  const ky = [P(R(vb.kt, { b: 1 }), C0), P(R(vb.chucVu, { b: 1 }), C0), P('', { before: 1100 }), P(R(vb.nguoiKy, { b: 1 }), C0)].join('');
  const xml = D.bang([4500, 4855], [trai, phai]) + nd + P('', { before: 360 }) + D.bang([4300, 5055], [nn, ky]);
  return { name: 'Cong_van_BC_CV1953_' + d.ky + '.docx', b64: D.ghi(xml).toString('base64'), mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
}
module.exports = { cvLay, cvLuu, cvXuat, doc };
