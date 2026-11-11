'use strict';
// Nạp dữ liệu khởi tạo từ bản chụp file Excel (seed/raw.json): cấu trúc dòng, số đầu kỳ (tháng 9), số tháng 10, tài khoản.
const crypto = require('crypto');
const C = require('./common');
const SCHEMA = require('./schema');
const bulk = require('./bulk');
const maNgau = () => { const ch = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 6; i++) s += ch[crypto.randomInt(ch.length)]; return s; };

function dungCauTruc(b, rows) {   // rows: [[r, v1..vn]] -> { defs, secs, cells }
  const defs = [], secs = [], cells = [], st = {}; let sec = '', par = null;
  const cc = b.cc;
  rows.forEach((row) => {
    const r = row[0], v = row.slice(1);
    let a0 = String(v[0]).trim(), c0 = String(v[2]).trim(), ten = String(v[1]).trim().replace(/\s+/g, ' ');
    if (!c0 && a0 && ten) { st.a = a0; st.b = ten; }
    else if (c0 && !a0 && !ten && st.a !== undefined) { a0 = st.a; ten = st.b; }
    if (!c0 && /^(I|II|III|IV)$/.test(a0)) { sec = a0 + ' - ' + ten; par = null; secs.push(sec); return; }
    if (!c0 && /^\d+$/.test(a0) && ten) { par = { a: a0, n: ten, t: a0 + '. ' + ten, i: 0 }; return; }
    if (C.DS_PGD.indexOf(c0) < 0) return;
    const coSo = b.cols.some((x) => x.t === 'n' && Number(v[x.c - 1]));
    if (!a0 && !ten && !coSo) return;   // dòng trống chưa có tên chủ đầu tư
    const con = !!(par && a0.indexOf(par.a + '.') === 0); let so = a0;
    if (con) { par.i++; so = par.a + '.' + par.i; if (/^Khu vực\s/i.test(ten)) ten = par.n; }
    defs.push({ r, a: so, b: ten, bd: ten, pgd: c0, sec, par: con ? par.t : '' });
    cc.lk.forEach((col, i) => {
      const lk = v[col - 1], th = v[cc.th[i] - 1];
      const hasLk = lk !== '' && lk != null, l = Number(lk) || 0, t = Number(th) || 0;
      cells.push({ ky: 'goc-1', bid: b.id, r, c: col, n: Math.round(l - t) });     // số đầu kỳ = lũy kế − phát sinh trong tháng của file
      if (hasLk) cells.push({ ky: 'goc', bid: b.id, r, c: col, n: Math.round(l) });
    });
    b.cols.forEach((x) => { if ((x.t === 's' || x.t === 'g') && String(v[x.c - 1]).trim()) cells.push({ ky: 'goc', bid: b.id, r, c: x.c, t: String(v[x.c - 1]).trim() }); });
  });
  const dem = {}; defs.forEach((d) => { if (d.par) { const k = d.par + '|' + d.b; dem[k] = (dem[k] || 0) + 1; } });
  defs.forEach((d) => { if (d.par && dem[d.par + '|' + d.b] > 1) d.bd = d.b + ' (' + (d.pgd === C.PHONG_NV2 ? 'Khu vực Tuyên Quang' : (d.pgd === 'Phòng giao dịch 20' ? 'Khu vực Hà Giang' : d.pgd)) + ')'; });
  return { defs, secs, cells };
}

async function seed(db, raw, opt) {
  opt = opt || {};
  const goc = opt.goc || '2026-10', truoc = C.kyTruoc(goc);
  await db.exec(SCHEMA);
  const co = await db.q('SELECT COUNT(*) AS n FROM kv');
  if (Number(co[0].n) > 0 && !opt.force) throw new Error('CSDL đã có dữ liệu. Muốn nạp lại: chạy với --force (hoặc thêm &force=1 vào địa chỉ /api/setup) — sẽ xóa số liệu hiện có.');
  if (opt.force) for (const t of ['cells', 'rowdef', 'secs', 'status', 'kyinfo', 'kv', 'accounts', 'sessions', 'fails', 'nhat_ky']) await db.exec('DELETE FROM ' + t);
  const codes = [];
  await db.tx(async (t) => {
    const dRow = [], sRow = [], cRow = [];
    for (const b of C.CFG) {
      const o = dungCauTruc(b, raw[b.id].rows);
      o.defs.forEach((d) => dRow.push([b.id, d.r, d.a, d.b, d.bd, d.pgd, d.sec, d.par]));
      o.secs.forEach((s, i) => sRow.push([b.id, i, s]));
      o.cells.forEach((c) => cRow.push([c.ky === 'goc' ? goc : truoc, c.bid, c.r, c.c, c.n == null ? null : c.n, c.t == null ? null : c.t]));
    }
    await bulk(t, 'rowdef', ['bid', 'r', 'a', 'b', 'bd', 'pgd', 'sec', 'par'], dRow);
    await bulk(t, 'secs', ['bid', 'ord', 'name'], sRow);
    await bulk(t, 'cells', ['ky', 'bid', 'r', 'c', 'n', 't'], cRow);
    await t.q('INSERT INTO kv (k,v) VALUES ($1,$2)', ['ky', goc]); await t.q('INSERT INTO kv (k,v) VALUES ($1,$2)', ['goc', goc]);
    await t.q('INSERT INTO kyinfo (ky) VALUES ($1)', [goc]);
    for (const p of C.DS_PGD) await t.q('INSERT INTO status (ky,pgd,tt,so_tra,so_gui) VALUES ($1,$2,$3,0,0)', [goc, p, C.T.CHUA]);
    const acc = [[C.ADMIN, 'TH', ''], ...C.DS_PGD.map((p) => [p, 'PGD', '']), ...(opt.nv2 || [['Cán bộ Nghiệp vụ 2', 'NV2', '']])];
    for (const a of acc) { const ma = maNgau(); codes.push({ ten: a[0], vt: a[1], ma }); await t.q('INSERT INTO accounts (ten,ma,vt,scope) VALUES ($1,$2,$3,$4)', [a[0], ma, a[1], a[2]]); }
  });
  return codes;
}
module.exports = { seed, dungCauTruc };
