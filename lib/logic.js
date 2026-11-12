'use strict';
const crypto = require('crypto');
const C = require('./common');
const SCHEMA = require('./schema');
const getDb = require('./db');
const { CFG, DS_PGD, ADMIN, PHONG_NV2, TINH_TRANG, T, TONG_COL, byId, THI_DIEM, DA_NOP, CV_TEN, cvTen, TK_THI_DIEM } = C;
const TOKEN_MS = 6 * 3600e3;
const E = (m) => { const e = new Error(m); e.user = true; return e; };
let ready = null;
const db = () => getDb();
async function nangCap() {   // CSDL cũ (đã triển khai) → thêm cột + tài khoản thí điểm, không cần nạp lại dữ liệu
  try { await db().q('SELECT donvi,cv,hoten FROM accounts LIMIT 1'); }
  catch (e) { for (const c of ['donvi', 'cv', 'hoten']) { try { await db().exec(`ALTER TABLE accounts ADD COLUMN ${c} TEXT DEFAULT ''`); } catch (_) {} } }
  if ((await db().q('SELECT 1 AS x FROM accounts LIMIT 1')).length)
    { // sửa số liệu một lần: Xã Phú Linh (B01, PGD 24) trong tháng 10 cột 8 = 0 → số đầu kỳ cột 5 = lũy kế
      try { if (!(await db().q("SELECT 1 AS x FROM kv WHERE k='fix_phulinh'")).length) {
        await db().q("UPDATE cells SET n=37 WHERE ky='goc-1' AND bid='b01' AND r=190 AND c=5 AND n<>37");
        await db().q("INSERT INTO kv (k,v) VALUES ('fix_phulinh','1') ON CONFLICT (k) DO NOTHING"); } } catch (_) {}
    }
    const co = new Set((await db().q('SELECT ten FROM accounts')).map((r) => r.ten));     // 1 truy vấn; thường không còn gì phải thêm → khởi động nhanh
    if (co.has('Huy (NV2 - PGD 17)')) { try { await db().q("DELETE FROM accounts WHERE ten='Huy (NV2 - PGD 17)'"); } catch (_) {} }
    for (const a of TK_THI_DIEM) if (!co.has(a[0])) await db().q('INSERT INTO accounts (ten,ma,vt,scope,donvi,cv) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (ten) DO NOTHING', [a[0], 'bc1953', a[1], a[2], a[3], a[4]]);
}
async function init() { if (!ready) ready = db().exec(SCHEMA).then(nangCap).catch((e) => { ready = null; throw e; }); return ready; }

/* ---------- cấu trúc dòng (cố định, nạp một lần cho mỗi instance) ---------- */
let STRUCT = null;
async function struct() {
  if (STRUCT) return STRUCT;
  const defs = await db().q('SELECT bid,r,a,b,bd,pgd,sec,par FROM rowdef ORDER BY bid, r');
  const secs = await db().q('SELECT bid,ord,name FROM secs ORDER BY bid, ord');
  const s = { rows: {}, secs: {} };
  CFG.forEach((b) => { s.rows[b.id] = []; s.secs[b.id] = []; });
  defs.forEach((d) => s.rows[d.bid].push(d));
  secs.forEach((x) => s.secs[x.bid].push(x.name));
  return (STRUCT = s);
}

/* ---------- kỳ báo cáo ---------- */
async function kvGet(k) { const r = await db().q('SELECT v FROM kv WHERE k=$1', [k]); return r.length ? r[0].v : null; }
let kyCache = null;
async function docKy() { if (kyCache && Date.now() - kyCache.t < 5e3) return kyCache.v; const v = await docKy0(); kyCache = { t: Date.now(), v }; return v; }
async function docKy0() { const ky = await kvGet('ky'), goc = await kvGet('goc'); if (!ky) throw E('Chưa nạp dữ liệu khởi tạo (chạy npm run seed).'); return { ky, goc, nhan: C.kyNhan(ky) }; }
async function dsKy() { const k = await docKy(), out = []; let c = C.kyTruoc(k.goc); while (c <= k.ky && out.length < 60) { out.push({ ky: c, nhan: C.kyNhan(c), hienTai: c === k.ky, soGoc: c < k.goc }); c = C.kySau(c); } return out; }
async function chonKy(kyIn) {
  const k = await docKy(); kyIn = String(kyIn || '').trim();
  if (!kyIn || kyIn === k.ky) return { ky: k.ky, cur: true, goc: k.goc, auto: true, nhan: k.nhan, hienTai: k.ky };
  if (!/^\d{4}-\d{2}$/.test(kyIn) || kyIn < C.kyTruoc(k.goc) || kyIn > k.ky) throw E('Kỳ báo cáo không hợp lệ.');
  return { ky: kyIn, cur: false, goc: k.goc, auto: true, nhan: C.kyNhan(kyIn), hienTai: k.ky };
}

