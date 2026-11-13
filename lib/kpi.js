'use strict';
// BC đánh giá KPI: số liệu giải ngân lũy kế "đến ngày dd/mm" gửi Sở Tài chính (biểu 9 cột: tổng / kéo dài / năm 2026 × tổng, thanh toán KLHT, tạm ứng).
// Quy trình: Chuyên viên THBC tải bảng đối chiếu THBC theo mốc ngày → Trưởng phòng PGD xem và xác nhận;
// dòng muốn ghi nhận khác THBC: Người lập đề nghị điều chỉnh (số thực tế + lý do bắt buộc), lưu tạm rồi gửi phê duyệt → Trưởng phòng phê duyệt → Trưởng phòng xác nhận số điều chỉnh.
// Số gửi đi = số điều chỉnh đã được phê duyệt; dòng khác và phòng chưa xác nhận lấy số THBC. KTT chỉ xem.
// Trạng thái từng phòng: cho (chưa có điều chỉnh) · nhap (người lập đang soạn) · gui (chờ TP phê duyệt) · duyet (đã duyệt, chờ xác nhận) · xn / xn_dc (đã xác nhận).
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
const stP = async (moc, pgd) => ({ n: Number((await db().q('SELECT COUNT(*) AS n FROM kpi_dc d JOIN kpi_thbc t ON t.moc=d.moc AND t.khoa=d.khoa WHERE d.moc=$1 AND t.pgd=$2', [moc, pgd]))[0].n), dcs: (await db().q('SELECT tt FROM kpi_dcs WHERE moc=$1 AND pgd=$2', [moc, pgd]))[0], xn: (await db().q('SELECT 1 AS x FROM kpi_xn WHERE moc=$1 AND pgd=$2', [moc, pgd])).length > 0 });
const vaiTro = (q) => (q.vt === 'PGD' ? (q.tk.cv || 'ALL') : 'TH');

