'use strict';
// BC đánh giá KPI: số liệu giải ngân lũy kế "đến ngày dd/mm" gửi Sở Tài chính (biểu 9 cột: tổng / kéo dài / năm 2026 × tổng, thanh toán KLHT, tạm ứng).
// Quy trình: Chuyên viên THBC tải bảng đối chiếu THBC theo mốc ngày → Trưởng phòng PGD xem và xác nhận;
// dòng muốn ghi nhận khác THBC: nhập số thực tế kèm lý do (bắt buộc) → số gửi đi = số phòng ghi nhận, dòng chưa xác nhận lấy số THBC.
// Chỉ 4 ô chi tiết được lưu: [kéo dài: thanh toán KLHT, tạm ứng] và [năm 2026: thanh toán KLHT, tạm ứng]; các ô tổng tự cộng. Đơn vị: triệu đồng.
const L = require('./logic');
const C = require('./common');
const BT = require('./bieutong');
const RG = require('./rutgon');
const DM = require('./dmcdt.json');
const bulk = require('./bulk');
const { docXlsx } = require('./xlsxread');
const { E, db, nk } = L._;
const so = (x) => (typeof x === 'number' && isFinite(x) ? x : null);
const r3 = (x) => Math.round((Number(x) || 0) * 1000) / 1000;
const F4 = ['kd_tt', 'kd_tu', 'n_tt', 'n_tu'];
const ngayNhan = (n) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(n || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : String(n || ''); };
const hopLe = (n) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(n || '')); if (!m) return false; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]; };

function phanTich(rows) {
  const dau = rows.slice(0, 12).map((r) => r.filter((x) => x != null).join(' ')).join(' ');
  let h = -1; for (let i = 0; i < Math.min(rows.length, 15); i++) { const t = rows[i].join(' ').toLowerCase(); if (/chủ đầu tư/.test(t) && /nơi giao dịch/.test(t)) { h = i; break; } }
  if (h < 0) throw E('File không đúng mẫu KPI: cần bảng có cột "Chủ đầu tư / đơn vị / xã, phường" và "KBNN nơi giao dịch".');
  const tt = [], tu = [];
  rows.slice(h, h + 4).forEach((r) => r.forEach((x, j) => { const s = String(x == null ? '' : x).toLowerCase().trim(); if (/^thanh toán\s*klht/.test(s)) tt.push(j); else if (/^tạm ứng/.test(s)) tu.push(j); }));
  tt.sort((a, b) => a - b); tu.sort((a, b) => a - b);
  if (tt.length < 3 || tu.length < 3) throw E('Không thấy đủ các cột "Thanh toán KLHT" và "Tạm ứng" của nhóm Tổng cộng, Kéo dài, Năm 2026. File có thể không phải mẫu đối chiếu KPI.');
  const cot = [tt[1], tu[1], tt[2], tu[2]];
  const dv = (/Đơn vị\s*(?:tính)?\s*:\s*([^\s,;]+(?:\s+đồng)?)/i.exec(dau) || [])[1] || 'triệu đồng', dl = dv.toLowerCase();
  const heSo = /^triệu/.test(dl) ? 1 : (/^nghìn|^ngàn/.test(dl) ? 1e-3 : (/^đồng/.test(dl) ? 1e-6 : 0));
  if (!heSo) throw E('Không nhận ra đơn vị tính (' + dv + ').');
  const out = [], loi = []; let ten = '';
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i], b = r[1] == null ? '' : String(r[1]).trim(), c = r[2] == null ? '' : String(r[2]).trim();
    if (!b) continue;
    if (b !== 'Giao dịch tại') ten = b;
    const v = cot.map((j) => so(r[j]));
    if (!c || v.every((x) => x == null)) continue;
    if (!C.DS_PGD.includes(c)) { loi.push('Dòng ' + (i + 1) + ': không nhận ra đơn vị "' + c + '"'); continue; }
    out.push({ khoa: BT.chuan(ten) + '|' + c, ten, pgd: c, v: v.map((x) => (x || 0) * heSo) });
  }
  if (!out.length) throw E('Không đọc được dòng số liệu nào (cần dòng chủ đầu tư có ghi KBNN nơi giao dịch và số liệu).');
  const m = {}; out.forEach((x) => { const e = m[x.khoa] = m[x.khoa] || { khoa: x.khoa, ten: x.ten, pgd: x.pgd, v: [0, 0, 0, 0] }; x.v.forEach((y, k) => { e.v[k] += y; }); });
  return { dong: Object.values(m), loi };
}