/* ---------- tài khoản, phiên ---------- */
const scopeOf = (a) => a.vt === 'TH' ? DS_PGD : (a.vt === 'NV2' ? (a.scope ? a.scope.split(';').map((x) => x.trim()).filter((x) => DS_PGD.includes(x)) : []).concat([]) : [a.donvi || a.ten]);
function pham(a) { const s = scopeOf(a); return a.vt === 'NV2' && !s.length ? DS_PGD : s; }
async function dsTaiKhoan() {
  await init();
  const r = (await db().q('SELECT ten,vt,donvi FROM accounts')).filter((a) => !(a.vt === 'PGD' && !a.donvi) && a.vt !== 'NV2').map((a) => ({ ten: a.ten, vt: a.vt, donvi: a.donvi || a.ten })), uu = { TH: 0, NV2: 1, PGD: 2 };
  return r.sort((a, b) => uu[a.vt] - uu[b.vt] || DS_PGD.indexOf(a.donvi) - DS_PGD.indexOf(b.donvi) || (a.ten < b.ten ? -1 : 1));
}
async function dangNhap(ten, ma) {
  await init(); ten = String(ten || '').trim();
  const now = Date.now(), f = await db().q('SELECT n,until FROM fails WHERE ten=$1', [ten]);
  if (f.length && f[0].n >= 5 && f[0].until > now) throw E('Nhập sai quá 5 lần. Vui lòng thử lại sau 15 phút.');
  const r = await db().q('SELECT * FROM accounts WHERE ten=$1', [ten]), a = r[0];
  if (!a || String(ma || '').trim().toUpperCase() !== String(a.ma).toUpperCase()) {
    const n = (f.length && f[0].until > now ? f[0].n : 0) + 1;
    await db().q('INSERT INTO fails (ten,n,until) VALUES ($1,$2,$3) ON CONFLICT (ten) DO UPDATE SET n=excluded.n, until=excluded.until', [ten, n, now + 900e3]);
    throw E('Sai tài khoản hoặc mã đăng nhập.');
  }
  await db().q('DELETE FROM fails WHERE ten=$1', [ten]);
  await db().q('DELETE FROM sessions WHERE exp<$1', [now]);
  const token = crypto.randomUUID();
  await db().q('INSERT INTO sessions (token,ten,exp) VALUES ($1,$2,$3)', [token, ten, now + TOKEN_MS]);
  return { token, ten, ky: (await docKy()).nhan, vt: a.vt, scope: pham(a), lap: a.lap || '', ktt: a.ktt || '', tp: a.tp || '', coKtt: a.vt === 'PGD' && (a.donvi || ten).indexOf('Nghiệp vụ') < 0, cv: a.cv || '', cvTen: cvTen(a.donvi, a.cv), hoten: a.hoten || '', donvi: a.donvi || (a.vt === 'PGD' ? ten : ''), thiDiem: THI_DIEM.includes(a.donvi || ten) };
}
async function quyen(token, xem) {
  await init();
  const s = await db().q('SELECT ten,exp FROM sessions WHERE token=$1', [String(token || '')]);
  if (!s.length || s[0].exp < Date.now()) throw E('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
  const a = (await db().q('SELECT * FROM accounts WHERE ten=$1', [s[0].ten]))[0];
  if (!a) throw E('Tài khoản không còn hiệu lực.');
  const scope = pham(a); let pgd = a.donvi || a.ten;
  if (a.vt !== 'PGD') pgd = (xem && scope.includes(xem)) ? xem : scope[0];
  return { ten: a.ten, vt: a.vt, scope, pgd, tk: a };
}
async function luuNguoiKy(token, lap, ktt, tp) {
  const q = await quyen(token); if (q.vt !== 'PGD') throw E('Tài khoản này chỉ được xem.');
  const cl = (s) => String(s || '').replace(/\s+/g, ' ').trim().substring(0, 60);
  if (q.tk.cv) { await db().q('UPDATE accounts SET hoten=$1 WHERE ten=$2', [cl(lap), q.ten]); return true; }
  await db().q('UPDATE accounts SET lap=$1, ktt=$2, tp=$3 WHERE ten=$4', [cl(lap), cl(ktt), cl(tp), q.ten]);
  return true;
}
const nk = (who, act, x, y, z) => db().q('INSERT INTO nhat_ky (ts,who,act,x,y,z) VALUES ($1,$2,$3,$4,$5,$6)', [Date.now(), who, act, x || '', y || '', z || '']);

/* ---------- trạng thái quy trình ---------- */
const dacoTT = {};   // nhớ ngắn hạn: kỳ nào đã đủ dòng trạng thái (tránh 13 truy vấn mỗi lần gọi)
async function ensureStatus(ky) {
  if (dacoTT[ky] && Date.now() - dacoTT[ky] < 60e3) return;
  const par = [ky, T.CHUA], vals = DS_PGD.map((p) => { par.push(p); return '($1,$' + par.length + ',$2,0,0)'; });
  await db().q('INSERT INTO status (ky,pgd,tt,so_tra,so_gui) VALUES ' + vals.join(',') + ' ON CONFLICT (ky,pgd) DO NOTHING', par);
  await db().q('INSERT INTO kyinfo (ky) VALUES ($1) ON CONFLICT (ky) DO NOTHING', [ky]);
  dacoTT[ky] = Date.now();
}
async function docTT(ky) {
  await ensureStatus(ky);
  const out = {}; (await db().q('SELECT * FROM status WHERE ky=$1', [ky])).forEach((r) => { out[r.pgd] = r; }); return out;
}
async function docHan(ky) {
  await ensureStatus(ky);
  const r = (await db().q('SELECT han_pgd,han_nv2 FROM kyinfo WHERE ky=$1', [ky]))[0];
  return { pgd: String(r.han_pgd || ''), nv2: String(r.han_nv2 || '') };
}
async function datHan(token, hanPgd, hanNv2) {
  const q = await quyen(token); if (q.vt !== 'TH') throw E('Chỉ cán bộ tổng hợp được đặt hạn nộp.');
  const re = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})$/;
  const chuan = (x) => { x = String(x || '').trim(); if (!x) return ''; const m = re.exec(x); if (!m) throw E('Hạn nộp không đúng định dạng.'); return m[1] + ' ' + m[2]; };
  const h1 = chuan(hanPgd), h2 = chuan(hanNv2), k = await docKy(); await ensureStatus(k.ky);
  await db().q('UPDATE kyinfo SET han_pgd=$1, han_nv2=$2 WHERE ky=$3', [h1, h2, k.ky]);
  await nk(q.ten, 'Đặt hạn nộp', '', '', 'PGD: ' + h1 + ' | NV2: ' + h2);
  return trangThai(token);
}
async function trangThai(token, kyIn) {
  const q = await quyen(token), c = await chonKy(kyIn), tt = await docTT(c.ky), han = await docHan(c.ky), now = Date.now();
  const h1 = C.parseHan(han.pgd), h2 = null;   // quy trình mới: không còn hạn riêng cho Nghiệp vụ 2
  const list = q.scope.map((p) => {
    const x = tt[p]; let cham = false, quaHan = false, nv2Cham = false, nv2QuaHan = false;
    const daGui = x.gui && x.tt !== T.CHUA && x.tt !== T.TRA;
    if (h1) { if (x.gui && x.gui > h1) cham = true; if (!daGui && now > h1) quaHan = true; }
    if (h2 && p !== PHONG_NV2) { if (x.nop && x.nop > h2) nv2Cham = true; if (!DA_NOP.includes(x.tt) && now > h2) nv2QuaHan = true; }
    return { pgd: p, tt: x.tt, gui: C.dinhDang(x.gui), nhan: C.dinhDang(x.nhan), nguoiNhan: x.nguoi_nhan || '', nop: C.dinhDang(x.nop), nguoiNop: x.nguoi_nop || '',
      lyDo: x.tt === T.TRA ? (x.ly_do || '') : '', soTra: x.so_tra || 0, tra: C.dinhDang(x.tra), nguoiTra: x.nguoi_tra || '', soGui: x.so_gui || 0,
      thiDiem: THI_DIEM.includes(p), deNghi: x.de_nghi || '', deNghiLuc: C.dinhDang(x.de_nghi_luc), cham, quaHan, nv2Cham, nv2QuaHan, tre: (h1 && x.gui && x.gui > h1) ? C.soGio(x.gui - h1) : '' };
  });
  const kd = await db().q('SELECT pgd,buoc,hoten,ts FROM ky_duyet WHERE ky=$1', [c.ky]);
  list.forEach((x) => { x.ky = {}; kd.filter((k) => k.pgd === x.pgd).forEach((k) => { x.ky[k.buoc] = { ten: k.hoten || '', luc: C.dinhDang(k.ts) }; }); });
  return { list, han, hanHienThi: { pgd: C.dinhDang(h1), nv2: C.dinhDang(h2) }, hanMs: { pgd: h1 || 0, nv2: h2 || 0 }, nowMs: now, now: C.dinhDang(now), vt: q.vt,
    ky: c.nhan, kyIso: c.ky, kyCu: !c.cur, kyAuto: true, dsKy: await dsKy() };
}
// Đổi trạng thái nguyên tử: chỉ thành công nếu trạng thái hiện tại nằm trong tuCac
async function doiTT(q, pgd, tuCac, den, f, loiMsg, kyIn) {
  const c = await chonKy(kyIn); await ensureStatus(c.ky);
  if (!DS_PGD.includes(pgd)) throw E('Phòng không hợp lệ');
  if (c.ky < c.goc) throw E('Kỳ ' + c.nhan + ' là số gốc, chỉ để xem.');
  const sets = ['tt=$1'], par = [den]; Object.keys(f || {}).forEach((k) => { par.push(f[k]); sets.push(k + '=$' + par.length); });
  par.push(c.ky, pgd); const i1 = par.length - 1, i2 = par.length;
  const ph = tuCac.map((t) => { par.push(t); return '$' + par.length; }).join(',');
  const r = await db().q(`UPDATE status SET ${sets.join(', ')} WHERE ky=$${i1} AND pgd=$${i2} AND tt IN (${ph}) RETURNING pgd`, par);
  if (!r.length) { const x = (await docTT(c.ky))[pgd]; throw E(loiMsg + ' (hiện tại: ' + x.tt + ')'); }
  await nk(q.ten, 'Trạng thái' + (c.cur ? '' : ' (kỳ ' + c.nhan + ')'), pgd, '', den);
}
const trongPham = (q, pgd) => { if (!q.scope.includes(pgd)) throw E('Phòng này không thuộc phạm vi của bạn.'); };
async function guiBaoCao(token, ky) {
  const q = await quyen(token); if (q.vt !== 'PGD') throw E('Chỉ PGD mới gửi báo cáo.');
  if (THI_DIEM.includes(q.pgd)) throw E('Gửi báo cáo theo quy trình ký duyệt: Lập biểu → Kế toán trưởng → Trưởng phòng phê duyệt (Phòng Nghiệp vụ 2: Lập biểu → Lãnh đạo phòng).');
  const c = await chonKy(ky), x = (await docTT(c.ky))[q.pgd], n = (x.so_gui || 0) + 1, t = Date.now();
  if (q.pgd === PHONG_NV2) await doiTT(q, q.pgd, [T.CHUA, T.TRA], T.NOP, { gui: t, nhan: t, nguoi_nhan: 'Tự động (gửi thẳng)', nop: t, nguoi_nop: q.pgd, de_nghi: '', de_nghi_luc: null, so_gui: n }, 'Không thể gửi báo cáo', c.ky);
  else await doiTT(q, q.pgd, [T.CHUA, T.TRA], T.GUI, { gui: t, nhan: null, nguoi_nhan: '', nop: null, nguoi_nop: '', de_nghi: '', de_nghi_luc: null, so_gui: n }, 'Không thể gửi báo cáo', c.ky);
  return trangThai(token, ky);
}
async function thuHoi(token, ky) {
  const q = await quyen(token); if (q.vt !== 'PGD') throw E('Chỉ PGD mới thu hồi.');
  if (THI_DIEM.includes(q.pgd)) throw E('Dùng nút "Rút lại" khi báo cáo đang chờ ký duyệt.');
  if (q.pgd === PHONG_NV2) await doiTT(q, q.pgd, [T.NOP], T.CHUA, { gui: null, nhan: null, nguoi_nhan: '', nop: null, nguoi_nop: '', de_nghi: '', de_nghi_luc: null }, 'Chỉ thu hồi được báo cáo đã gửi', ky);
  else await doiTT(q, q.pgd, [T.GUI], T.CHUA, { gui: null, de_nghi: '', de_nghi_luc: null }, 'Chỉ thu hồi được khi chưa được tiếp nhận', ky);
  return trangThai(token, ky);
}
async function deNghiSua(token, lyDo, ky) {
  const q = await quyen(token); if (q.vt !== 'PGD') throw E('Chỉ PGD mới đề nghị điều chỉnh.');
  lyDo = String(lyDo || '').trim().substring(0, 300); if (!lyDo) throw E('Cần ghi lý do đề nghị điều chỉnh.');
  const c = await chonKy(ky), x = (await docTT(c.ky))[q.pgd];
  if (q.tk.cv && q.tk.cv !== 'LAP') throw E('Chỉ người lập biểu mới đề nghị điều chỉnh.');
  if (![T.GUI, T.NHAN, T.NOP, T.TH_NHAN].includes(x.tt)) throw E('Báo cáo chưa gửi nên tự sửa được, không cần đề nghị.');
  await db().q('UPDATE status SET de_nghi=$1, de_nghi_luc=$2 WHERE ky=$3 AND pgd=$4', [lyDo, Date.now(), c.ky, q.pgd]);
  await nk(q.ten, 'Đề nghị điều chỉnh' + (c.cur ? '' : ' (kỳ ' + c.nhan + ')'), q.pgd, '', lyDo);
  return trangThai(token, ky);
}
async function tiepNhan(token, pgd, ky) {
  throw E('Quy trình mới: Tổng hợp toàn tỉnh tiếp nhận trực tiếp (không qua cán bộ Nghiệp vụ 2).');
  const q = await quyen(token); trongPham(q, pgd);
  await doiTT(q, pgd, [T.GUI], T.NHAN, { nhan: Date.now(), nguoi_nhan: q.ten }, 'Chỉ tiếp nhận được báo cáo đã gửi', ky);
  return trangThai(token, ky);
}
async function chuyenTra(token, pgd, lyDo, ky) {
  const q = await quyen(token); if (q.vt !== 'TH' || q.tk.cv === 'TTH') throw E('Chỉ chuyên viên tổng hợp được chuyển trả (Trưởng phòng Tổng hợp dùng nút "Trả lại").'); trongPham(q, pgd);
  lyDo = String(lyDo || '').trim().substring(0, 300); if (!lyDo) throw E('Cần ghi lý do chuyển trả.');
  const c = await chonKy(ky), x = (await docTT(c.ky))[pgd], tu = [T.GUI, T.NHAN, T.NOP, T.TH_NHAN, T.TRINH, T.TH_DUYET];
  await doiTT(q, pgd, tu, T.TRA, { ly_do: lyDo, so_tra: (x.so_tra || 0) + 1, tra: Date.now(), nguoi_tra: q.ten, de_nghi: '', de_nghi_luc: null }, 'Không thể chuyển trả', c.ky);
  await db().q('DELETE FROM ky_duyet WHERE ky=$1 AND pgd=$2', [c.ky, pgd]);
  return trangThai(token, ky);
}
const BUOC = {
  lap_trinh: { cv: 'LAP', tu: [T.CHUA, T.TRA], den: T.CHO_KTT, ky: 'LAP', lbl: 'Lập biểu trình ký duyệt' },
  lap_rut: { cv: 'LAP', tu: [T.CHO_KTT], den: T.CHUA, lbl: 'Lập biểu rút lại' },
  ktt_trinh: { cv: 'KTT', tu: [T.CHO_KTT], den: T.CHO_TP, ky: 'KTT', lbl: 'KTT trình lãnh đạo' },
  ktt_tra: { cv: 'KTT', tu: [T.CHO_KTT], den: T.TRA, tra: 1, lbl: 'KTT trả lại' },
  tp_duyet: { cv: 'TP', tu: [T.CHO_TP], den: T.GUI, ky: 'TP', gui: 1, lbl: 'Trưởng phòng phê duyệt, gửi Tổng hợp' },
  tp_tra: { cv: 'TP', tu: [T.CHO_TP], den: T.TRA, tra: 1, lbl: 'Trưởng phòng trả lại' },
  th_nhan: { vt: 'TH', th: 'CV', tu: [T.GUI], den: T.TH_NHAN, lbl: 'Tổng hợp tiếp nhận', nhan: 1 },
  th_trinh: { vt: 'TH', th: 'CV', tu: [T.TH_NHAN], den: T.TRINH, lbl: 'Trình Trưởng phòng Tổng hợp' },
  th_duyet: { vt: 'TH', th: 'TTH', tu: [T.TRINH], den: T.TH_DUYET, ky: 'TTH', lbl: 'Trưởng phòng Tổng hợp phê duyệt' },
  th_tra: { vt: 'TH', th: 'TTH', cv: 'TTH', tu: [T.TRINH], den: T.TRA, tra: 1, lbl: 'Trưởng phòng Tổng hợp trả lại' },
};
// Quy trình ký duyệt: mỗi bước một người, ghi dấu "đã ký" (bảng ky_duyet) để in ra biểu
async function duyet(token, hd, lyDo, ky, pgdIn) {
  const q = await quyen(token), b0 = BUOC[hd]; if (!b0) throw E('Thao tác không hợp lệ.');
  const c = await chonKy(ky); await ensureStatus(c.ky);
  const pgd = b0.vt === 'TH' ? String(pgdIn || '') : q.pgd;
  if (!THI_DIEM.includes(pgd)) throw E('Phòng không hợp lệ.');
  const b = Object.assign({}, b0), nv2 = pgd === PHONG_NV2;
  if (nv2 && hd === 'lap_trinh') b.den = T.CHO_TP;                       // Nghiệp vụ 2 không có Kế toán trưởng
  if (nv2 && hd === 'lap_rut') b.tu = [T.CHO_TP];
  if (nv2 && (hd === 'ktt_trinh' || hd === 'ktt_tra')) throw E('Phòng Nghiệp vụ 2 không có bước Kế toán trưởng.');
  if (b.cv && !(b.vt ? (q.vt === 'TH' && q.tk.cv === b.cv) : (q.vt === 'PGD' && q.tk.cv === b.cv))) throw E('Bước này do ' + cvTen(pgd, b.cv) + ' thực hiện.');
  if (b.vt && q.vt !== b.vt) throw E('Bước này do cán bộ tổng hợp thực hiện.');
  if (b.th === 'CV' && q.tk.cv === 'TTH') throw E('Bước này do chuyên viên tổng hợp thực hiện.');
  if (b.th === 'TTH' && q.tk.cv !== 'TTH') throw E('Bước này do Trưởng phòng Tổng hợp thực hiện.');
  lyDo = String(lyDo || '').trim().substring(0, 300); if (b.tra && !lyDo) throw E('Cần ghi rõ lý do trả lại.');
  const x = (await docTT(c.ky))[pgd], t = Date.now(), ten = q.tk.hoten || q.ten, f = {};
  if (b.tra) Object.assign(f, { ly_do: lyDo, so_tra: (x.so_tra || 0) + 1, tra: t, nguoi_tra: ten + ' (' + cvTen(q.tk.donvi || '', q.tk.cv) + ')', gui: null, nhan: null, nguoi_nhan: '', nop: null, nguoi_nop: '', de_nghi: '', de_nghi_luc: null });
  if (b.gui) Object.assign(f, { gui: t, nhan: null, nguoi_nhan: '', nop: null, nguoi_nop: '', de_nghi: '', de_nghi_luc: null, so_gui: (x.so_gui || 0) + 1, ly_do: '' });
  if (b.nhan) Object.assign(f, { nhan: t, nguoi_nhan: ten, de_nghi: '', de_nghi_luc: null });
  if (b.den === T.CHUA) Object.assign(f, { gui: null });
  await doiTT(q, pgd, b.tu, b.den, f, 'Không thực hiện được bước này', c.ky);
  if (b.tra || b.den === T.CHUA || hd === 'lap_trinh') await db().q('DELETE FROM ky_duyet WHERE ky=$1 AND pgd=$2', [c.ky, pgd]);
  if (b.ky) await db().q('INSERT INTO ky_duyet (ky,pgd,buoc,nguoi,hoten,ts) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (ky,pgd,buoc) DO UPDATE SET nguoi=excluded.nguoi, hoten=excluded.hoten, ts=excluded.ts', [c.ky, pgd, b.ky, q.ten, q.tk.hoten || '', t]);
  await nk(q.ten, b.lbl, pgd, '', lyDo);
  return trangThai(token, ky);
}
async function nopTongHop(token, dsPgd, ky) {
  throw E('Quy trình mới: Tổng hợp toàn tỉnh tiếp nhận trực tiếp (không qua cán bộ Nghiệp vụ 2).');
  const q = await quyen(token);
  let ok = 0; const loi = [];
  for (const p of (dsPgd || [])) {
    try { trongPham(q, p); await doiTT(q, p, [T.NHAN], T.NOP, { nop: Date.now(), nguoi_nop: q.ten }, 'Chỉ nộp được báo cáo đã tiếp nhận', ky); ok++; }
    catch (e) { loi.push(p + ': ' + e.message); }
  }
  const r = await trangThai(token, ky); r.ok = ok; r.loi = loi; return r;
}