async function taiThbc(token, ngay, han, tenFile, b64) {
  const q = await L.quyen(token); if (q.vt === 'PGD') throw E('Chỉ Chuyên viên THBC (hoặc cán bộ Nghiệp vụ 2, tổng hợp) được tải bảng đối chiếu KPI.');
  ngay = String(ngay || '').trim(); if (!hopLe(ngay)) throw E('Chọn ngày mốc báo cáo (đến ngày).');
  b64 = String(b64 || ''); if (!b64) throw E('Chưa chọn file.'); if (b64.length > 4e6) throw E('File quá lớn (tối đa khoảng 3 MB).');
  const cu = (await db().q('SELECT chot FROM kpi_moc WHERE id=$1', [ngay]))[0]; if (cu && cu.chot) throw E('Mốc ' + ngayNhan(ngay) + ' đã chốt, không tải lại được. Mở lại mốc trước.');
  let rows; try { rows = docXlsx(Buffer.from(b64, 'base64'), /kpi/i); } catch (e) { throw E(e.message || 'Không đọc được file Excel.'); }
  const kq = phanTich(rows);
  return ghiMoc(token, q, ngay, han, String(tenFile || '').substring(0, 120), kq.dong);
}
// Ghi số THBC của một mốc (thay toàn bộ); phòng nào có số thay đổi phải xác nhận lại
async function ghiMoc(token, q, ngay, han, file, dong) {
  const cuRows = await db().q('SELECT khoa,pgd,kd_tt,kd_tu,n_tt,n_tu FROM kpi_thbc WHERE moc=$1', [ngay]), cm = {}; cuRows.forEach((x) => { cm[x.khoa] = x; });
  const kq = { dong };
  const doi = new Set(); kq.dong.forEach((x) => { const o = cm[x.khoa]; if (!o || F4.some((f, k) => Math.abs((Number(o[f]) || 0) - x.v[k]) > 0.0005)) doi.add(x.pgd); });
  cuRows.forEach((o) => { if (!kq.dong.some((x) => x.khoa === o.khoa)) doi.add(o.pgd); });
  const meta = { file, luc: Date.now(), nguoi: q.ten, han: String(han || '').substring(0, 16) };
  await db().tx(async (t) => {
    await t.q('DELETE FROM kpi_thbc WHERE moc=$1', [ngay]);
    await bulk(t, 'kpi_thbc', ['moc', 'khoa', 'ten', 'pgd', ...F4], kq.dong.map((x) => [ngay, x.khoa, x.ten, x.pgd, ...x.v.map(r3)]));
    for (const p of doi) { await t.q('DELETE FROM kpi_xn WHERE moc=$1 AND pgd=$2', [ngay, p]); await t.q('DELETE FROM kpi_dcs WHERE moc=$1 AND pgd=$2', [ngay, p]); }
    const dc = await t.q('SELECT khoa,kd_tt,kd_tu,n_tt,n_tu FROM kpi_dc WHERE moc=$1', [ngay]);
    for (const d of dc) { const x = kq.dong.find((y) => y.khoa === d.khoa); if (!x || F4.every((f, k) => Math.abs((Number(d[f]) || 0) - x.v[k]) <= 0.0005)) await t.q('DELETE FROM kpi_dc WHERE moc=$1 AND khoa=$2', [ngay, d.khoa]); }
    await t.q('INSERT INTO kpi_moc (id,ngay,han,file,luc,nguoi,chot) VALUES ($1,$2,$3,$4,$5,$6,NULL) ON CONFLICT (id) DO UPDATE SET han=excluded.han, file=excluded.file, luc=excluded.luc, nguoi=excluded.nguoi', [ngay, ngay, meta.han, meta.file, meta.luc, meta.nguoi]);
  });
  await nk(q.ten, 'Tải bảng đối chiếu KPI', ngay, meta.file, kq.dong.length + ' dòng');
  const r = await lay(token, ngay); r.canXacNhanLai = cuRows.length ? [...doi] : []; return r;
}
// Tạm thời: lấy số tổng BC 1953 của kỳ hiện tại làm số THBC KPI (BC 1953 chưa tách thanh toán / tạm ứng → ghi hết vào "Thanh toán KLHT")
const KD_COT = { b01: [5], b02: [5], b03a: [5, 6, 7, 8, 9, 10], b03b: [6, 7] }, NAM_COT = { b01: [6], b02: [6], b03b: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18] };
async function taoTuBc1953(token, ngay, han) {
  const q = await L.quyen(token); if (q.vt === 'PGD') throw E('Chỉ Chuyên viên THBC được tạo mốc.');
  ngay = String(ngay || '').trim(); if (!hopLe(ngay)) throw E('Chọn ngày mốc báo cáo (đến ngày).');
  const cu = (await db().q('SELECT chot FROM kpi_moc WHERE id=$1', [ngay]))[0]; if (cu && cu.chot) throw E('Mốc ' + ngayNhan(ngay) + ' đã chốt.');
  const c = await L._.chonKy(''), all = await L._.nap(c), m = {};
  C.CFG.forEach((b) => (all[b.id] || []).forEach((z) => {
    const k = BT.chuan(z.d.b) + '|' + z.d.pgd, e = m[k] = m[k] || { khoa: k, ten: z.d.b, pgd: z.d.pgd, v: [0, 0, 0, 0] };
    (KD_COT[b.id] || []).forEach((col) => { e.v[0] += Number(z.o[col]) || 0; }); (NAM_COT[b.id] || []).forEach((col) => { e.v[2] += Number(z.o[col]) || 0; });
  }));
  const dong = Object.values(m); if (!dong.length) throw E('BC 1953 chưa có số liệu để lấy tạm.');
  // Số giả định để xem giao diện: giữ nguyên tổng lũy kế của từng dòng, tách tạm vốn kéo dài / vốn năm và thanh toán KLHT / tạm ứng theo tỷ lệ cố định (suy từ tên dòng)
  dong.forEach((x) => {
    const T = x.v[0] + x.v[2]; let h = 7; for (const ch of x.khoa) h = (h * 31 + ch.charCodeAt(0)) % 1009;
    const kd = T * (0.25 + 0.35 * ((h % 100) / 100)), n = T - kd, tu1 = 0.08 + 0.22 * (((h >> 3) % 100) / 100), tu2 = 0.12 + 0.3 * (((h >> 5) % 100) / 100);
    x.v = [kd * (1 - tu1), kd * tu1, n * (1 - tu2), n * tu2];
  });
  return ghiMoc(token, q, ngay, han, 'Số tạm (giả định) từ BC 1953 kỳ ' + c.nhan, dong);
}
async function xoaMoc(token, id) {
  const q = await L.quyen(token); if (q.vt === 'PGD') throw E('Không có quyền.');
  const m = (await db().q('SELECT chot FROM kpi_moc WHERE id=$1', [id]))[0]; if (!m) throw E('Không có mốc này.'); if (m.chot) throw E('Mốc đã chốt, hãy mở lại mốc trước khi xóa.');
  await db().tx(async (t) => { for (const b of ['kpi_thbc', 'kpi_dc', 'kpi_xn', 'kpi_dcs']) await t.q('DELETE FROM ' + b + ' WHERE moc=$1', [id]); await t.q('DELETE FROM kpi_moc WHERE id=$1', [id]); });
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
  const xn = await db().q('SELECT pgd,nguoi,hoten,ts FROM kpi_xn WHERE moc=$1', [m.id]), dcsR = await db().q('SELECT pgd,tt,nguoi,hoten,ts FROM kpi_dcs WHERE moc=$1', [m.id]);
  const T = {}, D = {}; th.forEach((x) => { T[x.khoa] = x; }); dc.forEach((x) => { D[x.khoa] = x; });
  const xm = {}; xn.forEach((x) => { xm[x.pgd] = x; }); const dcsM = {}; dcsR.forEach((x) => { dcsM[x.pgd] = x; }); const nd0 = {}; dc.forEach((d) => { const p = T[d.khoa] && T[d.khoa].pgd; if (p) nd0[p] = (nd0[p] || 0) + 1; });
  const st0 = (p) => (xm[p] ? (nd0[p] ? 'xn_dc' : 'xn') : (!nd0[p] ? 'cho' : (dcsM[p] ? (dcsM[p].tt === 'duyet' ? 'duyet' : 'gui') : 'nhap')));
  const cvq = vaiTro(q), ownLap = q.vt === 'PGD' && ['LAP', 'ALL'].includes(cvq), vis = (p) => st0(p) !== 'nhap' || (ownLap && p === q.pgd), duyet = (p) => (!!dcsM[p] && dcsM[p].tt === 'duyet') || (!!xm[p] && !!nd0[p]);   // đã xác nhận mà có điều chỉnh = coi như đã duyệt (cả dữ liệu cũ)
  const byRow = {}; DM.forEach((o) => { byRow[o.row] = o; });
  const dung = new Set(), memo = {}, N = (x) => Number(x) || 0;
  const leaf = (x, ten, pgd) => {
    const t = [x.kd_tt, x.kd_tu, x.n_tt, x.n_tu].map(N), d = vis(x.pgd) ? D[x.khoa] : undefined, pv = d ? [d.kd_tt, d.kd_tu, d.n_tt, d.n_tu].map(N) : t, ok = d && duyet(x.pgd), e = ok ? pv : t;
    return { n: 1, nd: d ? 1 : 0, ok: ok ? 1 : 0, t0: t[0], t1: t[1], t2: t[2], t3: t[3], p0: pv[0], p1: pv[1], p2: pv[2], p3: pv[3], e0: e[0], e1: e[1], e2: e[2], e3: e[3], khoa: x.khoa, ly: d ? d.ly_do : undefined, ten, pgd };
  };
  const KEYS = ['n', 'nd', 'ok', 't0', 't1', 't2', 't3', 'p0', 'p1', 'p2', 'p3', 'e0', 'e1', 'e2', 'e3'];
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
  const top = []; DM.find((o) => o.b === 'TỔNG CỘNG').kids.forEach((kr, ki) => { (byRow[kr].kids || []).forEach((cr) => { const o = byRow[cr], z = sum(o), t = z.t0 + z.t1 + z.t2 + z.t3; if (t > 0) top.push({ b: bo(o.b), t: r3(t), n: r3(z.t2 + z.t3), k: ki }); }); });   // theo chủ đầu tư (gộp đơn vị trực thuộc, điểm giao dịch)
  top.sort((a, b) => b.t - a.t);
  const tot = rows.find((r) => r.k === 'tot'); KEYS.forEach((k) => { tot[k] = rows.filter((r) => r.k === 'khoi').reduce((s, r) => s + (r[k] || 0), 0) + thua.reduce((s, r) => s + r[k], 0); });
  if (full) { RG.kieu(rows); if (thua.length) { const kr = { a: '', b: 'CHƯA CÓ TRONG DANH MỤC', c: '', lv: 0, k: 'khoi' }; KEYS.forEach((k) => { kr[k] = thua.reduce((s, r) => s + r[k], 0); }); rows.push(kr, ...thua); } }
  else rows = RG.rutGon(rows, thua, { leafOk: (x) => x.k === 'row' && x.n > 0, sum: KEYS, fix: () => {} });
  // trạng thái từng phòng trong phạm vi
  const ds = C.DS_PGD.filter((p) => sc.has(p)).map((p) => {
    const ks = th.filter((x) => x.pgd === p); if (!ks.length) return { pgd: p, tt: 'khong' };
    const nd = ks.filter((x) => D[x.khoa] && vis(p)).length, x = xm[p], ap = duyet(p);
    let tn = [0, 0, 0, 0], e = [0, 0, 0, 0]; ks.forEach((k) => { const t = [k.kd_tt, k.kd_tu, k.n_tt, k.n_tu].map(N), d = D[k.khoa], v = d && ap ? [d.kd_tt, d.kd_tu, d.n_tt, d.n_tu].map(N) : t; for (let i = 0; i < 4; i++) { tn[i] += t[i]; e[i] += v[i]; } });
    const dd = dcsM[p];
    return { pgd: p, tt: st0(p), nd, soDong: ks.length, t: tn.map(r3), nguoi: x && (x.hoten || x.nguoi), luc: x && C.dinhDang(x.ts), guiLuc: dd && dd.ts ? C.dinhDang(dd.ts) : '', guiNguoi: (dd && (dd.hoten || dd.nguoi)) || '', tong: r3(e.reduce((s, y) => s + y, 0)), tongThbc: r3(tn.reduce((s, y) => s + y, 0)) };
  });
  const cv = cvq, mo = !m.chot, pg = q.vt === 'PGD' ? q.pgd : null, mine = pg && ds.find((d) => d.pgd === pg);
  const khoi = rows.filter((r) => r.k === 'khoi' && r.b !== 'CHƯA CÓ TRONG DANH MỤC');
  const sm = (r) => r ? { tong: r.e0 + r.e1 + r.e2 + r.e3, kd: r.e0 + r.e1, n: r.e2 + r.e3 } : null;
  return {
    co: true, top: top.slice(0, 10), moc: { id: m.id, nhan: ngayNhan(m.ngay), han: m.han, file: m.file, luc: C.dinhDang(m.luc), nguoi: m.nguoi, chot: !!m.chot }, ds, rows, full, pgd: pg, vt: q.vt, cv, thua: thua.length,
    quyen: (() => { const lap = ['LAP', 'ALL'].includes(cv), tp = ['TP', 'ALL'].includes(cv), tt = mine && mine.tt, ok = !!pg && mo && !!mine, xnT = ok && tp && tt === 'cho', xnD = ok && tp && tt === 'duyet';
      return { sua: ok && lap && ['cho', 'nhap'].includes(tt), gui: ok && lap && tt === 'nhap', pheDuyet: ok && tp && tt === 'gui', traLai: ok && tp && tt === 'gui', xnThbc: xnT, xnDc: xnD, xacNhan: xnT || xnD, moLai: ok && tp && ['xn', 'xn_dc', 'duyet'].includes(tt), tt, chot: q.vt !== 'PGD' }; })(),
    vb: full ? { tong: sm(tot), tinh: sm(khoi[0]), xa: sm(khoi[1]) } : undefined, ds2: (await dsKy(token)).ds, vbInfo: q.vt !== 'PGD' ? await vbDoc(m.id) : undefined,
  };
}
async function luuDc(token, id, items) {
  const q = await L.quyen(token); if (q.vt !== 'PGD') throw E('Chỉ phòng giao dịch ghi nhận số khác THBC.');
  if (q.tk.cv === 'TP') throw E('Trưởng phòng không sửa trực tiếp: người lập đề nghị điều chỉnh rồi gửi phê duyệt.');
  if (!['LAP', undefined, ''].includes(q.tk.cv)) throw E('Kế toán trưởng chỉ xem; người lập nhập số đề nghị điều chỉnh.');
  const m = await chonMoc(id); if (!m || m.id !== id) throw E('Không có mốc báo cáo này.'); if (m.chot) throw E('Mốc đã chốt.');
  { const sp = await stP(m.id, q.pgd); if (sp.xn) throw E('Phòng đã xác nhận. Trưởng phòng bấm "Mở lại để sửa" trước khi thay đổi.'); if (sp.dcs) throw E('Số điều chỉnh đã gửi phê duyệt. Trưởng phòng bấm "Trả lại" hoặc "Mở lại để sửa" trước khi thay đổi.'); }
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
  await nk(q.ten, 'Lưu tạm số đề nghị điều chỉnh KPI', m.id, q.pgd, ghi.length + ' dòng');
  return lay(token, m.id);
}
async function xacNhan(token, id) {
  const q = await L.quyen(token); if (q.vt !== 'PGD') throw E('Chỉ Trưởng phòng của phòng giao dịch xác nhận số liệu.');
  if (!['TP', undefined, ''].includes(q.tk.cv)) throw E('Chỉ Trưởng phòng (lãnh đạo phòng) mới xác nhận số liệu KPI.');
  const m = await chonMoc(id); if (!m || m.id !== id) throw E('Không có mốc báo cáo này.'); if (m.chot) throw E('Mốc đã chốt.');
  { const sp = await stP(m.id, q.pgd); if (sp.n && !(sp.dcs && sp.dcs.tt === 'duyet')) throw E(sp.dcs ? 'Phòng có số điều chỉnh đang chờ phê duyệt: hãy phê duyệt (hoặc trả lại) trước khi xác nhận.' : 'Phòng có số điều chỉnh người lập chưa gửi phê duyệt, chưa thể xác nhận.'); }
  if (!(await db().q('SELECT 1 AS x FROM kpi_thbc WHERE moc=$1 AND pgd=$2', [m.id, q.pgd])).length) throw E('Phòng không có dòng số liệu nào ở mốc này.');
  const hoten = (await db().q('SELECT hoten FROM accounts WHERE ten=$1', [q.ten]))[0];
  await db().q('INSERT INTO kpi_xn (moc,pgd,nguoi,hoten,ts) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (moc,pgd) DO UPDATE SET nguoi=excluded.nguoi, hoten=excluded.hoten, ts=excluded.ts', [m.id, q.pgd, q.ten, (hoten && hoten.hoten) || '', Date.now()]);
  await nk(q.ten, 'Xác nhận số liệu KPI', m.id, q.pgd, ''); return lay(token, m.id);
}
async function buocDc(token, id, buoc) {
  const q = await L.quyen(token); if (q.vt !== 'PGD') throw E('Chỉ phòng giao dịch thực hiện bước này.');
  const gui = buoc === 'gui', cv = q.tk.cv;
  if (gui ? !['LAP', undefined, ''].includes(cv) : !['TP', undefined, ''].includes(cv)) throw E(gui ? 'Chỉ người lập gửi phê duyệt số điều chỉnh.' : 'Chỉ Trưởng phòng phê duyệt hoặc trả lại số điều chỉnh.');
  const m = await chonMoc(id); if (!m || m.id !== id) throw E('Không có mốc báo cáo này.'); if (m.chot) throw E('Mốc đã chốt.');
  const sp = await stP(m.id, q.pgd); if (sp.xn) throw E('Phòng đã xác nhận.');
  const hoten = (await db().q('SELECT hoten FROM accounts WHERE ten=$1', [q.ten]))[0], ht = (hoten && hoten.hoten) || '';
  if (gui) {
    if (!sp.n) throw E('Chưa có dòng nào đề nghị điều chỉnh để gửi.'); if (sp.dcs) throw E('Số điều chỉnh đã được gửi.');
    await db().q('INSERT INTO kpi_dcs (moc,pgd,tt,nguoi,hoten,ts) VALUES ($1,$2,$3,$4,$5,$6)', [m.id, q.pgd, 'gui', q.ten, ht, Date.now()]); await nk(q.ten, 'Gửi phê duyệt số điều chỉnh KPI', m.id, q.pgd, sp.n + ' dòng');
  } else {
    if (!sp.dcs || sp.dcs.tt !== 'gui') throw E('Không có số điều chỉnh nào đang chờ phê duyệt.');
    if (buoc === 'duyet') { await db().q('UPDATE kpi_dcs SET tt=$1, nguoi=$2, hoten=$3, ts=$4 WHERE moc=$5 AND pgd=$6', ['duyet', q.ten, ht, Date.now(), m.id, q.pgd]); await nk(q.ten, 'Phê duyệt số điều chỉnh KPI', m.id, q.pgd, sp.n + ' dòng'); }
    else { await db().q('DELETE FROM kpi_dcs WHERE moc=$1 AND pgd=$2', [m.id, q.pgd]); await nk(q.ten, 'Trả lại số điều chỉnh KPI', m.id, q.pgd, ''); }
  }
  return lay(token, m.id);
}
const guiDuyet = (t, id) => buocDc(t, id, 'gui'), pheDuyet = (t, id) => buocDc(t, id, 'duyet'), traLai = (t, id) => buocDc(t, id, 'tra');
async function moLai(token, id, pgd) {
  const q = await L.quyen(token), m = await chonMoc(id); if (!m || m.id !== id) throw E('Không có mốc báo cáo này.'); if (m.chot) throw E('Mốc đã chốt.');
  let p = pgd;
  if (q.vt === 'PGD') { if (!['TP', undefined, ''].includes(q.tk.cv)) throw E('Chỉ Trưởng phòng mở lại để sửa.'); p = q.pgd; }
  else if (!C.DS_PGD.includes(p)) throw E('Chọn phòng cần mở lại.');
  await db().q('DELETE FROM kpi_xn WHERE moc=$1 AND pgd=$2', [m.id, p]); await db().q('DELETE FROM kpi_dcs WHERE moc=$1 AND pgd=$2', [m.id, p]); await nk(q.ten, 'Mở lại xác nhận KPI', m.id, p, ''); return lay(token, m.id, q.vt === 'PGD' ? undefined : p);
}

