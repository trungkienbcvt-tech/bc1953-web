'use strict';
// Kế hoạch vốn (QĐ 2623): nạp từ Google Sheet "von-dtc-google" (seed/vdtc.json) và tra cứu theo chủ đầu tư / nguồn vốn / mục.
// Đơn vị tiền: triệu đồng. Tài khoản PGD chỉ thấy chủ đầu tư thuộc phòng mình; TH và NV2 thấy toàn bộ.
const L = require('./logic');
const SCHEMA = require('./schema');
const bulk = require('./bulk');
const { E, db } = L._;
let KH = null;
const bo = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
const LM = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12, XIII: 13, XIV: 14, XV: 15 };
const thuTu = (m) => { const k = /^([IVX]+)\./.exec(m); return k && LM[k[1]] ? LM[k[1]] : 99; };
const so = (x) => Math.round((Number(x) || 0) * 1000) / 1000;

async function nap(d, data, opt) {
  opt = opt || {};
  await d.exec(SCHEMA);
  const co = await d.q('SELECT COUNT(*) AS n FROM kh_von');
  if (Number(co[0].n) > 0 && !opt.force) return { boQua: true, von: Number(co[0].n) };
  await d.tx(async (t) => {
    for (const b of ['kh_von', 'kh_da', 'kh_qd', 'kh_nguon', 'kh_cdt']) await t.q('DELETE FROM ' + b);
    await bulk(t, 'kh_cdt', ['id', 'khoi', 'name', 'ord', 'pgd'], data.cdt.map((c) => [c[0], c[1], c[2], c[3], (c[4] || []).join(';')]));
    await bulk(t, 'kh_nguon', ['id', 'code', 'grp', 'name', 'ord'], data.nguon.map((n, i) => [n[0], n[1], n[2], n[3], i]));
    await bulk(t, 'kh_qd', ['id', 'action', 'ngay', 'file_name', 'issuer', 'kind', 'lv', 'note', 'so', 'giai_doan', 'summary', 'nam'],
      data.qd.map((q) => [q.id, q.action, q.date, q.fileName, q.issuer, q.kind, q.level, q.note, q.number, q.period, q.summary, q.year]));
    await bulk(t, 'kh_da', ['id', 'ord', 'cdt_id', 'ma', 'tao_tu', 'nhom', 'name', 'pgd', 'cdt_hint', 'task'], data.da.map((x, i) => [x[0], i, x[1], x[2], x[3], x[4], x[5], x[6], x[7], x[8]]));
    await bulk(t, 'kh_von', ['id', 'ord', 'amount', 'qd_id', 'kind', 'muc', 'note', 'da_id', 'nguon_id'], data.von.map((v, i) => [v[0], i, v[1], v[2], v[3], v[4], v[5], v[6], v[7]]));
  });
  KH = null;
  return { cdt: data.cdt.length, da: data.da.length, von: data.von.length, tong: so(data.von.reduce((s, v) => s + v[1], 0)) };
}

async function tai() {
  if (KH) return KH;
  const [cdt, nguon, qd, da, von] = await Promise.all([
    db().q('SELECT id,khoi,name,ord,pgd FROM kh_cdt ORDER BY ord'), db().q('SELECT id,code,grp,name FROM kh_nguon ORDER BY ord'),
    db().q('SELECT * FROM kh_qd ORDER BY id'), db().q('SELECT * FROM kh_da ORDER BY ord'), db().q('SELECT * FROM kh_von ORDER BY ord')]);
  if (!von.length) throw E('Chưa nạp dữ liệu kế hoạch vốn. Mở lại địa chỉ /api/setup?key=… (xem hướng dẫn) để nạp.');
  const cm = {}; cdt.forEach((c) => { c.ds = c.pgd ? c.pgd.split(';') : []; cm[c.id] = c; });
  const dm = {}; da.forEach((x) => { x.von = []; x.tong = 0; x.muc = []; x.theo = {}; x.bo = bo(x.name + ' ' + x.ma + ' ' + (cm[x.cdt_id] ? cm[x.cdt_id].name : x.cdt_hint)); dm[x.id] = x; });
  const mucTT = []; const thay = {};
  von.forEach((v) => {
    const x = dm[v.da_id]; if (!x) return;
    x.von.push(v); x.tong += v.amount; x.theo[v.nguon_id] = (x.theo[v.nguon_id] || 0) + v.amount; if (v.muc && x.muc.indexOf(v.muc) < 0) x.muc.push(v.muc);
    if (v.muc && !thay[v.muc]) { thay[v.muc] = 1; mucTT.push(v.muc); }
  });
  const mucDS = mucTT.map((m, i) => ({ m, i })).sort((a, b) => thuTu(a.m) - thuTu(b.m) || a.i - b.i).map((x) => x.m);
  return (KH = { cdt, cm, nguon, qd, da, dm, mucTT: mucDS });
}
const thayDuoc = (q, K) => (x) => q.vt !== 'PGD' || (x.cdt_id && K.cm[x.cdt_id] && K.cm[x.cdt_id].ds.indexOf(q.ten) >= 0);