/* ---------- số liệu ---------- */
// Lũy kế của từng dòng tại kỳ `ky` (ô chưa nhập = giữ số của kỳ trước). Trả về { bid: Map(r -> {col: lk}) } cho các kỳ từ đầu đến ky.
async function luyKeDen(ky, goc) {
  const dau = C.kyTruoc(goc);
  const rows = await db().q('SELECT ky,bid,r,c,n FROM cells WHERE ky>=$1 AND ky<=$2 AND t IS NULL AND n IS NOT NULL ORDER BY ky', [dau, ky]);
  const per = {};   // ky -> bid -> r -> col -> n
  rows.forEach((x) => { ((per[x.ky] = per[x.ky] || {})[x.bid] = per[x.ky][x.bid] || {}); const m = per[x.ky][x.bid]; (m[x.r] = m[x.r] || {})[x.c] = x.n; });
  return per;
}
function lkRow(per, ky, goc, bid, r, col) {   // lũy kế của ô tại kỳ ky
  for (let k = ky; k >= C.kyTruoc(goc); k = C.kyTruoc(k)) { const m = per[k] && per[k][bid] && per[k][bid][r]; if (m && m[col] !== undefined) return m[col]; }
  return 0;
}
async function nap(c) {
  const st = await struct(), per = await luyKeDen(c.ky, c.goc), txt = {};
  (await db().q('SELECT bid,r,c,t FROM cells WHERE ky=$1 AND t IS NOT NULL', [c.ky])).forEach((x) => { txt[x.bid + '#' + x.r + '#' + x.c] = x.t; });
  const kt = C.kyTruoc(c.ky), out = {};
  CFG.forEach((b) => {
    out[b.id] = st.rows[b.id].map((d) => {
      const o = {};
      b.cc.lk.forEach((col, i) => { const lk = lkRow(per, c.ky, c.goc, b.id, d.r, col), pv = lkRow(per, kt, c.goc, b.id, d.r, col); o[col] = lk; o[b.cc.th[i]] = c.ky < c.goc ? 0 : lk - pv; });
      C.tinhTong(b.id, o);
      b.cols.forEach((x) => { if (x.t === 's' || x.t === 'g') o[x.c] = txt[b.id + '#' + d.r + '#' + x.c] || ''; });
      return { d, o };
    });
  });
  return out;
}
function tieuDeKy(raw, c) { return raw.filter((t) => /^(KỲ )?BÁO CÁO/.test(t) && t.indexOf('(Kèm') < 0).map((t) => /^KỲ BÁO CÁO/.test(t) ? 'KỲ BÁO CÁO: THÁNG ' + c.nhan : t); }
const tieuDeRaw = () => require('./tieude.json');

