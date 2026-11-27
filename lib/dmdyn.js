'use strict';
// Mở rộng khung dòng của biểu theo danh mục chủ đầu tư (lib/dmcdt.json là khung gốc của THBC).
// Chủ đầu tư / phòng giao dịch phát sinh sau khi lập khung được tự thêm dòng:
//  - Chủ đầu tư có sẵn chỉ thêm phòng giao dịch: chèn dòng "Giao dịch tại" ngay dưới chủ đầu tư đó.
//  - Khối xã, phường: chủ đầu tư trực thuộc mới hiện ngay dưới chủ đầu tư lớn đã có (không đánh STT); chủ đầu tư lớn mới thêm cuối khối, STT tiếp theo.
//  - Khối tỉnh: chủ đầu tư mới thêm dưới cùng khối tỉnh, STT tiếp theo.
// Mảng DM (require('./dmcdt.json')) được thay nội dung tại chỗ để mọi biểu dùng chung khung đã mở rộng.
const fs = require('fs'), path = require('path');
const BASE = JSON.parse(fs.readFileSync(path.join(__dirname, 'dmcdt.json'), 'utf8'));
const DM = require('./dmcdt.json');
const chuan = (s) => String(s || '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
let _t = 0, _sig = null;
const goc = () => JSON.parse(JSON.stringify(BASE));
const pgdMau = (g) => String(g || '').replace(/^Phòng giao dịch số /, 'Phòng giao dịch ');

function xay(rows, BT) {
  const arr = goc(), by = {}; arr.forEach((o) => { by[o.row] = o; });
  const cha = () => { const c = {}; arr.forEach((o) => (o.kids || []).forEach((k) => { c[k] = o; })); return c; };
  let ch = cha(), maxRow = Math.max(...arr.map((o) => o.row));
  const ck = (s) => BT.chuan(s);
  const tinh = arr.find((o) => o.a === 'I'), xa = arr.find((o) => o.a === 'II');
  const co = new Set(), ten2 = new Map();   // co: khóa tên|phòng đã có dòng; ten2: tên → nút (dòng/nhóm của chủ đầu tư)
  arr.forEach((o) => { if (!o.kids && o.ten && o.c) { co.add(ck(o.ten) + '|' + o.c); const p = ch[o.row], nut = p && p.kids && p.b && ck(p.b) === ck(o.ten) && p.a ? p : o; if (!ten2.has(ck(o.ten))) ten2.set(ck(o.ten), nut); } });
  arr.forEach((o) => { if (o.kids && o.b && !ten2.has(ck(o.b)) && o !== tinh && o !== xa && o.b !== 'TỔNG CỘNG') ten2.set(ck(o.b), o); });
  const cuoi = (o) => { let i = arr.indexOf(o); const dq = (x) => { const k = x.kids || []; return k.length ? dq(by[k[k.length - 1]]) : arr.indexOf(x); }; i = dq(o); return i; };
  const them = (o, viTri, cap) => {   // cap: nút cha; viTri: sau nút này (anh em) hoặc null = cuối cha
    o.row = ++maxRow; by[o.row] = o; o.kids = null;
    if (viTri) { const p = ch[viTri.row]; arr.splice(cuoi(viTri) + 1, 0, o); p.kids.splice(p.kids.indexOf(viTri.row) + 1, 0, o.row); ch[o.row] = p; }
    else { arr.splice(cuoi(cap) + 1, 0, o); cap.kids.push(o.row); ch[o.row] = cap; }
  };
  const sttSau = (kh) => String(Math.max(0, ...(kh.kids || []).map((k) => parseInt(by[k].a, 10) || 0)) + 1);
  rows.forEach((x) => {
    const khoi = String(x[1] || ''), lon = String(x[2] || ''), tt = String(x[3] || ''), name = tt || lon, pgd = x[7] || {};
    if (!name) return;
    Object.keys(pgd).forEach((g) => {
      if (!(Number(pgd[g]) > 0)) return;
      const c = pgdMau(g), key = ck(name) + '|' + c; if (co.has(key)) return;
      const nut = ten2.get(ck(name));
      if (nut) {   // chủ đầu tư có sẵn: thêm phòng giao dịch ngay dưới
        const o = { a: '', b: 'Giao dịch tại', c, ten: name };
        if (nut.kids) them(o, null, nut); else them(o, nut, null);
        co.add(key); return;
      }
      const laXa = /xã|phường/i.test(khoi), lonNut = tt ? ten2.get(ck(lon)) : null;
      if (laXa && lonNut) { const o = { a: '', b: name, c, ten: name, tt: 1 }; if (lonNut.kids) them(o, null, lonNut); else them(o, lonNut, null); ten2.set(ck(name), by[maxRow]); co.add(key); return; }
      const kh = laXa ? xa : tinh, o = { a: sttSau(kh), b: name, c, ten: name };
      them(o, null, kh); ten2.set(ck(name), by[maxRow]); co.add(key);
    });
  });
  return arr;
}
async function nap(force) {
  if (!force && Date.now() - _t < 30000) return DM;
  let r; try { const M = require('./danhmuc'); r = await M._rpc('cv_dm_cdt_ds', {}); } catch (e) { return DM; }
  _t = Date.now();
  const rows = (r && r.rows) || [], sig = JSON.stringify(rows.map((x) => [x[1], x[2], x[3], x[7]]));
  if (sig === _sig) return DM; _sig = sig;
  try { const arr = xay(rows, require('./bieutong')); DM.splice(0, DM.length, ...arr); } catch (e) { _sig = null; }
  return DM;
}
module.exports = { nap, xay, BASE, _reset: () => { _t = 0; _sig = null; DM.splice(0, DM.length, ...goc()); } };
