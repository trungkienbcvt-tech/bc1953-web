'use strict';
// Biểu tổng theo danh mục chủ đầu tư (ngoài yêu cầu BC 1953): lũy kế / trong tháng = tổng 4 biểu con,
// xếp theo danh mục lib/dmcdt.json để đối chiếu với file THBC. Khóa ghép: tên chủ đầu tư (đã chuẩn hóa) + PGD giao dịch.
const C = require('./common');
const L = require('./logic');
const DM = require('./dmcdt.json');
const { CFG, TONG_COL } = C;
const E = (m) => { const e = new Error(m); e.user = true; return e; };

const chuan = (s) => String(s || '').normalize('NFC').toLowerCase().replace(/\([^)]*\)/g, ' ')
  .replace(/oà/g, 'òa').replace(/oá/g, 'óa').replace(/oả/g, 'ỏa').replace(/uỳ/g, 'ùy').replace(/&/g, 'và')
  .replace(/\s+tỉnh tuyên quang\b/g, '').replace(/\s+tuyên quang\b/g, '').replace(/\s+tỉnh\b/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();


// Biểu của Phòng giao dịch: chỉ các dòng của phòng mình, không chia khối; chỉ có dòng nhóm khi một đơn vị chủ quản có từ 2 đơn vị trở lên cùng thuộc phòng
function rutGon(rows) {
  const cha = {}; DM.forEach((o) => (o.kids || []).forEach((k) => { cha[k] = o; }));
  const khoi = (o) => !o || o.b === 'TỔNG CỘNG' || /^[IVX]+$/.test(o.a || '');
  // đơn vị chủ quản lớn = tổ tiên cấp 1 (con trực tiếp của khối); không tính khối
  const nhomCua = (o) => { let p = o && cha[o.row]; if (!p || khoi(p)) return null; while (cha[p.row] && !khoi(cha[p.row])) p = cha[p.row]; return p; };
  const tot = rows.find((x) => x.k === 'tot'), la = rows.filter((x) => x.k === 'row' && !x.thua && x.n > 0), thua = rows.filter((x) => x.thua);
  const goc = (x) => DM.find((o) => !o.kids && o.ten === x.ten && o.c === x.c && (o.a || '') === (x.a || ''));
  const dem = {}; la.forEach((x) => { const p = nhomCua(goc(x)); if (p) dem[p.row] = (dem[p.row] || 0) + 1; });
  const out = [tot]; let nTop = 0, nSub = 0, last = null;
  la.forEach((x) => {
    const p = nhomCua(goc(x)), nhom = p && dem[p.row] > 1;
    if (nhom && last !== p.row) {
      last = p.row; nTop++; nSub = 0; const mem = la.filter((y) => { const q = nhomCua(goc(y)); return q && q.row === p.row; }), sm = (k) => mem.reduce((a, y) => a + (Number(y[k]) || 0), 0);
      const g = { a: nTop, b: p.b, c: '', lv: 1, k: 'nhom', lk: sm('lk'), th: sm('th'), n: mem.length, tlk: sm('tlk') };
      if (tot && tot.dlk !== undefined) { g.dlk = g.lk - g.tlk; const tol = Math.max(1, g.n * 0.5); g.ttl = Math.abs(g.dlk) <= tol ? 'khop' : (g.dlk < 0 ? 'thap' : 'cao'); }
      out.push(g);
    }
    if (!nhom) last = null;
    out.push(Object.assign({}, x, { a: nhom ? nTop + '.' + (++nSub) : ++nTop, b: x.ten || x.b, lv: nhom ? 2 : 1, st: nhom ? 'sub' : 'ind' }));
  });
  if (thua.length) { out.push({ a: '', b: 'CHƯA CÓ TRONG DANH MỤC', c: '', lv: 0, k: 'khoi', lk: thua.reduce((a, r) => a + r.lk, 0), th: thua.reduce((a, r) => a + r.th, 0) }); thua.forEach((x) => out.push(x)); }
  return out;
}
async function tinh(token, kyIn) {
  const q = await L.quyen(token);
  const sc = new Set(q.scope), full = q.scope.length >= C.DS_PGD.length;   // PGD / NV2 hẹp: chỉ thấy phần của mình, không thấy số THBC gốc
  const c = await L._.chonKy(kyIn), all = await L._.nap(c), val = {}, ten = {};
  CFG.forEach((b) => all[b.id].forEach((z) => {
    if (!sc.has(z.d.pgd)) return;
    const k = chuan(z.d.b) + '|' + z.d.pgd, e = val[k] = val[k] || { lk: 0, th: 0 }; ten[k] = ten[k] || z.d.b;
    e.lk += Number(z.o[TONG_COL[b.id][0]]) || 0; e.th += Number(z.o[TONG_COL[b.id][1]]) || 0;
  }));
  const tb = {}, coTb = (await L._.db().q('SELECT khoa,lk,th FROM thbc_cdt WHERE ky=$1', [c.ky])); coTb.forEach((x) => { tb[x.khoa] = { lk: Number(x.lk) || 0, th: Number(x.th) || 0 }; });
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
    return { ten: o.kids ? undefined : o.ten, a: o.a, b: o.b, c: o.c, lv: o.b === 'TỔNG CỘNG' ? 0 : lv[o.row], k: o.b === 'TỔNG CỘNG' ? 'tot' : (lv[o.row] === 0 && !/^\d/.test(o.a) ? 'khoi' : (o.kids ? 'nhom' : 'row')), lk: s && s.lk, th: s && s.th, n: s && s.n, tlk: s && s.tlk, tth: s && s.tth };
  });
  // Dòng chưa có trong danh mục (CĐT mới / tên khác): vẫn cộng để tổng luôn bằng tổng 4 biểu con
  const thua = Object.keys(val).filter((k) => !dung.has(k)).map((k) => ({ ten: ten[k], thua: 1, n: 1, tlk: (tb[k] || {}).lk || 0, tth: (tb[k] || {}).th || 0, a: '', b: ten[k], c: k.split('|')[1], lv: 1, k: 'row', lk: val[k].lk, th: val[k].th }));
  const top = rows.filter((r) => r.k === 'khoi'), tong = { lk: 0, th: 0, tlk: 0, tth: 0, n: 0 };
  top.forEach((r) => { tong.lk += r.lk; tong.th += r.th; tong.tlk += r.tlk; tong.tth += r.tth; tong.n += r.n; }); thua.forEach((r) => { tong.lk += r.lk; tong.th += r.th; tong.tlk += r.tlk; tong.tth += r.tth; tong.n += 1; });
  const t0 = rows.find((r) => r.k === 'tot'); t0.lk = tong.lk; t0.th = tong.th; t0.tlk = tong.tlk; t0.tth = tong.tth; t0.n = tong.n;
  if (thua.length) rows.push({ a: '', b: 'CHƯA CÓ TRONG DANH MỤC', c: '', lv: 0, k: 'khoi', lk: thua.reduce((s, r) => s + r.lk, 0), th: thua.reduce((s, r) => s + r.th, 0) }, ...thua);
  const meta = await L._.db().q('SELECT v FROM kv WHERE k=$1', ['thbcc:' + c.ky]);
  const co = !!coTb.length;
  rows.forEach((x) => { if (co && x.n != null) { x.dlk = x.lk - x.tlk; const tol = Math.max(1, x.n * 0.5); x.ttl = Math.abs(x.dlk) <= tol ? 'khop' : (x.dlk < 0 ? 'thap' : 'cao'); } delete x.tth; });   // chỉ đối chiếu lũy kế
  if (!full) rows = rutGon(rows);
  return { ky: c.nhan, rows, soThua: thua.length, co, full, meta: full && meta.length ? JSON.parse(meta[0].v) : null };
}
async function bieuTong(token, kyIn) { const r = await tinh(token, kyIn); return r; }
module.exports = { bieuTong, tinh, chuan };
