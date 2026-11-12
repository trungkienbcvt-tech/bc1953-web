'use strict';
// Dùng chung cho các biểu theo danh mục chủ đầu tư (Đối chiếu THBC, Biểu 04-KBNN):
//  - kieu(): gắn kiểu hiển thị: đơn vị chủ quản và đơn vị độc lập giống nhau (st 'ind' – đậm); chỉ đơn vị trực thuộc khác (st 'sub' – nghiêng).
//  - rutGon(): biểu của một phòng: giữ đề mục KHỐI, chỉ các đơn vị của phòng, đánh số cây 1, 1.1, 1.2 (mỗi khối đánh lại từ 1);
//    chỉ có dòng chủ quản khi phòng có từ 2 đơn vị trực thuộc cùng chủ quản.
const DM = require('./dmcdt.json');
const cha = {}; DM.forEach((o) => (o.kids || []).forEach((k) => { cha[k] = o; }));
const laKhoi = (o) => !o || o.b === 'TỔNG CỘNG' || /^[IVX]+$/.test(o.a || '');
const khoiCua = (o) => { let p = o; while (cha[p.row] && !laKhoi(p)) p = cha[p.row]; return laKhoi(p) ? p : null; };
// đơn vị chủ quản cấp 1 (con trực tiếp của khối) của một dòng; null nếu chính nó nằm ngay dưới khối
const chuQuan = (o) => { let p = cha[o.row]; if (!p || laKhoi(p)) return null; while (cha[p.row] && !laKhoi(cha[p.row])) p = cha[p.row]; return p; };

function kieu(rows) {   // rows tương ứng DM theo thứ tự
  rows.forEach((x, i) => {
    const o = DM[i]; if (!o || !x || x.k === 'tot' || x.k === 'khoi') return;
    const p = cha[o.row], duoiKhoi = !p || laKhoi(p);
    x.st = duoiKhoi ? 'ind' : 'sub';
  });
  return rows;
}
/* opts: { leafOk(x), sum: ['lk','th',...], fix(row) } */
function rutGon(rows, thua, opts) {
  const idx = {}; DM.forEach((o, i) => { idx[o.row] = i; });
  const tot = rows.find((x) => x.k === 'tot'), out = [tot];
  const leaves = DM.filter((o, i) => !o.kids && rows[i] && opts.leafOk(rows[i]));
  const sm = (mem, k) => mem.reduce((a, o) => a + (Number(rows[idx[o.row]][k]) || 0), 0);
  const khois = DM.filter((o) => o.kids && cha[o.row] && cha[o.row].b === 'TỔNG CỘNG');
  khois.forEach((kh) => {
    const ls = leaves.filter((o) => khoiCua(o) && khoiCua(o).row === kh.row); if (!ls.length) return;
    const kr = Object.assign({}, rows[idx[kh.row]]); opts.sum.forEach((k) => { kr[k] = sm(ls, k); }); if (opts.fix) opts.fix(kr); out.push(kr);
    const dem = {}; ls.forEach((o) => { const p = chuQuan(o); if (p) dem[p.row] = (dem[p.row] || 0) + 1; });
    let nTop = 0, nSub = 0, last = null;
    ls.forEach((o) => {
      const x = rows[idx[o.row]], p = chuQuan(o), nhom = p && dem[p.row] > 1;
      if (nhom && last !== p.row) {
        last = p.row; nTop++; nSub = 0;
        const mem = ls.filter((q) => { const c = chuQuan(q); return c && c.row === p.row; });
        const g = { a: nTop, b: p.b, c: '', lv: 1, k: 'nhom', st: 'ind', n: mem.length }; opts.sum.forEach((k) => { g[k] = sm(mem, k); }); if (opts.fix) opts.fix(g); out.push(g);
      }
      if (!nhom) last = null;
      out.push(Object.assign({}, x, { a: nhom ? nTop + '.' + (++nSub) : ++nTop, b: x.ten || x.b, lv: nhom ? 2 : 1, st: nhom ? 'sub' : 'ind' }));
    });
  });
  if (thua.length) {
    const kr = { a: '', b: 'CHƯA CÓ TRONG DANH MỤC', c: '', lv: 0, k: 'khoi' }; opts.sum.forEach((k) => { kr[k] = thua.reduce((a, r) => a + (Number(r[k]) || 0), 0); }); if (opts.fix) opts.fix(kr);
    out.push(kr); thua.forEach((x) => out.push(Object.assign({ st: 'ind' }, x)));
  }
  return out;
}
module.exports = { kieu, rutGon };
