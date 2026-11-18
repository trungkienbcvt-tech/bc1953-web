'use strict';
// Dữ liệu đối chiếu B501 ↔ TT85: nền là file so sánh (so_sanh_b501_tt85.json), ghi đè bằng các file người dùng tải lên (kv: dmup:b5, dmup:t85).
const L = require('./logic');
const STATIC = require('./so_sanh_b501_tt85.json');
const nf = (x) => String(x == null ? '' : x).normalize('NFC');
const bo = (x) => nf(x).toLowerCase().replace(/\s+/g, ' ').trim();
const boDau = (x) => bo(x).replace(/[^\p{L}\p{N}]+/gu, '');
function dice(a, b) {
  a = boDau(a); b = boDau(b); if (!a || !b) return 0; if (a === b) return 1;
  const bg = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const k = s.substr(i, 2); m.set(k, (m.get(k) || 0) + 1); } return m; };
  const x = bg(a), y = bg(b); let c = 0; x.forEach((v, k) => { c += Math.min(v, y.get(k) || 0); });
  return (2 * c) / (Math.max(1, a.length - 1) + Math.max(1, b.length - 1));
}
function phanLoai(b, t) {
  if (nf(b).trim() === nf(t).trim()) return ['Khớp', 1];
  const g = Math.round(dice(b, t) * 100) / 100;
  if (bo(b) === bo(t)) return ['Khác chữ hoa/thường', g];
  if (boDau(b) === boDau(t)) return ['Khác dấu câu / ký tự đặc biệt', g];
  const x = boDau(b), y = boDau(t); if (x.startsWith(y) || y.startsWith(x)) return ['Tên một bên ngắn hơn (thiếu phần đuôi)', g];
  return ['Khác nội dung tên', g];
}
function entry(bS, tS) {
  const o = { s: bS && tS ? 'BT' : (bS ? 'B' : 'T') };
  if (bS) { o.b = bS.t; o.n = bS.n ? 1 : 0; if (bS.bk && bS.bk.length) o.bk = bS.bk; }
  if (tS) { o.ta = tS.a ? 1 : 0; o.tl = tS.l ? 1 : 0; o.k = tS.k || []; if (!bS) o.t = tS.t; }
  if (bS && tS) { const x = phanLoai(bS.t, tS.t); o.x = x[0]; o.g = x[1]; if (x[0] !== 'Khớp') o.t = tS.t; }
  return o;
}
const tuTinh = (o) => ({ bS: (o.s === 'BT' || o.s === 'B') ? { t: o.b, n: o.n, bk: o.bk } : null, tS: (o.s === 'BT' || o.s === 'T') ? { t: o.t || o.b, a: o.ta, l: o.tl, k: o.k } : null });
let _c = null, _t = 0;
async function doc(k) { try { const r = await L._.db().q('SELECT v FROM kv WHERE k=$1', [k]); return r.length ? JSON.parse(r[0].v) : null; } catch (e) { return null; } }
async function nap(force) {
  if (!force && _c && Date.now() - _t < 60000) return _c;
  const b5 = (await doc('dmup:b5')) || {}, t85 = (await doc('dmup:t85')) || {};
  const out = Object.assign({}, STATIC);
  new Set(Object.keys(b5).concat(Object.keys(t85))).forEach((ma) => {
    const st = STATIC[ma] ? tuTinh(STATIC[ma]) : { bS: null, tS: null };
    const bS = b5[ma] || st.bS, tS = t85[ma] ? { t: t85[ma].t, a: t85[ma].a, l: t85[ma].l, k: t85[ma].k } : st.tS;
    if (bS || tS) out[ma] = entry(bS, tS);
  });
  _c = out; _t = Date.now(); return out;
}
module.exports = { nap, ss: () => _c || STATIC, phanLoai, dice, STATIC, _reset: () => { _c = null; } };