async function layDuLieu(token, xem, kyIn) {
  const q = await quyen(token, xem), c = await chonKy(kyIn), st = await struct();
  const tatCa = (xem === '*' && q.vt !== 'PGD'), tap = tatCa ? q.scope : [q.pgd];
  const all = await nap(c), td = tieuDeRaw(), out = [];
  CFG.forEach((b) => {
    const cols = b.cols.map((x) => (b.cc.th.includes(x.c) ? { c: x.c, t: 'a', lv: x.lv } : x));
    const rows = all[b.id].filter((z) => tap.includes(z.d.pgd)).map((z) => ({ r: z.d.r, a: z.d.a, b: z.d.bd, p: z.d.pgd, sec: z.d.sec, par: z.d.par, v: b.cols.map((x) => z.o[x.c] === undefined ? '' : z.o[x.c]) }));
    out.push({ id: b.id, title: b.title, tieuDe: tieuDeKy(td[b.id] || [], c), secs: st.secs[b.id], cols, rows });
  });
  const tt = (await docTT(c.ky))[q.pgd];
  return { sheets: out, ttOpts: TINH_TRANG, pgd: tatCa ? 'Toàn tỉnh' : q.pgd, tatCa, ky: c.nhan, kyIso: c.ky, kyCu: !c.cur, soGoc: c.ky < c.goc, auto: true,
    docChiXem: c.ky < c.goc || q.vt !== 'PGD' || (!!q.tk.cv && q.tk.cv !== 'LAP') || !(tt.tt === T.CHUA || tt.tt === T.TRA), tt: tt.tt };
}
function chuanHoaO(col, e, a1) {
  let v = e.v;
  if (col.t === 'n') {
    v = String(v == null ? '' : v).trim();
    if (v !== '') { v = v.replace(/\s/g, '').replace(',', '.'); if (!/^-?\d+(\.\d+)?$/.test(v)) return { loi: a1 + ': "' + e.v + '" không phải số' }; v = Number(v); }
  } else if (col.t === 's') {
    v = String(v == null ? '' : v); if (v !== '' && !TINH_TRANG.includes(v)) return { loi: a1 + ': tình trạng không hợp lệ' };
  } else { v = String(v == null ? '' : v).substring(0, 500); if (/^[=+\-@]/.test(v)) v = ' ' + v; }
  return { v };
}
async function luu(token, edits, kyIn) {
  const q = await quyen(token); if (q.vt !== 'PGD') throw E('Tài khoản này chỉ được xem.');
  const c = await chonKy(kyIn), st = await struct(), pgd = q.pgd, tt = (await docTT(c.ky))[pgd];
  if (c.ky < c.goc) throw E('Kỳ ' + c.nhan + ' là số gốc, chỉ để xem.');
  if (q.tk.cv && q.tk.cv !== 'LAP') throw E('Chỉ người lập biểu được nhập số liệu.');
  if (tt.tt !== T.CHUA && tt.tt !== T.TRA) throw E('Báo cáo đã gửi (' + tt.tt + '), không sửa được. Nếu cần sửa: bấm "Thu hồi" khi chưa được tiếp nhận, hoặc bấm "Đề nghị điều chỉnh".');
  const ok = []; const loi = []; const idx = {};
  CFG.forEach((b) => { idx[b.id] = {}; st.rows[b.id].forEach((d) => { idx[b.id][d.r] = d; }); });
  (edits || []).forEach((e) => {
    const b = byId[e.id]; if (!b) { loi.push('Biểu không hợp lệ'); return; }
    const d = idx[e.id][e.r]; if (!d || d.pgd !== pgd) { loi.push('Dòng ' + e.r + ' không thuộc phòng của bạn'); return; }
    const col = b.cols.find((x) => x.c === e.c);
    if (!col || col.t === 't') { loi.push('Cột không được sửa'); return; }
    if (b.cc.th.includes(e.c)) { loi.push('Cột trong tháng tự tính (= lũy kế − lũy kế tháng trước), không nhập tay'); return; }
    const a1 = e.id + '!' + e.r + ':' + e.c, h = chuanHoaO(col, e, a1);
    if (h.loi) { loi.push(h.loi); return; }
    ok.push({ b: e.id, r: e.r, c: e.c, v: h.v, t: col.t });
  });
  await db().tx(async (t) => {
    for (const x of ok) {
      if (x.t === 'n') {
        if (x.v === '') await t.q('DELETE FROM cells WHERE ky=$1 AND bid=$2 AND r=$3 AND c=$4', [c.ky, x.b, x.r, x.c]);
        else await t.q('INSERT INTO cells (ky,bid,r,c,n,t) VALUES ($1,$2,$3,$4,$5,NULL) ON CONFLICT (ky,bid,r,c) DO UPDATE SET n=excluded.n, t=NULL', [c.ky, x.b, x.r, x.c, x.v]);
      } else if (x.v === '') await t.q('DELETE FROM cells WHERE ky=$1 AND bid=$2 AND r=$3 AND c=$4', [c.ky, x.b, x.r, x.c]);
      else await t.q('INSERT INTO cells (ky,bid,r,c,n,t) VALUES ($1,$2,$3,$4,NULL,$5) ON CONFLICT (ky,bid,r,c) DO UPDATE SET t=excluded.t, n=NULL', [c.ky, x.b, x.r, x.c, x.v]);
    }
    if (ok.length) await t.q('UPDATE status SET luu_luc=$1 WHERE ky=$2 AND pgd=$3', [Date.now(), c.ky, pgd]);
  });
  if (ok.length) await nk(q.ten, 'Lưu số liệu' + (c.cur ? '' : ' (kỳ ' + c.nhan + ')'), pgd, '', ok.length + ' ô');
  return { ok: ok.length, loi, data: await layDuLieu(token, undefined, kyIn) };
}

