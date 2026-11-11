'use strict';
// Đọc file .xlsx tối giản (không cần thư viện ngoài): trả về các dòng của trang tính đầu tiên dưới dạng mảng [giá trị, ...] (số hoặc chuỗi).
const zlib = require('zlib');
function giaiNen(buf) {
  let e = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('Không phải file Excel (.xlsx) hợp lệ.');
  const n = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16); const out = {};
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('File Excel bị lỗi cấu trúc.');
    const meth = buf.readUInt16LE(p + 10), csz = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const ten = buf.toString('utf8', p + 46, p + 46 + nl); p += 46 + nl + el + cl;
    if (!/^(xl\/(workbook\.xml|sharedStrings\.xml|_rels\/workbook\.xml\.rels|worksheets\/sheet\d+\.xml))$/.test(ten)) continue;
    const ds = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28), raw = buf.subarray(ds, ds + csz);
    out[ten] = (meth === 0 ? raw : zlib.inflateRawSync(raw)).toString('utf8');
  }
  return out;
}
const bo = (s) => s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (m, g) => ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[g] || (g[1] === 'x' ? String.fromCodePoint(parseInt(g.slice(2), 16)) : String.fromCodePoint(parseInt(g.slice(1), 10)))));
const cotSo = (ref) => { const m = /^([A-Z]+)/.exec(ref)[1]; let n = 0; for (const ch of m) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
function docXlsx(buf) {
  const f = giaiNen(buf), wb = f['xl/workbook.xml'];
  if (!wb) throw new Error('Không đọc được file Excel này.');
  const ss = []; if (f['xl/sharedStrings.xml']) for (const m of f['xl/sharedStrings.xml'].matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) { let t = ''; for (const x of m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) t += x[1]; ss.push(bo(t)); }
  let path = null; const sh = /<sheet\b[^>]*?r:id="([^"]+)"/.exec(wb), rel = f['xl/_rels/workbook.xml.rels'] || '';
  if (sh) { const r = new RegExp('<Relationship\\b[^>]*?Id="' + sh[1] + '"[^>]*>').exec(rel), t = r && /Target="([^"]+)"/.exec(r[0]); if (t) path = 'xl/' + t[1].replace(/^\/?(xl\/)?/, ''); }
  if (!path || !f[path]) path = Object.keys(f).filter((k) => /worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  if (!path) throw new Error('File Excel không có trang tính.');
  const rows = [];
  for (const rm of f[path].matchAll(/<row\b[^>]*?r="(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = +rm[1] - 1, arr = []; if (!rm[2]) continue;
    for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const at = cm[1], ref = /\br="([A-Z]+\d+)"/.exec(at); if (!ref || !cm[2]) continue;
      const t = (/\bt="(\w+)"/.exec(at) || [])[1], v = /<v>([\s\S]*?)<\/v>/.exec(cm[2]); let val = null;
      if (t === 'inlineStr') { let s = ''; for (const x of cm[2].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) s += x[1]; val = bo(s); }
      else if (v) val = t === 's' ? (ss[+v[1]] == null ? '' : ss[+v[1]]) : (t === 'str' || t === 'e' ? bo(v[1]) : (t === 'b' ? v[1] === '1' : Number(v[1])));
      if (val !== null && val !== '') arr[cotSo(ref[1])] = val;
    }
    rows[r] = arr;
  }
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return rows;
}
module.exports = { docXlsx };
