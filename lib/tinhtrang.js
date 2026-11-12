'use strict';
// Biểu tình trạng gửi báo cáo của chủ đầu tư (mẫu sheet "CĐT"): theo danh mục lib/dmcdt.json, tình trạng từng biểu + tổng hợp đúng hạn / chậm / chưa gửi.
const C = require('./common');
const L = require('./logic');
const BT = require('./bieutong');
const RG = require('./rutgon');
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
  // phân 4 nhóm: đúng hạn / chậm / gửi chưa đầy đủ (đã gửi một phần) / chưa gửi
  const q4 = (p) => { const r = { qd: 0, qc: 0, qu: 0, qn: 0 }; if (p.cat === 'dung') r.qd = 1; else if (p.cat === 'cham') r.qc = 1; else if (p.cat === 'chua') { if (CFG.some((b) => ['Đã gửi BC', 'Gửi BC chậm', KPS].includes(p.s[b.id]))) r.qu = 1; else r.qn = 1; } return r; };
  const byRow = {}; DM.forEach((o) => { byRow[o.row] = o; });
  const memo = {}, dung = new Set();
  const dem = (o) => {
    if (memo[o.row]) return memo[o.row];
    let r;
    if (o.kids) { r = { nd: 0, nc: 0, nx: 0, qd: 0, qc: 0, qu: 0, qn: 0 }; o.kids.forEach((k) => { const s = dem(byRow[k]); ['nd', 'nc', 'nx', 'qd', 'qc', 'qu', 'qn'].forEach((f) => { r[f] += s[f]; }); }); }
    else if (!sc.has(o.c)) r = { nd: 0, nc: 0, nx: 0, qd: 0, qc: 0, qu: 0, qn: 0, ngoai: 1 };
    else { const k = BT.chuan(o.ten) + '|' + o.c; dung.add(k); const p = phanLoai(k); r = Object.assign({ nd: p.cat === 'dung' ? 1 : 0, nc: p.cat === 'cham' ? 1 : 0, nx: p.cat === 'chua' ? 1 : 0, p, ap: p.cat !== 'khong' }, q4(p)); }
    return memo[o.row] = r;
  };
  const sub = new Set(); DM.forEach((o) => (o.kids || []).forEach((k) => sub.add(k)));
  const lv = {}; const dq = (o, d) => { lv[o.row] = d; (o.kids || []).forEach((k) => dq(byRow[k], d + 1)); }; dq(DM.find((o) => o.b === 'TỔNG CỘNG'), -1);
  let rows = DM.map((o) => {
    const m = dem(o), tot = o.b === 'TỔNG CỘNG', lf = !o.kids;
    const x = { a: o.a, b: o.b, c: o.c, ten: lf ? o.ten : undefined, lv: tot ? 0 : lv[o.row], k: tot ? 'tot' : (lv[o.row] === 0 && !/^\d/.test(o.a) ? 'khoi' : (o.kids ? 'nhom' : 'row')), nd: m.nd, nc: m.nc, nx: m.nx, qd: m.qd, qc: m.qc, qu: m.qu, qn: m.qn };
    if (lf) { if (m.ngoai) x.ngoai = 1; else { x.s = m.p.s; x.cat = m.p.cat; x.gc = m.p.gc; } }
    return x;
  });
  const thua = Object.keys(st).filter((k) => !dung.has(k)).map((k) => { const p = phanLoai(k); return Object.assign({ a: '', b: ten[k], ten: ten[k], c: k.split('|')[1], lv: 1, k: 'row', thua: 1, s: p.s, cat: p.cat, gc: p.gc, nd: p.cat === 'dung' ? 1 : 0, nc: p.cat === 'cham' ? 1 : 0, nx: p.cat === 'chua' ? 1 : 0 }, q4(p)); });
  const t0 = rows.find((r) => r.k === 'tot');
  [...rows.filter((r) => r.k === 'khoi'), ...thua].forEach((r) => { t0.nd += 0; });
  const tong = { nd: 0, nc: 0, nx: 0 }; rows.filter((r) => r.k === 'khoi').forEach((r) => { tong.nd += r.nd; tong.nc += r.nc; tong.nx += r.nx; }); thua.forEach((r) => { tong.nd += r.nd; tong.nc += r.nc; tong.nx += r.nx; });
  Object.assign(t0, tong);
  const full = q.scope.length >= C.DS_PGD.length;
  const rowsF = full ? rows : rows.filter((x) => x.k === 'tot' || (x.k === 'row' ? !x.ngoai : (x.nd + x.nc + x.nx) > 0));   // chỉ dùng để thống kê
  const fixGc = (x) => { if (x.k !== 'row') x.gc = x.k === 'tot' ? 'Tổng ' + (x.nd + x.nc + x.nx) + ' chủ đầu tư' : (x.nx ? 'Còn ' + x.nx + ' chủ đầu tư chưa gửi / chưa đầy đủ' : (x.nd + x.nc ? 'Báo cáo đầy đủ' : '')); };
  const lon = { tinh: { n: 0, dung: 0, cham: 0, chua: 0 }, xa: { n: 0, dung: 0, cham: 0, chua: 0 } }; let kh = '';
  rowsF.forEach((x) => { if (x.k === 'khoi') { kh = x.a; return; } if (x.k === 'tot' || x.lv !== 1 || x.thua || (kh !== 'I' && kh !== 'II')) return;
    const m = x.nd + x.nc + x.nx; if (!m) return; const g = lon[kh === 'I' ? 'tinh' : 'xa']; g.n++; if (x.nx) g.chua++; else if (x.nc) g.cham++; else g.dung++; });
  // hiển thị: chủ quản = độc lập (đậm), trực thuộc nghiêng; biểu của một phòng được rút gọn và đánh số cây
  if (full) { RG.kieu(rows); if (thua.length) rows.push({ a: '', b: 'CHƯA CÓ TRONG DANH MỤC', c: '', lv: 0, k: 'khoi', nd: 0, nc: 0, nx: 0 }, ...thua.map((x) => Object.assign({ st: 'ind' }, x))); }
  else rows = RG.rutGon(rows, thua, { leafOk: (x) => x.k === 'row' && !x.ngoai, sum: ['nd', 'nc', 'nx', 'qd', 'qc', 'qu', 'qn'], fix: fixGc });
  rows.forEach(fixGc);
  // thống kê theo ĐƠN VỊ BÁO CÁO (chủ đầu tư cấp 1: độc lập hoặc chủ quản); đơn vị trực thuộc không tính riêng
  const mkOf = (x) => { const n = x.qd + x.qc + x.qu + x.qn; if (!n) return ''; if (!x.qu && !x.qn) return x.qc ? 'cham' : 'dung'; return !x.qd && !x.qc && !x.qu ? 'chua' : 'du'; };
  const tk = { n: 0, tinh: 0, xa: 0, dung: 0, cham: 0, du: 0, chua: 0 }, ku = () => ({ n: 0, dung: 0, cham: 0, du: 0, chua: 0 });
  let tot0 = null, kh0 = null, ukh = null; const utot = ku();
  rows.forEach((x) => {
    if (x.k === 'tot') { tot0 = x; return; }
    if (x.k === 'khoi') { kh0 = x; ukh = ku(); x.u = ukh; return; }
    x.mk = x.s || x.qd + x.qc + x.qu + x.qn ? mkOf(x) : '';
    if (x.lv === 1 && x.mk && kh0) { [ukh, utot].forEach((u) => { u.n++; u[x.mk]++; }); if (/^I$/.test(kh0.a)) tk.tinh++; else if (/^II$/.test(kh0.a)) tk.xa++; }
  });
  Object.assign(tk, utot); tot0.u = utot;
  rows.forEach((x) => { if (x.k === 'tot') x.gc = 'Tổng ' + x.u.n + ' chủ đầu tư'; else if (x.k === 'khoi') x.gc = x.u.n + ' chủ đầu tư' + (x.u.du + x.u.chua ? ' · ' + (x.u.du + x.u.chua) + ' chưa gửi / chưa đầy đủ' : ''); else if (x.k === 'nhom') x.gc = x.nx ? 'Còn ' + x.nx + ' đơn vị trực thuộc chưa gửi / chưa đầy đủ' : (x.nd + x.nc ? 'Báo cáo đầy đủ' : ''); });
  return { ky: c.nhan, rows, tk, tong, lon, full, pgd: full ? 'Toàn tỉnh' : q.scope.join(', ') };
}
module.exports = { tinh, tinhTrang: tinh };
