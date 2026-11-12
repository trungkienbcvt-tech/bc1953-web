'use strict';
// Biểu tình trạng gửi báo cáo của chủ đầu tư (mẫu sheet "CĐT"): theo danh mục lib/dmcdt.json, tình trạng từng biểu + tổng hợp đúng hạn / chậm / chưa gửi.
const C = require('./common');
const L = require('./logic');
const BT = require('./bieutong');
const DM = require('./dmcdt.json');
const { CFG } = C;
const TEN_B = { b01: '01', b02: '02', b03a: '03 (21-25)', b03b: '03 (26-30)' };

// gộp tình trạng nhiều dòng cùng chủ đầu tư trong một biểu: thiếu > chậm > đã gửi
const KPS = C.KPS;
const gop0 = (ds) => { if (!ds.length) return ''; if (ds.some((x) => x === 'Chưa gửi BC')) return 'Chưa gửi BC'; if (ds.some((x) => !x)) return 'Chưa chọn'; if (ds.some((x) => x === 'Gửi BC chậm')) return 'Gửi BC chậm'; return 'Đã gửi BC'; };
// "Không phát sinh" không làm ảnh hưởng đánh giá: chỉ khi tất cả các dòng của chủ đầu tư đều không phát sinh mới ghi là Không phát sinh
const gop = (ds) => { const x = ds.filter((v) => v !== KPS); return ds.length && !x.length ? KPS : gop0(x); };