const dsMoc = async () => db().q('SELECT id,ngay,han,file,luc,nguoi,chot FROM kpi_moc ORDER BY ngay DESC');
async function chonMoc(id) {
  const ds = await dsMoc(); if (!ds.length) return null;
  const m = ds.find((x) => x.id === id) || ds[0]; return m;
}
const vaiTro = (q) => (q.vt === 'PGD' ? (q.tk.cv || 'ALL') : 'TH');

async function taiThbc(token, ngay, han, tenFile, b64) {
  const q = await L.quyen(token); if (q.vt === 'PGD') throw E('Chỉ Chuyên viên THBC (hoặc cán bộ Nghiệp vụ 2, tổng hợp) được tải bảng đối chiếu KPI.');
  ngay = String(ngay || '').trim(); if (!hopLe(ngay)) throw E('Chọn ngày mốc báo cáo (đến ngày).');
  b64 = String(b64 || ''); if (!b64) throw E('Chưa chọn file.'); if (b64.length > 4e6) throw E('File quá lớn (tối đa khoảng 3 MB).');
  const cu = (await db().q('SELECT chot FROM kpi_moc WHERE id=$1', [ngay]))[0]; if (cu && cu.chot) throw E('Mốc ' + ngayNhan(ngay) + ' đã chốt, không tải lại được. Mở lại mốc trước.');
  let rows; try { rows = docXlsx(Buffer.from(b64, 'base64'), /kpi/i); } catch (e) { throw E(e.message || 'Không đọc được file Excel.'); }
  const kq = phanTich(rows), cuRows = await db().q('SELECT khoa,pgd,kd_tt,kd_tu,n_tt,n_tu FROM kpi_thbc WHERE moc=$1', [ngay]), cm = {}; cuRows.forEach((x) => { cm[x.khoa] = x; });
  const doi = new Set(); kq.dong.forEach((x) => { const o = cm[x.khoa]; if (!o || F4.some((f, k) => Math.abs((Number(o[f]) || 0) - x.v[k]) > 0.0005)) doi.add(x.pgd); });
  cuRows.forEach((o) => { if (!kq.dong.some((x) => x.khoa === o.khoa)) doi.add(o.pgd); });
  const meta = { file: String(tenFile || '').substring(0, 120), luc: Date.now(), nguoi: q.ten, han: String(han || '').substring(0, 16) };
  await db().tx(async (t) => {
    await t.q('DELETE FROM kpi_thbc WHERE moc=$1', [ngay]);
    await bulk(t, 'kpi_thbc', ['moc', 'khoa', 'ten', 'pgd', ...F4], kq.dong.map((x) => [ngay, x.khoa, x.ten, x.pgd, ...x.v.map(r3)]));
    // số THBC của phòng nào thay đổi → phòng đó phải xác nhận lại; ghi nhận trùng THBC mới thì bỏ
    for (const p of doi) await t.q('DELETE FROM kpi_xn WHERE moc=$1 AND pgd=$2', [ngay, p]);
    const dc = await t.q('SELECT khoa,kd_tt,kd_tu,n_tt,n_tu FROM kpi_dc WHERE moc=$1', [ngay]);
    for (const d of dc) { const x = kq.dong.find((y) => y.khoa === d.khoa); if (!x || F4.every((f, k) => Math.abs((Number(d[f]) || 0) - x.v[k]) <= 0.0005)) await t.q('DELETE FROM kpi_dc WHERE moc=$1 AND khoa=$2', [ngay, d.khoa]); }
    await t.q('INSERT INTO kpi_moc (id,ngay,han,file,luc,nguoi,chot) VALUES ($1,$2,$3,$4,$5,$6,NULL) ON CONFLICT (id) DO UPDATE SET han=excluded.han, file=excluded.file, luc=excluded.luc, nguoi=excluded.nguoi', [ngay, ngay, meta.han, meta.file, meta.luc, meta.nguoi]);
  });
  await nk(q.ten, 'Tải bảng đối chiếu KPI', ngay, meta.file, kq.dong.length + ' dòng');
  const r = await lay(token, ngay); r.canXacNhanLai = cuRows.length ? [...doi] : []; return r;
}
async function xoaMoc(token, id) {
  const q = await L.quyen(token); if (q.vt === 'PGD') throw E('Không có quyền.');
  const m = (await db().q('SELECT chot FROM kpi_moc WHERE id=$1', [id]))[0]; if (!m) throw E('Không có mốc này.'); if (m.chot) throw E('Mốc đã chốt, hãy mở lại mốc trước khi xóa.');
  await db().tx(async (t) => { for (const b of ['kpi_thbc', 'kpi_dc', 'kpi_xn']) await t.q('DELETE FROM ' + b + ' WHERE moc=$1', [id]); await t.q('DELETE FROM kpi_moc WHERE id=$1', [id]); });
  await nk(q.ten, 'Xóa mốc KPI', id, '', ''); return dsKy(token);
}
async function chotMoc(token, id, chot) {
  const q = await L.quyen(token); if (q.vt === 'PGD') throw E('Chỉ Chuyên viên THBC chốt hoặc mở lại mốc.');
  const m = (await db().q('SELECT id FROM kpi_moc WHERE id=$1', [id]))[0]; if (!m) throw E('Không có mốc này.');
  await db().q('UPDATE kpi_moc SET chot=$1 WHERE id=$2', [chot ? Date.now() : null, id]);
  await nk(q.ten, chot ? 'Chốt mốc KPI' : 'Mở lại mốc KPI', id, '', ''); return lay(token, id);
}
// Danh sách mốc cho khung chọn + tóm tắt theo tài khoản
async function dsKy(token) {
  const q = await L.quyen(token), ds = await dsMoc(), out = [];
  for (const m of ds) {
    const xn = await db().q('SELECT pgd FROM kpi_xn WHERE moc=$1', [m.id]), co = await db().q('SELECT DISTINCT pgd FROM kpi_thbc WHERE moc=$1', [m.id]);
    const dc = await db().q('SELECT t.pgd AS pgd, COUNT(*) AS n FROM kpi_dc d JOIN kpi_thbc t ON t.moc=d.moc AND t.khoa=d.khoa WHERE d.moc=$1 GROUP BY t.pgd', [m.id]);
    const x = { id: m.id, nhan: ngayNhan(m.ngay), han: m.han, chot: !!m.chot, file: m.file, luc: C.dinhDang(m.luc), nguoi: m.nguoi, soPhong: co.length, daXn: xn.length, dieuChinh: dc.reduce((s, y) => s + Number(y.n), 0) };
    if (q.vt === 'PGD') { x.coSo = co.some((y) => y.pgd === q.pgd); x.toiXn = xn.some((y) => y.pgd === q.pgd); }
    out.push(x);
  }
  return { ds: out, vt: q.vt, cv: vaiTro(q) };
}