/* ---------- tổng quan ---------- */
async function tongHop(token, kyIn) {
  const q = await quyen(token), c = await chonKy(kyIn), all = await nap(c), kq = {}, cdt = {};
  q.scope.forEach((p) => { kq[p] = { pgd: p, last: '', b: {}, cd: [] }; cdt[p] = { m: {}, ds: [] }; });
  CFG.forEach((b) => {
    const iSt = b.cols.find((x) => x.t === 's').c;
    all[b.id].forEach((z) => {
      const p = z.d.pgd; if (!kq[p]) return;
      const x = kq[p].b[b.id] = kq[p].b[b.id] || { n: 0, dg: 0, cham: 0, chua: 0, trong: 0, luyke: 0, thang: 0 };
      x.n++; const s = z.o[iSt];
      if (s === 'Đã gửi BC') x.dg++; else if (s === 'Gửi BC chậm') x.cham++; else if (s === 'Chưa gửi BC') x.chua++; else x.trong++;
      const lk = Number(z.o[TONG_COL[b.id][0]]) || 0, th = Number(z.o[TONG_COL[b.id][1]]) || 0; x.luyke += lk; x.thang += th;
      const ten = z.d.b, m = cdt[p];
      let e = m.m[ten]; if (!e) { e = m.m[ten] = { t: ten, k: z.d.sec.replace(/^[IVX]+\s*-\s*/, ''), lk: 0, th: 0 }; m.ds.push(ten); }
      e.lk += lk; e.th += th;
    });
  });
  const tt = await docTT(c.ky);
  return { list: q.scope.map((p) => { const o = kq[p]; o.cd = cdt[p].ds.map((t) => cdt[p].m[t]); o.last = tt[p].luu_luc ? C.dinhDang(tt[p].luu_luc, 'dd/MM HH:mm') : ''; return o; }), vt: q.vt, ky: c.nhan };
}