async function khTongQuan(token) {
  const q = await L.quyen(token), K = await tai(), ok = thayDuoc(q, K), ds = K.da.filter(ok);
  const cong = (o, k, n) => { o[k] = (o[k] || 0) + n; };
  const nguon = {}, muc = {}, cdt = {}; let tong = 0;
  ds.forEach((x) => {
    tong += x.tong;
    x.von.forEach((v) => { cong(nguon, v.nguon_id, v.amount); const m = (muc[v.muc] = muc[v.muc] || { ten: v.muc, da: {}, tong: 0, theo: {} }); m.da[x.id] = 1; m.tong += v.amount; cong(m.theo, v.nguon_id, v.amount); });
    const k = x.cdt_id || '_none', c = (cdt[k] = cdt[k] || { id: k, soDA: 0, tong: 0, theo: {} });
    c.soDA++; c.tong += x.tong; x.von.forEach((v) => cong(c.theo, v.nguon_id, v.amount));
  });
  const lam = (o) => { Object.keys(o).forEach((k) => { o[k] = so(o[k]); }); return o; };
  const dsCdt = K.cdt.filter((c) => cdt[c.id]).map((c) => ({ id: c.id, khoi: c.khoi, name: c.name, soDA: cdt[c.id].soDA, tong: so(cdt[c.id].tong), theo: lam(cdt[c.id].theo), pgd: c.ds }));
  const chuaGan = cdt._none ? { soDA: cdt._none.soDA, tong: so(cdt._none.tong), theo: lam(cdt._none.theo) } : null;
  return {
    vt: q.vt, tatCa: q.vt !== 'PGD', soDA: ds.length, tong: so(tong), qd: K.qd.map((x) => ({ id: x.id, so: x.so, ngay: x.ngay, coQuan: x.issuer, giaiDoan: x.giai_doan, tomTat: x.summary, ghiChu: x.note })),
    nguon: K.nguon.map((n) => ({ id: n.id, code: n.code, name: n.name, tong: so(nguon[n.id]) })),
    muc: K.mucTT.filter((m) => muc[m]).map((m) => ({ ten: m, soDA: Object.keys(muc[m].da).length, tong: so(muc[m].tong), theo: lam(muc[m].theo) })),
    cdt: dsCdt, chuaGan,
  };
}

function loc(q, K, opt) {
  opt = opt || {}; const ok = thayDuoc(q, K), t = bo(opt.q).trim().split(/\s+/).filter(Boolean);
  const cd = String(opt.cdt || ''), mu = String(opt.muc || ''), ng = String(opt.nguon || '');
  if (q.vt === 'PGD' && cd === '_none') return [];
  return K.da.filter((x) => ok(x) && (!cd || (cd === '_none' ? !x.cdt_id : x.cdt_id === cd)) && (!mu || x.muc.indexOf(mu) >= 0) && (!ng || x.theo[ng] !== undefined) && t.every((w) => x.bo.indexOf(w) >= 0));
}
const dong = (K, x) => ({ id: x.id, ma: x.ma, ten: x.name, cdtId: x.cdt_id, cdt: x.cdt_id && K.cm[x.cdt_id] ? K.cm[x.cdt_id].name : (x.cdt_hint ? x.cdt_hint + ' (gợi ý, chưa gán chủ đầu tư)' : 'Khoản chung (chưa phân bổ cho chủ đầu tư)'), nhom: x.nhom, muc: x.muc.join('; '), von: Object.keys(x.theo).reduce((o, k) => { o[k] = so(x.theo[k]); return o; }, {}), tong: so(x.tong) });
const CO = 50;
async function khDuAn(token, opt) {
  const q = await L.quyen(token), K = await tai(), ds = loc(q, K, opt);
  const sT = {}; let tong = 0; ds.forEach((x) => { tong += x.tong; Object.keys(x.theo).forEach((k) => { sT[k] = (sT[k] || 0) + x.theo[k]; }); });
  Object.keys(sT).forEach((k) => { sT[k] = so(sT[k]); });
  const st = Math.max(1, Math.ceil(ds.length / CO)), tr = Math.min(Math.max(parseInt(opt && opt.trang, 10) || 1, 1), st);
  return { dem: ds.length, tong: so(tong), theoNguon: sT, trang: tr, soTrang: st, co: CO, rows: ds.slice((tr - 1) * CO, tr * CO).map((x) => dong(K, x)) };
}
async function khTatCa(token, opt) { const q = await L.quyen(token), K = await tai(); return { K, nguon: K.nguon, rows: loc(q, K, opt).map((x) => dong(K, x)) }; }
module.exports = { nap, khTongQuan, khDuAn, khTatCa, _: { reset: () => { KH = null; } } };