// Dựng cây theo danh mục chủ đầu tư với số THBC (t) và số ghi nhận (e); chỉ giữ phần thuộc phạm vi tài khoản
async function lay(token, id, xem) {
  const q = await L.quyen(token, xem), m = await chonMoc(id);
  if (!m) return { co: false, ds: (await dsKy(token)).ds, vt: q.vt, cv: vaiTro(q) };
  const sc = new Set(q.scope), full = q.scope.length >= C.DS_PGD.length && q.vt !== 'PGD';
  const th = await db().q('SELECT khoa,ten,pgd,kd_tt,kd_tu,n_tt,n_tu FROM kpi_thbc WHERE moc=$1', [m.id]);
  const dc = await db().q('SELECT khoa,kd_tt,kd_tu,n_tt,n_tu,ly_do,nguoi,ts FROM kpi_dc WHERE moc=$1', [m.id]);
  const xn = await db().q('SELECT pgd,nguoi,hoten,ts FROM kpi_xn WHERE moc=$1', [m.id]);
  const T = {}, D = {}; th.forEach((x) => { T[x.khoa] = x; }); dc.forEach((x) => { D[x.khoa] = x; });
  const byRow = {}; DM.forEach((o) => { byRow[o.row] = o; });
  const dung = new Set(), memo = {}, N = (x) => Number(x) || 0;
  const leaf = (x, ten, pgd) => {
    const t = [x.kd_tt, x.kd_tu, x.n_tt, x.n_tu].map(N), d = D[x.khoa], e = d ? [d.kd_tt, d.kd_tu, d.n_tt, d.n_tu].map(N) : t;
    return { n: 1, nd: d ? 1 : 0, t0: t[0], t1: t[1], t2: t[2], t3: t[3], e0: e[0], e1: e[1], e2: e[2], e3: e[3], khoa: x.khoa, ly: d ? d.ly_do : undefined, ten, pgd };
  };
  const KEYS = ['n', 'nd', 't0', 't1', 't2', 't3', 'e0', 'e1', 'e2', 'e3'];
  const zero = () => { const o = {}; KEYS.forEach((k) => { o[k] = 0; }); return o; };
  const sum = (o) => {
    if (memo[o.row]) return memo[o.row];
    let r;
    if (o.kids) { r = zero(); o.kids.forEach((k) => { const s = sum(byRow[k]); KEYS.forEach((f) => { r[f] += s[f]; }); }); }
    else { const k = BT.chuan(o.ten) + '|' + o.c; if (!sc.has(o.c) || !T[k]) r = zero(); else { dung.add(k); r = leaf(T[k], o.ten, o.c); } }
    return (memo[o.row] = r);
  };
  const lv = {}; const dq = (o, d) => { lv[o.row] = d; (o.kids || []).forEach((k) => dq(byRow[k], d + 1)); }; dq(DM.find((o) => o.b === 'TỔNG CỘNG'), -1);
  let rows = DM.map((o) => { const s = o.b === 'TỔNG CỘNG' ? null : sum(o); return Object.assign({ a: o.a, b: o.b, c: o.c, lv: o.b === 'TỔNG CỘNG' ? 0 : lv[o.row], k: o.b === 'TỔNG CỘNG' ? 'tot' : (lv[o.row] === 0 && !/^\d/.test(o.a) ? 'khoi' : (o.kids ? 'nhom' : 'row')) }, s || {}); });
  const thua = th.filter((x) => sc.has(x.pgd) && !dung.has(x.khoa)).map((x) => Object.assign({ a: '', b: x.ten, c: x.pgd, lv: 1, k: 'row', st: 'ind', thua: 1 }, leaf(x, x.ten, x.pgd)));
  const tot = rows.find((r) => r.k === 'tot'); KEYS.forEach((k) => { tot[k] = rows.filter((r) => r.k === 'khoi').reduce((s, r) => s + (r[k] || 0), 0) + thua.reduce((s, r) => s + r[k], 0); });
  if (full) { RG.kieu(rows); if (thua.length) { const kr = { a: '', b: 'CHƯA CÓ TRONG DANH MỤC', c: '', lv: 0, k: 'khoi' }; KEYS.forEach((k) => { kr[k] = thua.reduce((s, r) => s + r[k], 0); }); rows.push(kr, ...thua); } }
  else rows = RG.rutGon(rows, thua, { leafOk: (x) => x.k === 'row' && x.n > 0, sum: KEYS, fix: () => {} });
  // trạng thái từng phòng trong phạm vi
  const xm = {}; xn.forEach((x) => { xm[x.pgd] = x; });
  const ds = C.DS_PGD.filter((p) => sc.has(p)).map((p) => {
    const ks = th.filter((x) => x.pgd === p); if (!ks.length) return { pgd: p, tt: 'khong' };
    const nd = ks.filter((x) => D[x.khoa]).length, x = xm[p];
    let tn = [0, 0, 0, 0], e = [0, 0, 0, 0]; ks.forEach((k) => { const t = [k.kd_tt, k.kd_tu, k.n_tt, k.n_tu].map(N), d = D[k.khoa], v = d ? [d.kd_tt, d.kd_tu, d.n_tt, d.n_tu].map(N) : t; for (let i = 0; i < 4; i++) { tn[i] += t[i]; e[i] += v[i]; } });
    return { pgd: p, tt: x ? (nd ? 'xn_dc' : 'xn') : (nd ? 'nhap' : 'cho'), nd, soDong: ks.length, nguoi: x && (x.hoten || x.nguoi), luc: x && C.dinhDang(x.ts), tong: r3(e.reduce((s, y) => s + y, 0)), tongThbc: r3(tn.reduce((s, y) => s + y, 0)) };
  });
  const cv = vaiTro(q), mo = !m.chot, pg = q.vt === 'PGD' ? q.pgd : null, mine = pg && ds.find((d) => d.pgd === pg);
  const khoi = rows.filter((r) => r.k === 'khoi' && r.b !== 'CHƯA CÓ TRONG DANH MỤC');
  const sm = (r) => r ? { tong: r.e0 + r.e1 + r.e2 + r.e3, kd: r.e0 + r.e1, n: r.e2 + r.e3 } : null;
  return {
    co: true, moc: { id: m.id, nhan: ngayNhan(m.ngay), han: m.han, file: m.file, luc: C.dinhDang(m.luc), nguoi: m.nguoi, chot: !!m.chot }, ds, rows, full, pgd: pg, vt: q.vt, cv, thua: thua.length,
    quyen: { sua: !!pg && mo && ['LAP', 'TP', 'ALL'].includes(cv) && !!mine && !['xn', 'xn_dc'].includes(mine.tt), xacNhan: !!pg && mo && ['TP', 'ALL'].includes(cv) && !!mine && !['xn', 'xn_dc'].includes(mine.tt), moLai: !!pg && mo && ['TP', 'ALL'].includes(cv) && !!mine && ['xn', 'xn_dc'].includes(mine.tt), chot: q.vt !== 'PGD' },
    vb: full ? { tong: sm(tot), tinh: sm(khoi[0]), xa: sm(khoi[1]) } : undefined, ds2: (await dsKy(token)).ds,
  };
}
async function luuDc(token, id, items) {
  const q = await L.quyen(token); if (q.vt !== 'PGD') throw E('Chỉ phòng giao dịch ghi nhận số khác THBC.');
  if (!['LAP', 'TP', undefined, ''].includes(q.tk.cv)) throw E('Kế toán trưởng chỉ xem; người lập hoặc Trưởng phòng nhập số điều chỉnh.');
  const m = await chonMoc(id); if (!m || m.id !== id) throw E('Không có mốc báo cáo này.'); if (m.chot) throw E('Mốc đã chốt.');
  if ((await db().q('SELECT 1 AS x FROM kpi_xn WHERE moc=$1 AND pgd=$2', [m.id, q.pgd])).length) throw E('Phòng đã xác nhận. Trưởng phòng bấm "Mở lại để sửa" trước khi thay đổi.');
  const th = await db().q('SELECT khoa,ten,kd_tt,kd_tu,n_tt,n_tu FROM kpi_thbc WHERE moc=$1 AND pgd=$2', [m.id, q.pgd]), T = {}; th.forEach((x) => { T[x.khoa] = x; });
  const loi = [], ghi = [];
  (Array.isArray(items) ? items : []).forEach((it) => {
    const t = T[it && it.khoa]; if (!t) { loi.push('Dòng không thuộc phòng: ' + String(it && it.khoa).substring(0, 40)); return; }
    if (it.v == null) { ghi.push({ khoa: t.khoa, xoa: true }); return; }
    const v = (Array.isArray(it.v) ? it.v : []).map((x) => (x === '' || x == null ? NaN : Number(x)));
    if (v.length !== 4 || v.some((x) => !isFinite(x) || x < 0)) { loi.push(t.ten + ': số liệu không hợp lệ (cần 4 số không âm).'); return; }
    const gt = [t.kd_tt, t.kd_tu, t.n_tt, t.n_tu].map(Number);
    if (v.every((x, i) => Math.abs(x - gt[i]) <= 0.0005)) { ghi.push({ khoa: t.khoa, xoa: true }); return; }   // trùng THBC: không còn là điều chỉnh
    const ly = String(it.ly || '').replace(/\s+/g, ' ').trim().substring(0, 300);
    if (ly.length < 3) { loi.push(t.ten + ': bắt buộc ghi lý do khi ghi nhận số khác THBC.'); return; }
    ghi.push({ khoa: t.khoa, v: v.map(r3), ly });
  });
  if (loi.length) throw E(loi.slice(0, 6).join('\n'));
  await db().tx(async (t) => { for (const g of ghi) { await t.q('DELETE FROM kpi_dc WHERE moc=$1 AND khoa=$2', [m.id, g.khoa]); if (!g.xoa) await t.q('INSERT INTO kpi_dc (moc,khoa,kd_tt,kd_tu,n_tt,n_tu,ly_do,nguoi,ts) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [m.id, g.khoa, ...g.v, g.ly, q.ten, Date.now()]); } });
  await nk(q.ten, 'Lưu số ghi nhận KPI', m.id, q.pgd, ghi.length + ' dòng');
  return lay(token, m.id);
}
async function xacNhan(token, id) {
  const q = await L.quyen(token); if (q.vt !== 'PGD') throw E('Chỉ Trưởng phòng của phòng giao dịch xác nhận số liệu.');
  if (!['TP', undefined, ''].includes(q.tk.cv)) throw E('Chỉ Trưởng phòng (lãnh đạo phòng) mới xác nhận số liệu KPI.');
  const m = await chonMoc(id); if (!m || m.id !== id) throw E('Không có mốc báo cáo này.'); if (m.chot) throw E('Mốc đã chốt.');
  if (!(await db().q('SELECT 1 AS x FROM kpi_thbc WHERE moc=$1 AND pgd=$2', [m.id, q.pgd])).length) throw E('Phòng không có dòng số liệu nào ở mốc này.');
  const hoten = (await db().q('SELECT hoten FROM accounts WHERE ten=$1', [q.ten]))[0];
  await db().q('INSERT INTO kpi_xn (moc,pgd,nguoi,hoten,ts) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (moc,pgd) DO UPDATE SET nguoi=excluded.nguoi, hoten=excluded.hoten, ts=excluded.ts', [m.id, q.pgd, q.ten, (hoten && hoten.hoten) || '', Date.now()]);
  await nk(q.ten, 'Xác nhận số liệu KPI', m.id, q.pgd, ''); return lay(token, m.id);
}
async function moLai(token, id, pgd) {
  const q = await L.quyen(token), m = await chonMoc(id); if (!m || m.id !== id) throw E('Không có mốc báo cáo này.'); if (m.chot) throw E('Mốc đã chốt.');
  let p = pgd;
  if (q.vt === 'PGD') { if (!['TP', undefined, ''].includes(q.tk.cv)) throw E('Chỉ Trưởng phòng mở lại để sửa.'); p = q.pgd; }
  else if (!C.DS_PGD.includes(p)) throw E('Chọn phòng cần mở lại.');
  await db().q('DELETE FROM kpi_xn WHERE moc=$1 AND pgd=$2', [m.id, p]); await nk(q.ten, 'Mở lại xác nhận KPI', m.id, p, ''); return lay(token, m.id, q.vt === 'PGD' ? undefined : p);
}
module.exports = { taiThbc, xoaMoc, chotMoc, dsKy, lay, luuDc, xacNhan, moLai, ngayNhan, _: { phanTich, F4 } };
