'use strict';
// Biểu tổng theo danh mục chủ đầu tư (ngoài yêu cầu BC 1953): lũy kế / trong tháng = tổng 4 biểu con,
// xếp theo danh mục lib/dmcdt.json để đối chiếu với file THBC. Khóa ghép: tên chủ đầu tư (đã chuẩn hóa) + PGD giao dịch.
const C = require('./common');
const L = require('./logic');
const DM = require('./dmcdt.json');
const RG = require('./rutgon');
const { CFG, TONG_COL } = C;
const E = (m) => { const e = new Error(m); e.user = true; return e; };

const chuan = (s) => String(s || '').normalize('NFC').toLowerCase().replace(/\([^)]*\)/g, ' ')
  .replace(/oà/g, 'òa').replace(/oá/g, 'óa').replace(/oả/g, 'ỏa').replace(/uỳ/g, 'ùy').replace(/uỷ/g, 'ủy').replace(/&/g, 'và').replace(/\bban chỉ huy\b/g, 'bộ chỉ huy')
  .replace(/\s+tỉnh tuyên quang\b/g, '').replace(/\s+tuyên quang\b/g, '').replace(/\s+tỉnh\b/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();


async function tinh(token, kyIn, xem) {
  await require('./dmdyn').nap();   // khung dòng tự thêm chủ đầu tư / phòng giao dịch phát sinh
  const q = await L.quyen(token);
  const scA = L._.phamVi(q, xem), sc = new Set(scA), full = scA.length >= C.DS_PGD.length;   // PGD / NV2 hẹp: chỉ thấy phần của mình, không thấy số THBC gốc
  const c = await L._.chonKy(kyIn), all = await L._.nap(c), val = {}, ten = {};
  CFG.forEach((b) => all[b.id].forEach((z) => {
    if (!sc.has(z.d.pgd)) return;
    const k = chuan(z.d.b) + '|' + z.d.pgd, e = val[k] = val[k] || { lk: 0, th: 0 }; ten[k] = ten[k] || z.d.b;
    e.lk += Number(z.o[TONG_COL[b.id][0]]) || 0; e.th += Number(z.o[TONG_COL[b.id][1]]) || 0;
  }));
  const tb = {}, coTb = (await L._.db().q('SELECT khoa,ten,lk,th FROM thbc_cdt WHERE ky=$1', [c.ky])); const coTen = {}; coTb.forEach((x) => { coTen[x.khoa] = x.ten; tb[x.khoa] = { lk: Number(x.lk) || 0, th: Number(x.th) || 0 }; });
  const byRow = {}; DM.forEach((o) => { byRow[o.row] = o; });
  const dung = new Set(), memo = {};
  const sum = (o) => {
    if (memo[o.row]) return memo[o.row];
    let r;
    if (o.kids) { r = { lk: 0, th: 0 }; o.kids.forEach((k) => { const s = sum(byRow[k]); r.lk += s.lk; r.th += s.th; }); }
    else if (!sc.has(o.c)) r = { lk: 0, th: 0, n: 0, tlk: 0, tth: 0 };
    else { const k = chuan(o.ten) + '|' + o.c; dung.add(k); r = Object.assign({ n: 1 }, val[k] || { lk: 0, th: 0 }); r.tlk = (tb[k] || {}).lk || 0; r.tth = (tb[k] || {}).th || 0; }
    if (o.kids) { r.n = 0; r.tlk = 0; r.tth = 0; o.kids.forEach((k) => { const s = memo[k]; r.n += s.n; r.tlk += s.tlk; r.tth += s.tth; }); }
    return memo[o.row] = r;
  };
  const sub = new Set(); DM.forEach((o) => (o.kids || []).forEach((k) => sub.add(k)));
  const lv = {}; const dq = (o, d) => { lv[o.row] = d; (o.kids || []).forEach((k) => dq(byRow[k], d + 1)); };
  dq(DM.find((o) => o.b === 'TỔNG CỘNG'), -1);
  let rows = DM.map((o) => {
    const s = o.b === 'TỔNG CỘNG' ? null : sum(o);
    return { ten: o.kids ? undefined : o.ten, a: o.a, b: o.b, c: o.c, lv: o.b === 'TỔNG CỘNG' ? 0 : lv[o.row], k: o.b === 'TỔNG CỘNG' ? 'tot' : (lv[o.row] === 0 && !/^\d/.test(o.a) ? 'khoi' : (o.kids ? 'nhom' : 'row')), lk: s && s.lk, th: s && s.th, n: s && s.n, tlk: s && s.tlk, tth: s && s.tth, tt: o.tt ? 1 : undefined };
  });
  // Khối xã, phường: đối chiếu theo chủ đầu tư lớn (nguyên tên xã/phường), không tách chủ đầu tư trực thuộc – gộp số của dòng trực thuộc vào dòng xã/phường
  for (let i = rows.length - 1; i >= 0; i--) {
    const x = rows[i]; if (!x.tt) continue;
    let j = i - 1; while (j >= 0 && rows[j].tt) j--;
    const cha = rows[j];
    if (cha && cha.k === 'row' && cha.a && cha.lv === x.lv && !cha.tt) ['lk', 'th', 'n', 'tlk'].forEach((f) => { cha[f] = (cha[f] || 0) + (x[f] || 0); });   // dòng xã là dòng lá: cộng dồn số của dòng trực thuộc
    rows.splice(i, 1);   // nếu dòng xã là nhóm thì tổng nhóm đã gồm số trực thuộc
  }
  // Dòng chưa có trong danh mục (CĐT mới / tên khác): vẫn cộng để tổng luôn bằng tổng 4 biểu con
  Object.keys(tb).forEach((k) => { if (!val[k] && !dung.has(k) && sc.has(k.split('|')[1])) { val[k] = { lk: 0, th: 0 }; ten[k] = (coTen[k]) || k.split('|')[0]; } });
  const thua = Object.keys(val).filter((k) => !dung.has(k)).map((k) => ({ ten: ten[k], thua: 1, n: 1, tlk: (tb[k] || {}).lk || 0, tth: (tb[k] || {}).th || 0, a: '', b: ten[k], c: k.split('|')[1], lv: 1, k: 'row', lk: val[k].lk, th: val[k].th }));
  // Dòng trong file THBC chưa có trong danh mục nhưng tên có đuôi "xã/phường X" (vd. "Phòng Kinh tế xã Linh Hồ"): gộp vào dòng xã/phường đó, để khối xã luôn đủ 124 xã phường
  {
    let kx = -1; const idx = new Map();
    rows.forEach((r, i) => { if (r.k === 'khoi') kx = /xã|phường/i.test(r.b || '') ? i : -1; else if (kx >= 0 && r.k === 'row' && r.a && /^(xã|phường)\s/i.test(r.b || '')) idx.set(chuan(r.b) + '|' + r.c, { i, kx }); });
    for (let q = thua.length - 1; q >= 0; q--) {
      const x = thua[q], nm = chuan(x.b); let best = null;
      idx.forEach((v, k) => { const [ten, c] = k.split('|'); if (c === x.c && nm.length > ten.length && nm.endsWith(' ' + ten) && (!best || ten.length > best.l)) best = { v, l: ten.length }; });
      if (!best) continue;
      [rows[best.v.i], rows[best.v.kx]].forEach((r) => ['lk', 'th', 'tlk'].forEach((f) => { r[f] = (r[f] || 0) + (x[f] || 0); })); rows[best.v.i].n = (rows[best.v.i].n || 0) + 1; rows[best.v.kx].n = (rows[best.v.kx].n || 0) + 1;
      thua.splice(q, 1);
    }
  }
  const top = rows.filter((r) => r.k === 'khoi'), tong = { lk: 0, th: 0, tlk: 0, tth: 0, n: 0 };
  top.forEach((r) => { tong.lk += r.lk; tong.th += r.th; tong.tlk += r.tlk; tong.tth += r.tth; tong.n += r.n; }); thua.forEach((r) => { tong.lk += r.lk; tong.th += r.th; tong.tlk += r.tlk; tong.tth += r.tth; tong.n += 1; });
  const t0 = rows.find((r) => r.k === 'tot'); t0.lk = tong.lk; t0.th = tong.th; t0.tlk = tong.tlk; t0.tth = tong.tth; t0.n = tong.n;
  const meta = await L._.db().q('SELECT v FROM kv WHERE k=$1', ['thbcc:' + c.ky]);
  const co = !!coTb.length;
  rows.forEach((x) => { if (co && x.n != null) { x.dlk = x.lk - x.tlk; const tol = Math.max(1, x.n * 0.5); x.ttl = Math.abs(x.dlk) <= tol ? 'khop' : (x.dlk < 0 ? 'thap' : 'cao'); } delete x.tth; });   // chỉ đối chiếu lũy kế
  const fixLech = (x) => { if (co && x.n != null) { x.dlk = x.lk - x.tlk; const tol = Math.max(1, x.n * 0.5); x.ttl = Math.abs(x.dlk) <= tol ? 'khop' : (x.dlk < 0 ? 'thap' : 'cao'); } };
  thua.forEach(fixLech);
  if (full) { RG.kieu(rows); if (thua.length) rows.push({ a: '', b: 'CHƯA CÓ TRONG DANH MỤC', c: '', lv: 0, k: 'khoi', lk: thua.reduce((s, r) => s + r.lk, 0), th: thua.reduce((s, r) => s + r.th, 0) }, ...thua.map((x) => Object.assign({ st: 'ind' }, x))); }
  else rows = RG.rutGon(rows, thua, { leafOk: (x) => x.k === 'row' && x.n > 0, sum: ['lk', 'th', 'n', 'tlk'], fix: fixLech });
  const gcDoc = await gcLay(c.ky); rows.forEach((x) => { const g = gcDoc[gcKey(x)]; if (g) x.gc = g; });
  return { sua: q.vt === 'TH' ? 'TH' : (nhapDuoc(q) ? 'PGD' : ''), pgd: q.pgd, ky0: c.ky, ky: c.nhan, rows, soThua: thua.length, co, full, meta: full && meta.length ? JSON.parse(meta[0].v) : null };
}
const gcKey = (x) => [x.a || '', x.b || '', x.c || ''].join('|');
async function gcLay(ky) { const r = await L._.db().q('SELECT v FROM kv WHERE k=$1', ['bt:gc:' + ky]); try { return r.length ? (JSON.parse(r[0].v) || {}) : {}; } catch (e) { return {}; } }
const nhapDuoc = (q) => q.vt === 'PGD' && ['LAP', ''].includes(q.tk.cv || '');   // người nhập phòng giao dịch / Nghiệp vụ 2
async function btGhiChu(token, kyIn, key, text) {   // ghi chú từng dòng của biểu Đối chiếu THBC: THBC / quản trị (mọi dòng), người nhập phòng (dòng của phòng mình)
  const q = await L.quyen(token);
  if (q.vt !== 'TH' && !(nhapDuoc(q) && String(key || '').split('|')[2] === q.pgd)) throw L._.E('Chỉ người nhập của phòng (hoặc Phòng NV2) mới nhập ghi chú cho dòng này.');
  key = String(key || '').substring(0, 300); text = String(text || '').replace(/\s+/g, ' ').trim(); if (text.length > 300) throw L._.E('Ghi chú tối đa 300 ký tự.');
  if (!key) throw L._.E('Thiếu dòng cần ghi chú.');
  const c = await L._.chonKy(kyIn), d = await gcLay(c.ky); if (text) d[key] = text; else delete d[key];
  await L._.db().q('INSERT INTO kv (k,v) VALUES ($1,$2) ON CONFLICT (k) DO UPDATE SET v=excluded.v', ['bt:gc:' + c.ky, JSON.stringify(d)]); return { ok: 1 };
}
async function bieuTong(token, kyIn, xem) { const r = await tinh(token, kyIn, xem); r.xem = xem && xem !== '*' ? xem : '*'; return r; }
module.exports = { btGhiChu, gcKey, bieuTong, tinh, chuan };
