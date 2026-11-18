'use strict';
// Tải file B501 / TT85 bất kỳ lúc nào để phát hiện dự án mới phát sinh; đơn vị chọn thêm vào danh mục hay không.
const L = require('./logic');
const M = require('./danhmuc');
const DOI = require('./dmdoichieu');
const { docXlsx } = require('./xlsxread');
const { E, db } = L._;
const nf = (x) => String(x == null ? '' : x).normalize('NFC');
const isn = (x) => typeof x === 'number' && isFinite(x) && Math.abs(x) > 1e-9;
const luuKv = (k, v) => db().q('INSERT INTO kv (k,v) VALUES ($1,$2) ON CONFLICT (k) DO UPDATE SET v=excluded.v', [k, v]);
async function doc(k, mac) { try { const r = await db().q('SELECT v FROM kv WHERE k=$1', [k]); return r.length ? JSON.parse(r[0].v) : mac; } catch (e) { return mac; } }
const DAU = (rows, n) => nf(rows.slice(0, n).map((r) => (r || []).filter((x) => x != null).join(' ')).join(' '));

function docT85(rows) {
  let h = -1, cMa = -1; for (let i = 0; i < Math.min(rows.length, 15) && h < 0; i++) (rows[i] || []).forEach((x, j) => { if (h < 0 && /^Mã\s*dự\s*án\s*đầu\s*tư/i.test(nf(x).trim())) { h = i; cMa = j; } });
  if (h < 0) return null;
  const hd = rows[h], cNd = hd.findIndex((x) => /^Nội dung/i.test(nf(x).trim())), cKb = hd.findIndex((x) => /^Địa điểm mở/i.test(nf(x).trim()));
  const map = {};
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] || [], ma = nf(r[cMa]).trim(); if (!/^\d{7}$/.test(ma)) continue;
    const o = map[ma] = map[ma] || { t: nf(r[cNd]).replace(/^\d{7}\s*-\s*/, '').trim(), a: 0, l: 0, k: [] };
    for (let j = cMa + 6; j <= cMa + 18; j++) if (isn(r[j])) o.a = 1;
    [cMa + 2, cMa + 3, cMa + 4, cMa + 5, cMa + 19].forEach((j) => { if (isn(r[j])) o.l = 1; });
    const k = nf(r[cKb]).trim(); if (/^\d{4}$/.test(k) && o.k.indexOf(k) < 0) o.k.push(k);
  }
  return { loai: 'TT85', map };
}
function docB501(rows) {
  if (!/TÌNH HÌNH SỬ DỤNG DỰ TOÁN CHI ĐẦU TƯ/i.test(DAU(rows, 12))) return null;
  let cKb = 6; for (let i = 0; i < 14; i++) (rows[i] || []).forEach((x, j) => { if (/^Mã kho bạc/i.test(nf(x).trim())) cKb = j; });
  const cap = /CẤP PHƯỜNG\/XÃ|CẤP XÃ/i.test(DAU(rows, 12)) ? 'xã' : 'tỉnh', map = {}; let cur = null;
  for (let i = 10; i < rows.length; i++) {
    const r = rows[i] || [], m = /^(\d{7})\.(.*)$/s.exec(nf(r[1]).trim());
    if (m) { cur = map[m[1]] = { t: m[2].trim(), n: 0, bk: [], ct: [] }; for (let j = cKb + 1; j <= cKb + 17; j++) if (isn(r[j])) cur.n = 1; continue; }
    const k = nf(r[cKb]).trim(); if (cur && /^\d{4}$/.test(k) && cur.bk.indexOf(k) < 0) cur.bk.push(k);
    const ct = nf(r[5]).trim(); if (cur && /^\d{5}$/.test(ct) && ct.slice(1) !== '0000' && cur.ct.indexOf(ct.slice(1)) < 0) cur.ct.push(ct.slice(1));
  }
  return { loai: 'B501', cap, map };
}
function phanTich(b64) {
  b64 = String(b64 || ''); if (!b64) throw E('Chưa chọn file.'); if (b64.length > 6e6) throw E('File quá lớn (tối đa khoảng 4 MB mỗi file).');
  let rows; try { rows = docXlsx(Buffer.from(b64, 'base64'), /BaoCao|Sheet1/i); } catch (e) { throw E(e.message || 'Không đọc được file Excel.'); }
  const r = docB501(rows) || docT85(rows); if (!r) throw E('Không nhận ra file: cần B501 (Tình hình sử dụng dự toán chi đầu tư XDCB) hoặc TT85 (Báo cáo quyết toán – có cột "Mã dự án đầu tư").');
  if (!Object.keys(r.map).length) throw E('Không đọc được dự án nào trong file.');
  return r;
}
const coSL = (o) => (o.s === 'B' ? o.n : (o.s === 'T' ? (o.ta || o.tl) : (o.n || o.ta || o.tl)));
function kbCua(o) { const a = new Set((o.k || []).concat(o.bk || [])); return a.size === 1 ? (M._MA_PGD[[...a][0]] || '') : ''; }

