'use strict';
// Số liệu THBC theo danh mục chủ đầu tư: file Excel cùng mẫu "Biểu tổng" (STT | Chủ đầu tư | KBNN nơi giao dịch | lũy kế | trong tháng | ghi chú).
// Ghép với số liệu web theo (tên chủ đầu tư đã chuẩn hóa + PGD giao dịch). Đơn vị lưu: triệu đồng.
const L = require('./logic');
const C = require('./common');
const bulk = require('./bulk');
const BT = require('./bieutong');
const { docXlsx } = require('./xlsxread');
const { E, db, nap, docKy, chonKy, nk } = L._;
const so = (x) => (typeof x === 'number' && isFinite(x) ? x : null);

function phanTich(rows) {
  const dau = rows.slice(0, 12).map((r) => r.filter((x) => x != null).join(' ')).join(' ');
  let h = -1; for (let i = 0; i < Math.min(rows.length, 15); i++) { const t = rows[i].join(' ').toLowerCase(); if (/chủ đầu tư/.test(t) && /nơi giao dịch/.test(t)) { h = i; break; } }
  if (h < 0) throw E('File không đúng mẫu: cần bảng có cột "Chủ đầu tư / đơn vị / xã, phường" và "KBNN nơi giao dịch" (mẫu Biểu tổng theo danh mục chủ đầu tư).');
  const hd = rows[h].map((x) => String(x == null ? '' : x).toLowerCase());
  const cLk = hd.findIndex((x) => /lũy kế|luỹ kế/.test(x)), cTh = hd.findIndex((x) => /trong tháng/.test(x));
  if (cLk < 0 || cTh < 0) throw E('Không thấy cột "lũy kế" hoặc "trong tháng" ở dòng tiêu đề bảng.');
  const dv = (/Đơn vị\s*(?:tính)?\s*:\s*([^\s,;]+(?:\s+đồng)?)/i.exec(dau) || [])[1] || 'triệu đồng', dl = dv.toLowerCase();
  const heSo = /^triệu/.test(dl) ? 1 : (/^nghìn|^ngàn/.test(dl) ? 1e-3 : (/^đồng/.test(dl) ? 1e-6 : 0));
  if (!heSo) throw E('Không nhận ra đơn vị tính (' + dv + ').');
  const out = [], loi = []; let ten = '';
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i], b = r[1] == null ? '' : String(r[1]).trim(), c = r[2] == null ? '' : String(r[2]).trim();
    if (!b) continue;
    if (b !== 'Giao dịch tại') ten = b;
    const lk = so(r[cLk]), th = so(r[cTh]);
    if (!c || (lk == null && th == null)) continue;      // dòng tổng (công thức) hoặc dòng nhóm
    if (!C.DS_PGD.includes(c)) { loi.push('Dòng ' + (i + 1) + ': không nhận ra đơn vị "' + c + '"'); continue; }
    out.push({ khoa: BT.chuan(ten) + '|' + c, ten, pgd: c, lk: (lk || 0) * heSo, th: (th || 0) * heSo });
  }
  if (!out.length) throw E('Không đọc được dòng số liệu nào (cần dòng chủ đầu tư có ghi KBNN nơi giao dịch và số liệu).');
  return { out, loi };
}
async function nhap(token, tenFile, b64) {
  const q = await L.quyen(token); if (q.vt === 'PGD') throw E('Chỉ cán bộ Nghiệp vụ 2 hoặc tổng hợp được tải file THBC.');
  b64 = String(b64 || ''); if (!b64) throw E('Chưa chọn file.'); if (b64.length > 4e6) throw E('File quá lớn (tối đa khoảng 3 MB).');
  let rows; try { rows = docXlsx(Buffer.from(b64, 'base64')); } catch (e) { throw E(e.message || 'Không đọc được file Excel.'); }
  const kq = phanTich(rows), k = await docKy(), m = {};
  kq.out.forEach((x) => { const e = m[x.khoa] = m[x.khoa] || { ...x, lk: 0, th: 0 }; e.lk += x.lk; e.th += x.th; });
  const dem = Object.keys(m).length, khop = kq.out.length;
  const meta = { file: String(tenFile || '').substring(0, 120), luc: Date.now(), nguoi: q.ten, dong: dem, loi: kq.loi.slice(0, 10) };
  await db().tx(async (t) => {
    await t.q('DELETE FROM thbc_cdt WHERE ky=$1', [k.ky]);
    await bulk(t, 'thbc_cdt', ['ky', 'khoa', 'ten', 'pgd', 'lk', 'th'], Object.values(m).map((x) => [k.ky, x.khoa, x.ten, x.pgd, x.lk, x.th]));
    await t.q('INSERT INTO kv (k,v) VALUES ($1,$2) ON CONFLICT (k) DO UPDATE SET v=excluded.v', ['thbcc:' + k.ky, JSON.stringify(meta)]);
  });
  await nk(q.ten, 'Tải file THBC (theo chủ đầu tư)', meta.file, '', dem + ' dòng');
  void khop; return BT.bieuTong(token);
}
async function xoa(token) {
  const q = await L.quyen(token); if (q.vt === 'PGD') throw E('Không có quyền.');
  const k = await docKy();
  await db().tx(async (t) => { await t.q('DELETE FROM thbc_cdt WHERE ky=$1', [k.ky]); await t.q('DELETE FROM kv WHERE k=$1', ['thbcc:' + k.ky]); });
  await nk(q.ten, 'Xóa file THBC (theo chủ đầu tư)', k.ky, '', '');
  return BT.bieuTong(token);
}
// Cảnh báo cho người nhập: chỉ các chủ đầu tư thuộc phạm vi của tài khoản và đang lệch. PGD chỉ nhận chênh lệch, không nhận số THBC.
async function canhBao(token, kyIn) {
  const q = await L.quyen(token), c = await chonKy(kyIn);
  const tb = await db().q('SELECT khoa,ten,pgd,lk,th FROM thbc_cdt WHERE ky=$1', [c.ky]);
  if (!tb.length) return { co: false, ds: [] };
  const meta = JSON.parse(((await db().q('SELECT v FROM kv WHERE k=$1', ['thbcc:' + c.ky]))[0] || { v: 'null' }).v);
  const all = await nap(c), val = {};
  C.CFG.forEach((b) => all[b.id].forEach((z) => { if (!q.scope.includes(z.d.pgd)) return; const k = BT.chuan(z.d.b) + '|' + z.d.pgd, e = val[k] = val[k] || { ten: z.d.b, pgd: z.d.pgd, lk: 0, th: 0 }; e.lk += Number(z.o[C.TONG_COL[b.id][0]]) || 0; e.th += Number(z.o[C.TONG_COL[b.id][1]]) || 0; }));
  const ref = {}; tb.forEach((x) => { if (q.scope.includes(x.pgd)) ref[x.khoa] = x; });
  const ds = [], tt = (l) => Math.abs(l) <= 1 ? 'khop' : (l < 0 ? 'thap' : 'cao');
  new Set([...Object.keys(val), ...Object.keys(ref)]).forEach((k) => {
    const a = val[k] || { lk: 0, th: 0 }, r = ref[k] || { lk: 0, th: 0 }, dl = a.lk - r.lk, dt = a.th - r.th, x = val[k] || ref[k];
    if (tt(dl) === 'khop') return;
    ds.push({ ten: x.ten, pgd: x.pgd, ttLk: tt(dl), ttTh: tt(dt), dLk: Math.round(dl * 10) / 10, dTh: Math.round(dt * 10) / 10, nhap: q.vt === 'PGD' ? undefined : a.lk, thbc: q.vt === 'PGD' ? undefined : r.lk });
  });
  ds.sort((a, b) => Math.abs(b.dLk) - Math.abs(a.dLk));
  return { co: true, meta, ds, soDong: new Set([...Object.keys(val), ...Object.keys(ref)]).size };
}
module.exports = { nhap, xoa, canhBao, phanTich };
