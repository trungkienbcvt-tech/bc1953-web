'use strict';
// Tải số liệu THBC theo mẫu Thông tư 37 (Biểu 01b/TTKHN: báo cáo kết quả thanh toán vốn đầu tư công, theo từng KBNN / phòng giao dịch, từng mã dự án).
// Một file → hai bảng đối chiếu: THBC của BC 1953 (lũy kế) và THBC của BC đánh giá KPI (kéo dài / năm × thanh toán KLHT / tạm ứng).
// Cách làm: cộng số liệu theo mã dự án trong từng khối KBNN, tra danh mục dự án để biết chủ đầu tư, rồi gộp theo (chủ đầu tư, phòng giao dịch).
const L = require('./logic');
const C = require('./common');
const BT = require('./bieutong');
const K = require('./kpi');
const M = require('./danhmuc');
const bulk = require('./bulk');
const { docXlsx } = require('./xlsxread');
const { E, db, nk, chonKy } = L._;
const n0 = (x) => (typeof x === 'number' && isFinite(x) ? x : 0);
const r3 = (x) => Math.round((Number(x) || 0) * 1000) / 1000;
const nf = (x) => String(x == null ? '' : x).normalize('NFC');
const NUL = '(Chưa xác định chủ đầu tư)';

function phanTich(rows) {
  const dau = nf(rows.slice(0, 12).map((r) => (r || []).filter((x) => x != null).join(' ')).join(' '));
  if (!/01b\/TTKHN/i.test(dau) && !/Mã số dự án/i.test(rows.slice(0, 12).map((r) => (r || []).map(nf).join(' ')).join(' '))) throw E('File không đúng mẫu TT37: cần Biểu 01b/TTKHN (Báo cáo kết quả thanh toán vốn đầu tư công) có cột "Mã số dự án đầu tư".');
  let h = -1; for (let i = 0; i < Math.min(rows.length, 15); i++) if ((rows[i] || []).some((x) => /^Lũy\s*kế\s*vốn\s*thanh\s*toán/i.test(nf(x)))) { h = i; break; }
  if (h < 0) throw E('Không thấy cột "Lũy kế vốn thanh toán từ đầu năm" trong tiêu đề.');
  const c0 = rows[h].findIndex((x) => /^Lũy\s*kế\s*vốn\s*thanh\s*toán/i.test(nf(x)));
  const cMa = rows[h].findIndex((x) => /^Mã\s*số\s*dự\s*án/i.test(nf(x))); if (cMa < 0) throw E('Không thấy cột "Mã số dự án đầu tư".');
  const dv = (/Đơn vị\s*(?:tính)?\s*:\s*([^\s,;]+(?:\s+đồng)?)/i.exec(dau) || [])[1] || 'triệu đồng', dl = dv.toLowerCase();
  const heSo = /^triệu/.test(dl) ? 1 : (/^nghìn|^ngàn/.test(dl) ? 1e-3 : (/^đồng/.test(dl) ? 1e-6 : 0));
  if (!heSo) throw E('Không nhận ra đơn vị tính (' + dv + ').');
  const nm = /đến ngày\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(dau), ngay = nm ? nm[3] + '-' + String(nm[2]).padStart(2, '0') + '-' + String(nm[1]).padStart(2, '0') : '';
  // các cột: [lũy kế tổng, kéo dài: tổng, kéo dài: TT KLHT, kéo dài: tạm ứng, năm: tổng, năm: TT KLHT, năm: tạm ứng]
  const cot = [c0, c0 + 2, c0 + 3, c0 + 5, c0 + 6];   // lk, kd_tt, kd_tu, n_tt, n_tu
  const khoi = [], loi = []; let cur = null, boQua = false;
  const tong = (r) => cot.map((j) => n0(r[j]) * heSo);
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] || [], a = nf(r[0]).trim(), b = nf(r[1]).trim();
    if (/^\d{4}$/.test(a) && /KBNN/i.test(b)) {
      const pg = /Nghiệp vụ 2/i.test(b) ? 'Phòng Nghiệp vụ 2' : ((/PGD\s*(?:số)?\s*(\d+)/i.exec(b) || [])[1] ? 'Phòng giao dịch ' + (/PGD\s*(?:số)?\s*(\d+)/i.exec(b))[1] : '');
      if (!C.DS_PGD.includes(pg)) { loi.push('Dòng ' + (i + 1) + ': không nhận ra đơn vị "' + b + '"'); cur = null; continue; }
      cur = { ma: a, pgd: pg, tong: tong(r), da: {}, dongThuc: 0 }; khoi.push(cur); boQua = false; continue;
    }
    if (!cur) continue;
    const ma = nf(r[cMa]).trim();
    if (!ma) { if (b) boQua = /ghi thu/i.test(b) && !/^trong đó/i.test(b); continue; }   // dòng tiêu đề nhóm; mục "ghi thu, ghi chi" chỉ lặp lại số của mục "trong đó"
    if (boQua) continue;
    const v = tong(r), e = cur.da[ma] = cur.da[ma] || { ma, ten: b.replace(/^\S+\s+-\s+/, ''), v: [0, 0, 0, 0, 0] };
    v.forEach((x, k) => { e.v[k] += x; }); cur.dongThuc++;
  }
  if (!khoi.length) throw E('Không đọc được khối KBNN nào (dòng có mã 4 chữ số và tên "KBNN Khu vực VIII…").');
  const lech = khoi.map((k) => { const s = [0, 0, 0, 0, 0]; Object.values(k.da).forEach((x) => x.v.forEach((y, j) => { s[j] += y; })); return { pgd: k.pgd, lech: Math.round((s[0] - k.tong[0]) * 1000) / 1000, tongFile: k.tong[0] }; });
  return { khoi, ngay, donVi: dv, lech, loi };
}