async function tai(token, tenFile, b64) {
  const p = await M._pv(token); if (p.kbnn) throw E('Chỉ Chuyên viên THBC được tải file B501/TT85.');
  const r = phanTich(b64), key = r.loai === 'TT85' ? 'dmup:t85' : 'dmup:b5';
  const cu = await doc(key, {}); Object.assign(cu, r.map); await luuKv(key, JSON.stringify(cu));
  const meta = await doc('dmup:meta', []); meta.unshift({ ten: String(tenFile || '').substring(0, 100), loai: r.loai + (r.cap ? ' ngân sách ' + r.cap : ''), so: Object.keys(r.map).length, luc: Date.now(), nguoi: p.ten }); await luuKv('dmup:meta', JSON.stringify(meta.slice(0, 8)));
  await DOI.nap(true);
  let ctLa = [], ctMoi = 0;
  if (r.loai === 'B501') {   // dò mã CTMT trong B501, đối chiếu mục lục ngân sách
    const ct = await doc('dmup:ct', {}), truoc = Object.keys(await M.ctmtGop()).length;
    Object.keys(r.map).forEach((ma) => { const c = r.map[ma].ct || []; if (c.length) ct[ma] = [...new Set((ct[ma] || []).concat(c))].sort(); });
    await luuKv('dmup:ct', JSON.stringify(ct)); const G = await M.ctmtGop(); ctMoi = Object.keys(G).length - truoc;
    ctLa = Object.keys(r.map).filter((ma) => (G[ma] || {}).x && G[ma].x.length).map((ma) => ({ ma, ten: r.map[ma].t.substring(0, 90), x: G[ma].x }));
    M._cbReset();
  }
  return { loai: r.loai + (r.cap ? ' ngân sách ' + r.cap : ''), so: Object.keys(r.map).length, ctMoi, ctLa: ctLa.slice(0, 50), soCtLa: ctLa.length };
}
async function ungVien(p) {
  const ss = await DOI.nap(), db0 = new Set(((await M._banDo()) || []).map((x) => x[0])), bo = new Set(await doc('dmup:bo', []));
  const rows = []; let soBo = 0;
  Object.keys(ss).forEach((ma) => {
    const o = ss[ma]; if (db0.has(ma) || !coSL(o)) return; if (bo.has(ma)) { soBo++; return; }
    const kb = kbCua(o); if (p.kbnn && kb !== p.kbnn) return;
    rows.push({ ma, ten: o.b || o.t || '', nguon: o.s === 'BT' ? 'Có ở cả B501 và TT85' : (o.s === 'B' ? 'Chỉ có ở B501' : 'Chỉ có ở TT85'), kbnn: kb, tenT: o.s === 'BT' && o.x !== 'Khớp' ? o.t : '' });
  });
  rows.sort((a, b) => a.nguon.localeCompare(b.nguon) || a.ma.localeCompare(b.ma));
  return { rows, soBo };
}
async function ds(token) {
  const p = await M._pv(token), u = await ungVien(p);
  return { tai: !p.kbnn, tong: u.rows.length, soBo: u.soBo, rows: u.rows.slice(0, 1500), meta: await doc('dmup:meta', []) };
}
async function quyet(token, mas, them) {
  const p = await M._pv(token); mas = (Array.isArray(mas) ? mas : []).map((x) => String(x)).filter((x) => /^\d{7}$/.test(x));
  if (!mas.length) throw E('Chưa chọn dự án nào.');
  const u = await ungVien(p), dich = new Set(mas), cho = u.rows.filter((x) => dich.has(x.ma));
  if (!cho.length) throw E('Các dự án đã chọn không còn trong danh sách (có thể đã được xử lý).');
  if (them) {
    const r = await M._rpc('cv_dm_them_moi', { p_rows: cho.map((x) => ({ m: x.ma, t: x.ten, k: x.kbnn || p.kbnn || '' })), p_who: p.ten + ' (thêm từ B501/TT85)' });
    M._cbReset(); return { them: (r && r.them) || 0 };
  }
  const bo = new Set(await doc('dmup:bo', [])); cho.forEach((x) => bo.add(x.ma)); await luuKv('dmup:bo', JSON.stringify([...bo]));
  return { bo: cho.length };
}
async function khoiPhuc(token) {
  const p = await M._pv(token); if (p.kbnn) throw E('Chỉ Chuyên viên THBC được khôi phục.');
  const n = (await doc('dmup:bo', [])).length; await luuKv('dmup:bo', '[]'); return { khoiPhuc: n };
}
module.exports = { tai, ds, quyet, khoiPhuc, phanTich, _docT85: docT85, _docB501: docB501 };