// ---------- Biểu in (đúng mẫu PDF gửi Sở Tài chính) và công văn ----------
// Biểu toàn tỉnh: theo thứ tự danh mục chủ đầu tư (như Biểu tổng 1953); mỗi chủ đầu tư một dòng, chỉ tách đơn vị trực thuộc khi là đơn vị độc lập
// (Sở Nông nghiệp và Môi trường, Sở Y tế…); Ban QLDA và các điểm giao dịch được cộng gộp vào chủ đầu tư.
const COT9 = (x, p) => { const a = x[p + '0'], b = x[p + '1'], c = x[p + '2'], d = x[p + '3']; return [a + b + c + d, a + c, b + d, a + b, a, b, c + d, c, d]; };
const GOP = /^Ban QLDA/i, bo = (b) => String(b).replace(/\s*\(trực tiếp\)\s*$/i, '');
function bieuIn(r, che) {
  const p = che === 'goc' ? 't' : (che === 'de' ? 'p' : 'e'), out = [];
  if (!r.full) { r.rows.forEach((x) => out.push({ k: x.k === 'khoi' ? 'sec' : (x.k === 'tot' ? 'tot' : (x.k === 'nhom' ? 'par' : 'row')), a: x.a, st: x.st, b: x.b, lv: x.lv, v: COT9(x, p) })); return out; }
  const byRow = {}; DM.forEach((o, i) => { byRow[o.row] = { o, x: r.rows[i] }; });
  const tot = r.rows.find((x) => x.k === 'tot'); out.push({ k: 'tot', a: '', b: 'TỔNG CỘNG', v: COT9(tot, p) });
  const goc = DM.find((o) => o.b === 'TỔNG CỘNG'), TEN = ['Chủ đầu tư cấp tỉnh', 'UBND xã/phường'];
  goc.kids.forEach((kr, ki) => {
    const kh = byRow[kr]; out.push({ k: 'sec', a: kh.o.a, b: TEN[ki] || kh.o.b, v: COT9(kh.x, p) }); let n = 0;
    (kh.o.kids || []).forEach((cr) => {
      const c = byRow[cr]; n++;
      out.push({ k: 'row', a: n, b: c.o.b, v: COT9(c.x, p) });
      const ks = (c.o.kids || []).map((q) => byRow[q]);
      if (ks.length && !GOP.test(c.o.b) && ks.every((q) => !/^Giao dịch/i.test(q.o.b))) ks.forEach((q, j) => out.push({ k: 'sub', a: n + '.' + (j + 1), b: bo(q.o.b), v: COT9(q.x, p) }));
    });
  });
  const thua = r.rows.filter((x) => x.thua); if (thua.length) { out.push({ k: 'sec', a: '', b: 'CHƯA CÓ TRONG DANH MỤC', v: COT9(thua.reduce((s, x) => { ['e0', 'e1', 'e2', 'e3', 't0', 't1', 't2', 't3'].forEach((f) => { s[f] = (s[f] || 0) + x[f]; }); return s; }, {}), p) }); thua.forEach((x, i) => out.push({ k: 'row', a: i + 1, b: x.b, v: COT9(x, p) })); }
  return out;
}
const VB_MAC_DINH = (id) => { const nam = id.slice(0, 4); return { diaDanh: 'Phú Thọ', so: '', ngay: '', trichYeu: 'báo cáo tình hình thực hiện giải ngân vốn đầu tư năm ' + nam + ' tỉnh Tuyên Quang', kinhGui: 'Sở Tài chính tỉnh Tuyên Quang', canCu: '', kt: 'KT. GIÁM ĐỐC', chucVu: 'PHÓ GIÁM ĐỐC', nguoiKy: '', noiNhan: 'Như trên;\nGiám đốc KBVIII (báo cáo);\nLãnh đạo KBVIII địa bàn Tuyên Quang;\nLưu VT, NV2.' }; };
async function vbDoc(mid) {
  const kv = (await db().q('SELECT v FROM kv WHERE k=$1', ['kpivb:' + mid]))[0]; let cu = {}; try { cu = kv ? JSON.parse(kv.v) : {}; } catch (e) { cu = {}; }
  return Object.assign(VB_MAC_DINH(mid), cu, { id: mid });
}
async function vbLay(token, id) {
  const q = await L.quyen(token); if (q.vt === 'PGD') throw E('Không có quyền.');
  const m = await chonMoc(id); if (!m) throw E('Chưa có mốc báo cáo KPI.');
  return vbDoc(m.id);
}
async function vbLuu(token, id, o) {
  const q = await L.quyen(token); if (q.vt === 'PGD') throw E('Không có quyền.');
  const m = await chonMoc(id); if (!m || m.id !== id) throw E('Không có mốc này.');
  const mac = VB_MAC_DINH(m.id), v = {}, cat = (x, n) => String(x == null ? '' : x).replace(/\r/g, '').substring(0, n);
  Object.keys(mac).forEach((k) => { v[k] = o && o[k] !== undefined ? cat(o[k], k === 'canCu' || k === 'noiNhan' ? 1500 : 200).trim() : mac[k]; });
  if (v.ngay && !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v.ngay)) throw E('Ngày văn bản nhập dạng 16/10/2026.');
  await db().q('INSERT INTO kv (k,v) VALUES ($1,$2) ON CONFLICT (k) DO UPDATE SET v=excluded.v', ['kpivb:' + m.id, JSON.stringify(v)]);
  await nk(q.ten, 'Lưu thông tin công văn KPI', m.id, v.so, ''); return vbLay(token, id);
}
module.exports = { taoTuBc1953, bieuIn, vbLay, vbLuu, COT9, taiThbc, xoaMoc, chotMoc, dsKy, lay, luuDc, xacNhan, guiDuyet, pheDuyet, traLai, moLai, ngayNhan, _: { phanTich, F4 } };