// Gán chủ đầu tư theo danh mục dự án
async function ganCdt(kq) {
  const bd = {}; (await M._banDo()).forEach((x) => { bd[String(x[0]).trim()] = { ten_da: x[1] || '', cdt: x[2] || '', cdt2: x[3] || '', kbnn: x[4] || '' }; });
  const ci = await M._ctInfo(), chuan = new Set(ci.ten);
  const dong = {}, chuaKhop = [], cdtLa = {}; let lechKb = 0, soDa = 0;
  for (const k of kq.khoi) for (const x of Object.values(k.da)) {
    if (!x.v.some((y) => Math.abs(y) > 1e-9)) continue;     // chỉ dự án có số liệu phát sinh
    soDa++;
    const d = bd[x.ma];
    if (!d || !d.cdt) { chuaKhop.push({ ma: x.ma, ten: x.ten, pgd: k.pgd, lk: x.v[0], lyDo: d ? 'Danh mục chưa có chủ đầu tư' : 'Chưa có trong danh mục dự án' }); continue; }
    if (!chuan.has(d.cdt)) cdtLa[d.cdt] = (cdtLa[d.cdt] || 0) + 1;
    if (d.kbnn && d.kbnn.replace('giao dịch số ', 'giao dịch ') !== k.pgd) lechKb++;
    const khoa = BT.chuan(d.cdt) + '|' + k.pgd, e = dong[khoa] = dong[khoa] || { khoa, ten: d.cdt, pgd: k.pgd, v: [0, 0, 0, 0, 0], so: 0 };
    x.v.forEach((y, j) => { e.v[j] += y; }); e.so++;
  }
  chuaKhop.sort((a, b) => Math.abs(b.lk) - Math.abs(a.lk));
  return { dong: Object.values(dong), chuaKhop, cdtLa, lechKb, soDa };
}
const crypto = require('crypto'), GIU = 10;
const luuKv = (k, v) => db().q('INSERT INTO kv (k,v) VALUES ($1,$2) ON CONFLICT (k) DO UPDATE SET v=excluded.v', [k, v]);
// Lưu bản gốc (tối đa GIU file gần nhất, trùng nội dung thì chỉ cập nhật thông tin)
async function luuFile(q, ten, b64, kq) {
  const id = crypto.createHash('sha1').update(b64).digest('hex').substring(0, 12);
  await luuKv('tt37f:' + id, b64);
  await luuKv('tt37m:' + id, JSON.stringify({ id, ten: String(ten || '').substring(0, 120), luc: Date.now(), nguoi: q.ten, ngay: kq.ngay || '', kb: Math.round(b64.length * 0.75 / 1024) }));
  const ds = await dsFile(); for (const m of ds.slice(GIU)) { await db().q('DELETE FROM kv WHERE k IN ($1,$2)', ['tt37f:' + m.id, 'tt37m:' + m.id]); }
  return id;
}
async function dsFile() {
  const r = await db().q("SELECT v FROM kv WHERE k LIKE 'tt37m:%'"); const l = [];
  r.forEach((x) => { try { l.push(JSON.parse(x.v)); } catch (e) { /* bỏ qua */ } });
  return l.sort((a, b) => b.luc - a.luc);
}
async function layFile(b64, id) {
  if (b64) return b64;
  if (!id || !/^[0-9a-f]{12}$/.test(id)) throw E('Chưa chọn file.');
  const r = await db().q('SELECT v FROM kv WHERE k=$1', ['tt37f:' + id]); if (!r.length) throw E('Không tìm thấy file đã lưu (có thể đã bị xóa).');
  return r[0].v;
}
async function ds(token) { const q = await L.quyen(token); if (q.vt === 'PGD') throw E('Không có quyền.'); return { ds: await dsFile() }; }
async function xoa(token, id) {
  const q = await L.quyen(token); if (q.vt === 'PGD') throw E('Không có quyền.'); if (!/^[0-9a-f]{12}$/.test(String(id))) throw E('Mã file không hợp lệ.');
  await db().q('DELETE FROM kv WHERE k IN ($1,$2)', ['tt37f:' + id, 'tt37m:' + id]); return { ds: await dsFile() };
}
async function taiXuong(token, id) {
  const q = await L.quyen(token); if (q.vt === 'PGD') throw E('Không có quyền.');
  const b64 = await layFile('', id), m = (await dsFile()).find((x) => x.id === id) || {};
  return { name: m.ten || 'TT37.xlsx', b64, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
}
const docFile = (b64) => {
  b64 = String(b64 || ''); if (!b64) throw E('Chưa chọn file.'); if (b64.length > 12e6) throw E('File quá lớn (tối đa khoảng 8 MB).');
  let rows; try { rows = docXlsx(Buffer.from(b64, 'base64'), /BaoCao|01b|TT37/i); } catch (e) { throw E(e.message || 'Không đọc được file Excel.'); }
  return phanTich(rows);
};
const tomTat = (kq, g) => {
  const tk = g.dong.reduce((s, x) => s + x.v[0], 0), tf = kq.khoi.reduce((s, k) => s + k.tong[0], 0), ck = g.chuaKhop.reduce((s, x) => s + x.lk, 0);
  return { ngay: kq.ngay, donVi: kq.donVi, soKhoi: kq.khoi.length, soDuAn: g.soDa, soDong: g.dong.length, tongFile: Math.round(tf * 10) / 10, tongDaGan: Math.round(tk * 10) / 10,
    soChuaKhop: g.chuaKhop.length, tongChuaKhop: Math.round(ck * 10) / 10, chuaKhop: g.chuaKhop.slice(0, 300), cdtLa: Object.keys(g.cdtLa).map((t) => ({ ten: t, so: g.cdtLa[t] })), lechKbnn: g.lechKb,
    lechKhoi: kq.lech.filter((x) => Math.abs(x.lech) > 0.01), loi: kq.loi.slice(0, 10) };
};
async function xem(token, tenFile, b64, id) {
  const q = await L.quyen(token); if (q.vt === 'PGD') throw E('Chỉ Chuyên viên THBC hoặc cán bộ Nghiệp vụ 2 được tải số liệu THBC.');
  b64 = await layFile(b64, id); const kq = docFile(b64), g = await ganCdt(kq), r = tomTat(kq, g);
  r.id = id || await luuFile(q, tenFile, b64, kq); r.ds = await dsFile(); return r;
}
// So sánh thử: không ghi gì vào cơ sở dữ liệu, PGD không bị ảnh hưởng
async function soSanh(token, tenFile, b64, ky, id, ngay) {
  const q = await L.quyen(token); if (q.vt === 'PGD') throw E('Chỉ Chuyên viên THBC hoặc cán bộ Nghiệp vụ 2 được dùng chức năng này.');
  b64 = await layFile(b64, id); const kq = docFile(b64), g = await ganCdt(kq), bt = await BT.bieuTong(token, ky || undefined);
  const ht = {}; bt.rows.forEach((x) => { if (x.k === 'row' && x.ten && x.c) { const k = BT.chuan(x.ten) + '|' + x.c; ht[k] = ht[k] || { ten: x.ten, pgd: x.c, a: 0 }; ht[k].a += Number(x.lk) || 0; } });
  const m = {}; Object.keys(ht).forEach((k) => { m[k] = { ten: ht[k].ten, pgd: ht[k].pgd, ht: ht[k].a, tb: 0 }; });
  g.dong.forEach((d) => { const e = m[d.khoa] = m[d.khoa] || { ten: d.ten, pgd: d.pgd, ht: 0, tb: 0 }; e.tb += d.v[0]; });
  const rows = Object.values(m).map((e) => ({ ten: e.ten, pgd: e.pgd, ht: r3(e.ht), tb: r3(e.tb), lech: r3(e.ht - e.tb) })).filter((e) => e.ht || e.tb);
  rows.sort((a, b) => Math.abs(b.lech) - Math.abs(a.lech));
  const lechN = rows.filter((e) => Math.abs(e.lech) > 1).length;
  // BC KPI thử: số THBC trong file theo chủ đầu tư × phòng; so với mốc cùng ngày đã có (nếu có)
  const ng = /^\d{4}-\d{2}-\d{2}$/.test(String(ngay || '')) ? String(ngay) : kq.ngay, cu = {};
  const mocRow = (await db().q('SELECT id,chot FROM kpi_moc WHERE id=$1', [ng]))[0];
  if (mocRow) (await db().q('SELECT khoa,kd_tt,kd_tu,n_tt,n_tu FROM kpi_thbc WHERE moc=$1', [ng])).forEach((x) => { cu[x.khoa] = [x.kd_tt, x.kd_tu, x.n_tt, x.n_tu].map((v) => Number(v) || 0); });
  const km = {}; g.dong.forEach((d) => { km[d.khoa] = { ten: d.ten, pgd: d.pgd, v: d.v.slice(1).map(r3) }; });
  Object.keys(cu).forEach((k) => { if (!km[k]) { const e = m[k]; km[k] = { ten: e ? e.ten : k.split('|')[0], pgd: k.split('|')[1], v: [0, 0, 0, 0] }; } });
  const sm4 = (v) => v.reduce((s, y) => s + y, 0);
  const krows = Object.keys(km).map((k) => { const e = km[k], c = cu[k] || [0, 0, 0, 0]; return { ten: e.ten, pgd: e.pgd, v: e.v, tong: r3(sm4(e.v)), cu: c.map(r3), tongCu: r3(sm4(c)), lech: r3(sm4(c) - sm4(e.v)) }; }).filter((e) => e.tong || e.tongCu);
  krows.sort((a, b) => (mocRow ? Math.abs(b.lech) - Math.abs(a.lech) : b.tong - a.tong));
  const kpi = { ngay: ng, coMoc: !!mocRow, chot: !!(mocRow && mocRow.chot), soDong: krows.length, tong: r3(krows.reduce((s, e) => s + e.tong, 0)), tongCu: r3(krows.reduce((s, e) => s + e.tongCu, 0)), soLech: mocRow ? krows.filter((e) => Math.abs(e.lech) > 1).length : 0, tv: [0, 1, 2, 3].map((i) => r3(krows.reduce((s, e) => s + e.v[i], 0))), rows: krows.slice(0, 1500) };
  return { kpi, ky: bt.ky, ngay: kq.ngay, tongHt: r3(rows.reduce((s, e) => s + e.ht, 0)), tongTb: r3(rows.reduce((s, e) => s + e.tb, 0)), soDong: rows.length, soLech: lechN, soChuaKhop: g.chuaKhop.length, rows: rows.slice(0, 1500) };
}
async function ghi(token, o, tenFile, b64) {
  const q = await L.quyen(token); if (q.vt === 'PGD') throw E('Chỉ Chuyên viên THBC hoặc cán bộ Nghiệp vụ 2 được tải số liệu THBC.');
  o = o || {}; if (!o.thbc && !o.kpi) throw E('Chưa chọn nơi ghi số liệu (THBC 1953 hoặc THBC KPI).');
  b64 = await layFile(b64, o.id); const kq = docFile(b64), g = await ganCdt(kq), file = String(tenFile || '').substring(0, 120), kq2 = { ghi: [] };
  if (!g.dong.length) throw E('Không gán được chủ đầu tư cho dự án nào. Kiểm tra lại danh mục dự án.');
  if (o.thbc) {
    const c = await chonKy(o.ky), meta = { file: 'TT37 – ' + file, luc: Date.now(), nguoi: q.ten, dong: g.dong.length, loi: [] };
    await db().tx(async (t) => {
      await t.q('DELETE FROM thbc_cdt WHERE ky=$1', [c.ky]);
      await bulk(t, 'thbc_cdt', ['ky', 'khoa', 'ten', 'pgd', 'lk', 'th'], g.dong.map((x) => [c.ky, x.khoa, x.ten, x.pgd, r3(x.v[0]), null]));
      await t.q('INSERT INTO kv (k,v) VALUES ($1,$2) ON CONFLICT (k) DO UPDATE SET v=excluded.v', ['thbcc:' + c.ky, JSON.stringify(meta)]);
    });
    await nk(q.ten, 'Tải số liệu THBC theo TT37 (BC 1953)', c.ky, file, g.dong.length + ' dòng');
    kq2.ghi.push('BC 1953 kỳ ' + c.nhan);
  }
  if (o.kpi) {
    const ngay = String(o.ngay || kq.ngay || '').trim();
    await K.ghiMocTuFile(token, q, ngay, o.han, 'TT37 – ' + file, g.dong.map((x) => ({ khoa: x.khoa, ten: x.ten, pgd: x.pgd, v: [x.v[1], x.v[2], x.v[3], x.v[4]] })));
    kq2.ghi.push('BC đánh giá KPI mốc ' + ngay.split('-').reverse().join('/'));
  }
  return Object.assign(tomTat(kq, g), kq2);
}
module.exports = { xem, ghi, soSanh, ds, xoa, taiXuong, phanTich, _ganCdt: ganCdt, _luuFile: luuFile, _tomTat: tomTat };