/* ---------- làm tròn, chốt kỳ ---------- */
async function lamTron(token) {
  const q = await quyen(token); if (q.vt !== 'TH') throw E('Chỉ cán bộ tổng hợp được làm tròn số liệu.');
  const k = await docKy(), r = await db().q('SELECT COUNT(*) AS n FROM cells WHERE ky=$1 AND t IS NULL AND n IS NOT NULL AND n<>ROUND(n)', [k.ky]);
  await db().q('UPDATE cells SET n=ROUND(n) WHERE ky=$1 AND t IS NULL AND n IS NOT NULL AND n<>ROUND(n)', [k.ky]);
  await nk(q.ten, 'Làm tròn', 'Số lũy kế về triệu đồng', '', r[0].n + ' ô');
  return { dem: Number(r[0].n) };
}
async function chotKy(token) {
  const q = await quyen(token); if (q.vt !== 'TH') throw E('Chỉ cán bộ tổng hợp được chốt kỳ.');
  const k = await docKy(), st = await struct(), per = await luyKeDen(k.ky, k.goc), moi = C.kySau(k.ky);
  await db().tx(async (t) => {
    // ghi cố định lũy kế của kỳ vừa chốt cho mọi dòng (để sửa kỳ cũ không làm đổi lũy kế các kỳ sau)
    for (const b of CFG) for (const d of st.rows[b.id]) for (const col of b.cc.lk)
      await t.q('INSERT INTO cells (ky,bid,r,c,n,t) VALUES ($1,$2,$3,$4,$5,NULL) ON CONFLICT (ky,bid,r,c) DO NOTHING', [k.ky, b.id, d.r, col, lkRow(per, k.ky, k.goc, b.id, d.r, col)]);
    await t.q("UPDATE kv SET v=$1 WHERE k='ky'", [moi]); kyCache = null;
  });
  await ensureStatus(moi);
  await nk(q.ten, 'Chốt kỳ', k.nhan + ' → ' + C.kyNhan(moi), '', '');
  return trangThai(token);
}

module.exports = { duyet, init, dsTaiKhoan, dangNhap, quyen, luuNguoiKy, layDuLieu, luu, trangThai, datHan, guiBaoCao, thuHoi, deNghiSua, tiepNhan, chuyenTra, nopTongHop, tongHop, lamTron, chotKy,
  _: { nap, struct, docKy, dsKy, chonKy, docTT, docHan, E, db, nk, resetStruct: () => { STRUCT = null; } } };