async function tinh(token, kyIn) {
  const q = await L.quyen(token), c = await L._.chonKy(kyIn), all = await L._.nap(c), sc = new Set(q.scope);
  const st = {}, ten = {};   // khóa -> bid -> [tình trạng]
  CFG.forEach((b) => {
    const iSt = b.cols.find((x) => x.t === 's').c;
    all[b.id].forEach((z) => { if (!sc.has(z.d.pgd)) return; const k = BT.chuan(z.d.b) + '|' + z.d.pgd; ten[k] = ten[k] || z.d.b; ((st[k] = st[k] || {})[b.id] = st[k][b.id] || []).push(String(z.o[iSt] || '')); });
  });
  const phanLoai = (k) => {
    const s = {}; let thieu = [], cham = false, co = 0;
    CFG.forEach((b) => { const ds = (st[k] || {})[b.id]; s[b.id] = ds ? gop(ds) : ''; if (!ds) return; co++; if (s[b.id] === 'Gửi BC chậm') cham = true; else if (s[b.id] !== 'Đã gửi BC' && s[b.id] !== KPS) thieu.push(TEN_B[b.id]); });
    if (!co) return { s, cat: 'khong', gc: '' };
    if (thieu.length) return { s, cat: 'chua', gc: 'Chưa đầy đủ: thiếu biểu ' + thieu.join(', ') };
    const kps = CFG.filter((b) => s[b.id] === KPS).map((b) => TEN_B[b.id]);
    const ghiKps = kps.length ? ' (không phát sinh biểu ' + kps.join(', ') + ')' : '';
    return cham ? { s, cat: 'cham', gc: 'Báo cáo đầy đủ, có gửi chậm' + ghiKps } : { s, cat: 'dung', gc: 'Báo cáo đầy đủ' + ghiKps };
  };
  const byRow = {}; DM.forEach((o) => { byRow[o.row] = o; });
  const memo = {}, dung = new Set();
  const dem = (o) => {
    if (memo[o.row]) return memo[o.row];
    let r;
    if (o.kids) { r = { nd: 0, nc: 0, nx: 0 }; o.kids.forEach((k) => { const s = dem(byRow[k]); r.nd += s.nd; r.nc += s.nc; r.nx += s.nx; }); }
    else if (!sc.has(o.c)) r = { nd: 0, nc: 0, nx: 0, ngoai: 1 };
    else { const k = BT.chuan(o.ten) + '|' + o.c; dung.add(k); const p = phanLoai(k); r = { nd: p.cat === 'dung' ? 1 : 0, nc: p.cat === 'cham' ? 1 : 0, nx: p.cat === 'chua' ? 1 : 0, p, ap: p.cat !== 'khong' }; }
    return memo[o.row] = r;
  };
  const sub = new Set(); DM.forEach((o) => (o.kids || []).forEach((k) => sub.add(k)));
  const lv = {}; const dq = (o, d) => { lv[o.row] = d; (o.kids || []).forEach((k) => dq(byRow[k], d + 1)); }; dq(DM.find((o) => o.b === 'TỔNG CỘNG'), -1);
  let rows = DM.map((o) => {
    const m = dem(o), tot = o.b === 'TỔNG CỘNG', lf = !o.kids;
    const x = { a: o.a, b: o.b, c: o.c, ten: lf ? o.ten : undefined, lv: tot ? 0 : lv[o.row], k: tot ? 'tot' : (lv[o.row] === 0 && !/^\d/.test(o.a) ? 'khoi' : (o.kids ? 'nhom' : 'row')), nd: m.nd, nc: m.nc, nx: m.nx };
    if (lf) { if (m.ngoai) x.ngoai = 1; else { x.s = m.p.s; x.cat = m.p.cat; x.gc = m.p.gc; } }
    return x;
  });
  const thua = Object.keys(st).filter((k) => !dung.has(k)).map((k) => { const p = phanLoai(k); return { a: '', b: ten[k], ten: ten[k], c: k.split('|')[1], lv: 1, k: 'row', thua: 1, s: p.s, cat: p.cat, gc: p.gc, nd: p.cat === 'dung' ? 1 : 0, nc: p.cat === 'cham' ? 1 : 0, nx: p.cat === 'chua' ? 1 : 0 }; });
  const t0 = rows.find((r) => r.k === 'tot');
  [...rows.filter((r) => r.k === 'khoi'), ...thua].forEach((r) => { t0.nd += 0; });
  const tong = { nd: 0, nc: 0, nx: 0 }; rows.filter((r) => r.k === 'khoi').forEach((r) => { tong.nd += r.nd; tong.nc += r.nc; tong.nx += r.nx; }); thua.forEach((r) => { tong.nd += r.nd; tong.nc += r.nc; tong.nx += r.nx; });
  Object.assign(t0, tong);
  if (thua.length) rows.push({ a: '', b: 'CHƯA CÓ TRONG DANH MỤC', c: '', lv: 0, k: 'khoi', nd: 0, nc: 0, nx: 0 }, ...thua);
  const full = q.scope.length >= C.DS_PGD.length;
  if (!full) rows = rows.filter((x) => x.k === 'tot' || (x.k === 'row' ? !x.ngoai : (x.nd + x.nc + x.nx) > 0));
  rows.forEach((x) => { if (x.k !== 'row') x.gc = x.k === 'tot' ? 'Tổng ' + (x.nd + x.nc + x.nx) + ' chủ đầu tư' : (x.nx ? 'Còn ' + x.nx + ' chủ đầu tư chưa gửi / chưa đầy đủ' : (x.nd + x.nc ? 'Báo cáo đầy đủ' : '')); });
  const lon = { tinh: { n: 0, dung: 0, cham: 0, chua: 0 }, xa: { n: 0, dung: 0, cham: 0, chua: 0 } }; let kh = '';
  rows.forEach((x) => { if (x.k === 'khoi') { kh = x.a; return; } if (x.k === 'tot' || x.lv !== 1 || x.thua || (kh !== 'I' && kh !== 'II')) return;
    const m = x.nd + x.nc + x.nx; if (!m) return; const g = lon[kh === 'I' ? 'tinh' : 'xa']; g.n++; if (x.nx) g.chua++; else if (x.nc) g.cham++; else g.dung++; });
  return { ky: c.nhan, rows, tong, lon, full, pgd: full ? 'Toàn tỉnh' : q.scope.join(', ') };
}
module.exports = { tinh, tinhTrang: tinh };
