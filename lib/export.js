'use strict';
// In / xuất biểu: tạo mô hình bảng từ số liệu rồi xuất Excel (.xlsx) hoặc HTML để in PDF (Ctrl+P).
const C = require('./common');
const X = require('./xlsx');
const L = require('./logic');
const KHO = require('./kehoach');
const { CFG, byId, T, DS_PGD } = C, { E, nap, struct, chonKy, docTT, docHan, db } = L._;
const slug = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').replace(/\s+/g, '_').replace(/[^\w\-()]/g, '');
const fmtN = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN', { maximumFractionDigits: 0 });
const escH = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function header(b) {
  const n = b.cols.length, H = [[], [], []], span = (i, j) => { let k = j; const key = b.cols[j].lv.slice(0, i + 1).join('|'); while (k + 1 < n && b.cols[k + 1].lv.slice(0, i + 1).join('|') === key && b.cols[k + 1].lv[i] !== '') k++; return k - j + 1; };
  H[0].push({ v: 'STT', cs: 1, rs: 3 }, { v: 'Chủ đầu tư / xã, phường', cs: 1, rs: 3 });
  for (let i = 0; i < 3; i++) for (let j = 0; j < n;) {
    const lv = b.cols[j].lv; if (lv[i] === '' || lv[i] == null) { j++; continue; }
    const cs = span(i, j), depth = lv.filter((x) => x !== '' && x != null).length;
    H[i].push({ v: lv[i], cs, rs: depth === i + 1 ? 3 - i : 1 }); j += cs;
  }
  return H;
}
const sumCols = (b, rows) => b.cols.map((c) => (c.t === 's' || c.t === 'g') ? '' : rows.reduce((s, r) => s + (Number(r.o[c.c]) || 0), 0));
// rows: [{d,o}]  -> thân bảng
function body(b, rows, st, tatCa) {
  const out = [];
  (st.secs[b.id].length ? st.secs[b.id] : ['']).forEach((sec) => {
    const rr = rows.filter((z) => z.d.sec === sec);
    out.push({ k: 'sec', a: '', n: sec, v: sumCols(b, rr) });
    let par = null;
    rr.forEach((z) => {
      if (z.d.par && z.d.par !== par) { par = z.d.par; out.push({ k: 'par', a: '', n: par, v: sumCols(b, rr.filter((y) => y.d.par === par)) }); }
      if (!z.d.par) par = null;
      out.push({ k: 'row', a: z.d.a, n: z.d.bd + (tatCa ? ' – ' + z.d.pgd : ''), v: b.cols.map((c) => z.o[c.c] === undefined ? '' : z.o[c.c]) });
    });
  });
  out.push({ k: 'tot', a: '', n: tatCa ? 'TỔNG CỘNG TOÀN TỈNH' : 'TỔNG CỘNG CỦA PHÒNG', v: sumCols(b, rows) });
  return out;
}
function ngayChu(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')), d = m ? { y: +m[1], m: +m[2], d: +m[3] } : (() => { const n = new Date(Date.now() + 7 * 3600e3); return { y: n.getUTCFullYear(), m: n.getUTCMonth() + 1, d: n.getUTCDate() }; })();
  return 'Tuyên Quang, ngày ' + d.d + ' tháng ' + d.m + ' năm ' + d.y;
}
async function chanTrang(c, pgd) {
  const han = await docHan(c.ky), h = C.parseHan(han.pgd);
  if (!pgd) return 'In lúc ' + C.dinhDang(Date.now()) + ' | Hạn nộp báo cáo: ' + (h ? C.dinhDang(h) : 'chưa đặt') + ' | Biểu tổng hợp toàn tỉnh';
  const x = (await docTT(c.ky))[pgd];
  let s = 'In lúc ' + C.dinhDang(Date.now()) + ' | Hạn nộp báo cáo: ' + (h ? C.dinhDang(h) : 'chưa đặt') + ' | Trạng thái: ' + x.tt;
  if (x.gui && x.tt !== T.CHUA && x.tt !== T.TRA) s += ' (gửi lúc ' + C.dinhDang(x.gui) + ')';
  return s;
}
/* ---- dựng mô hình bảng ---- */
async function modelBieu(b, c, tap, tatCa, tieuDe) {
  const all = await nap(c), st = await struct(), rows = all[b.id].filter((z) => tap.includes(z.d.pgd));
  const cols = b.cols.map((x) => (b.cc.th.includes(x.c) ? Object.assign({}, x, { t: 'a' }) : x));
  return { title: tieuDe, ncol: 2 + b.cols.length, head: header(b), body: body(b, rows, st, tatCa), cols, widths: [6, 46].concat(b.cols.map((x) => x.t === 'g' ? 28 : x.t === 's' ? 16 : 15)) };
}
async function modelCdt(c, tap, tieuDe) {
  const all = await nap(c), m = {}, ds = [];
  CFG.forEach((b) => all[b.id].filter((z) => tap.includes(z.d.pgd)).forEach((z) => {
    const k = z.d.sec + '|' + z.d.b; let e = m[k]; if (!e) { e = m[k] = { t: z.d.b, k: z.d.sec.replace(/^[IVX]+\s*-\s*/, ''), lk: 0, th: 0 }; ds.push(k); }
    e.lk += Number(z.o[C.TONG_COL[b.id][0]]) || 0; e.th += Number(z.o[C.TONG_COL[b.id][1]]) || 0;
  }));
  const head = [[{ v: 'STT', cs: 1, rs: 1 }, { v: 'Chủ đầu tư / xã, phường', cs: 1, rs: 1 }, { v: 'Khối', cs: 1, rs: 1 }, { v: 'Lũy kế giải ngân', cs: 1, rs: 1 }, { v: 'Giải ngân trong tháng', cs: 1, rs: 1 }]];
  const bodyR = ds.map((k, i) => ({ k: 'row', a: i + 1, n: m[k].t, v: [m[k].k, m[k].lk, m[k].th], t: ['g', 'n', 'n'] }));
  const L1 = ds.reduce((s, k) => s + m[k].lk, 0), T1 = ds.reduce((s, k) => s + m[k].th, 0);
  bodyR.push({ k: 'tot', a: '', n: 'TỔNG CỘNG (' + ds.length + ' chủ đầu tư)', v: ['', L1, T1], t: ['g', 'n', 'n'] });
  return { title: tieuDe, ncol: 5, head, body: bodyR, cols: [{ t: 'g' }, { t: 'n' }, { t: 'n' }], widths: [6, 60, 18, 18, 18] };
}
/* ---- kết xuất ---- */
function toXlsx(mo, sig, foot, ten) {
  const n = mo.ncol, rows = [], merges = [], ref = (r, c) => X.colName(c) + (r + 1);
  const put = (r, c, cell) => { (rows[r] = rows[r] || [])[c] = cell; };
  mo.title.forEach((t, i) => { put(i, 0, { v: t, s: i === 0 ? 1 : (i === 2 ? 6 : (/^KỲ/.test(t) ? 11 : 11)) }); if (n > 1) merges.push(ref(i, 0) + ':' + ref(i, n - 1)); });
  let r0 = mo.title.length + 1;
  const occ = {};
  mo.head.forEach((hr, hi) => { let c = 0; hr.forEach((h) => { while (occ[(r0 + hi) + ',' + c]) c++; for (let a = 0; a < h.rs; a++) for (let b2 = 0; b2 < h.cs; b2++) { occ[(r0 + hi + a) + ',' + (c + b2)] = 1; put(r0 + hi + a, c + b2, { v: a === 0 && b2 === 0 ? h.v : '', s: 2 }); } if (h.rs > 1 || h.cs > 1) merges.push(ref(r0 + hi, c) + ':' + ref(r0 + hi + h.rs - 1, c + h.cs - 1)); c += h.cs; }); });
  r0 += mo.head.length === 1 ? 1 : 3;
  mo.body.forEach((x, i) => {
    const r = r0 + i, sec = x.k === 'sec', par = x.k === 'par', tot = x.k === 'tot';
    put(r, 0, { v: x.a, s: sec ? 8 : (par || tot ? 9 : 3) }); put(r, 1, { v: x.n, s: sec ? 8 : (par || tot ? 9 : 3) });
    x.v.forEach((v, j) => { const t = (x.t && x.t[j]) || (mo.cols[j] && mo.cols[j].t); const num = typeof v === 'number' && t !== 's' && t !== 'g'; put(r, 2 + j, { v: v === '' ? '' : v, s: sec ? 8 : (num ? (par || tot ? 10 : 4) : (par || tot ? 9 : 3)) }); });
  });
  let r = r0 + mo.body.length + 1;
  foot.forEach((f) => { put(r, 0, { v: f, s: 7 }); r++; });
  if (sig) {
    r++; put(r, Math.max(n - 3, 0), { v: sig.ngay, s: 7 }); r++;
    const k = Math.max(Math.floor(n / 3), 2); [[0, 'NGƯỜI LẬP BIỂU', sig.lap], [Math.floor(n / 2) - 1, 'KẾ TOÁN TRƯỞNG', sig.ktt], [Math.max(n - 3, 0), sig.tpChucVu || 'TRƯỞNG PHÒNG', sig.tp]].forEach(([c, a, b2]) => { if (a === 'KẾ TOÁN TRƯỞNG' && !sig.coKtt) return; put(r, c, { v: a, s: 11 }); put(r + 4, c, { v: b2 || '', s: 11 }); });
  }
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  const buf = X.write({ name: ten, cols: mo.widths, rows, merges });
  return buf;
}
function toHtml(mo, sig, foot, ten) {
  let h = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escH(ten)}</title><style>
@page{size:A4 landscape;margin:10mm}body{font:12px 'Times New Roman',serif;color:#000}h1{font-size:15px;text-align:center;margin:4px 0}p.c{text-align:center;margin:2px 0}
table{border-collapse:collapse;width:100%;margin-top:8px}th,td{border:1px solid #000;padding:3px 5px;vertical-align:middle}th{background:#f3d9dd;text-align:center}
td.n{text-align:right;font-variant-numeric:tabular-nums}tr.sec td{background:#8b2335;color:#fff;font-weight:700}tr.par td{background:#faedef;font-weight:700}tr.tot td{background:#f3d9dd;font-weight:700}
.f{margin-top:8px;font-style:italic;font-size:11px}.sg{display:flex;justify-content:space-between;margin-top:14px;text-align:center}.sg div{min-width:180px}.sg b{display:block;margin-bottom:60px}
@media print{.np{display:none}}</style></head><body><div class="np" style="margin-bottom:8px;font:14px sans-serif">Bấm <b>Ctrl+P</b> để in hoặc lưu PDF.</div>`;
  mo.title.forEach((t, i) => { h += i === 2 ? `<h1>${escH(t)}</h1>` : `<p class="c"${i < 2 ? ' style="font-weight:700"' : ''}>${escH(t)}</p>`; });
  h += '<table><thead>';
  mo.head.forEach((hr) => { h += '<tr>' + hr.map((c) => `<th colspan="${c.cs}" rowspan="${c.rs}">${escH(c.v)}</th>`).join('') + '</tr>'; });
  h += '</thead><tbody>';
  mo.body.forEach((x) => {
    h += `<tr class="${x.k}"><td>${escH(x.a)}</td><td>${escH(x.n)}</td>` + x.v.map((v, j) => { const t = (x.t && x.t[j]) || (mo.cols[j] && mo.cols[j].t); const num = typeof v === 'number' && t !== 's' && t !== 'g'; return `<td${num ? ' class="n"' : ''}>${num ? fmtN(v) : escH(v)}</td>`; }).join('') + '</tr>';
  });
  h += '</tbody></table>' + foot.map((f) => `<div class="f">${escH(f)}</div>`).join('');
  if (sig) h += `<p class="c" style="text-align:right;margin-top:10px"><i>${escH(sig.ngay)}</i></p><div class="sg"><div><b>NGƯỜI LẬP BIỂU</b>${escH(sig.lap)}</div>${sig.coKtt ? `<div><b>KẾ TOÁN TRƯỞNG</b>${escH(sig.ktt)}</div>` : ''}<div><b>${sig.tpChucVu || 'TRƯỞNG PHÒNG'}</b>${escH(sig.tp)}</div></div>`;
  return h + '<script>setTimeout(function(){window.print()},400)</script></body></html>';
}
function dongGoi(mo, sig, foot, dinhDang, tenFile) {
  if (dinhDang === 'xlsx') return { name: tenFile + '.xlsx', b64: toXlsx(mo, sig, foot, tenFile.substring(0, 30)).toString('base64'), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  return { name: tenFile + '.html', b64: Buffer.from(toHtml(mo, sig, foot, tenFile), 'utf8').toString('base64'), mime: 'text/html' };
}
async function tieuDeBieu(b, c) {
  const td = require('./tieude.json')[b.id] || [];
  return td.filter((t) => !/^\d+$/.test(t) && t.indexOf('(Kèm') < 0).map((t) => /^KỲ BÁO CÁO/.test(t) ? 'KỲ BÁO CÁO: THÁNG ' + c.nhan : t);
}
async function xuatBieu(token, bieu, ngay, xem, dinhDang, kyIn) {
  const q = await L.quyen(token, xem), c = await chonKy(kyIn), pgd = q.pgd;
  const sig = { ngay: ngayChu(ngay), lap: q.tk.lap || '', ktt: q.tk.ktt || '', tp: q.tk.tp || '', coKtt: q.vt === 'PGD' && pgd.indexOf('Nghiệp vụ') < 0 };
  if (q.vt !== 'PGD') { const a = (await db().q('SELECT * FROM accounts WHERE ten=$1', [pgd]))[0]; if (a) { sig.lap = a.lap || ''; sig.ktt = a.ktt || ''; sig.tp = a.tp || ''; sig.coKtt = pgd.indexOf('Nghiệp vụ') < 0; } }
  const foot = [await chanTrang(c, pgd)];
  if (bieu === 'BCĐT') {
    const mo = await modelCdt(c, [pgd], ['KHO BẠC NHÀ NƯỚC', 'KHO BẠC NHÀ NƯỚC KHU VỰC VIII', 'TÌNH HÌNH GIẢI NGÂN THEO CHỦ ĐẦU TƯ – ' + pgd.toUpperCase(), 'KỲ BÁO CÁO: THÁNG ' + c.nhan]);
    return dongGoi(mo, sig, foot, dinhDang, 'BCDT_' + slug(pgd));
  }
  const bid = C.BIEU_IN[bieu]; if (!bid) throw E('Biểu không hợp lệ');
  const b = byId[bid], mo = await modelBieu(b, c, [pgd], false, await tieuDeBieu(b, c));
  mo.title.push(pgd.toUpperCase());
  return dongGoi(mo, sig, foot, dinhDang, slug(bieu) + '_' + slug(pgd));
}
async function xuatTong(token, id, dinhDang, kyIn) {
  const q = await L.quyen(token); if (q.vt !== 'TH') throw E('Chỉ cán bộ tổng hợp được in biểu toàn tỉnh.');
  const c = await chonKy(kyIn), foot = [await chanTrang(c, '')];
  if (id === 'cdt') return dongGoi(await modelCdt(c, DS_PGD, ['KHO BẠC NHÀ NƯỚC', 'KHO BẠC NHÀ NƯỚC KHU VỰC VIII', 'TÌNH HÌNH GIẢI NGÂN THEO CHỦ ĐẦU TƯ – TOÀN TỈNH', 'KỲ BÁO CÁO: THÁNG ' + c.nhan]), null, foot, dinhDang, 'Tong_hop_cdt');
  const b = byId[id]; if (!b) throw E('Biểu không hợp lệ');
  return dongGoi(await modelBieu(b, c, DS_PGD, true, await tieuDeBieu(b, c)), null, foot, dinhDang, 'Tong_hop_' + id);
}
async function xuatThongKe(token, dinhDang, kyIn) {
  const q = await L.quyen(token); if (q.vt === 'PGD') throw E('Không có quyền.');
  const t = await L.trangThai(token, kyIn), c = await chonKy(kyIn);
  const head = [['STT', 'Đơn vị', 'Trạng thái', 'Gửi lúc', 'Tiếp nhận lúc', 'Nộp tổng hợp lúc', 'Số lần bị trả', 'Chậm / quá hạn', 'Ghi chú (lý do trả)'].map((v) => ({ v, cs: 1, rs: 1 }))];
  const bd = t.list.map((x, i) => { const k = []; if (x.cham) k.push('Gửi chậm ' + x.tre); if (x.quaHan) k.push('Quá hạn chưa gửi'); if (x.nv2Cham) k.push('NV2 nộp chậm'); if (x.nv2QuaHan && !x.nv2Cham) k.push('Quá hạn nộp tổng hợp'); return { k: 'row', a: i + 1, n: x.pgd, v: [x.tt, x.gui, x.nhan, x.nop, x.soTra, k.join('; '), x.lyDo], t: ['g', 'g', 'g', 'g', 'g', 'g', 'g'] }; });
  const mo = { title: ['KHO BẠC NHÀ NƯỚC KHU VỰC VIII', 'THỐNG KÊ TÌNH HÌNH NỘP BÁO CÁO – KỲ THÁNG ' + c.nhan, 'Hạn PGD gửi: ' + (t.hanHienThi.pgd || 'chưa đặt') + '   |   Hạn Nghiệp vụ 2 nộp tổng hợp: ' + (t.hanHienThi.nv2 || 'chưa đặt')], ncol: 9, head, body: bd, cols: [], widths: [6, 28, 16, 17, 17, 17, 10, 30, 36] };
  return dongGoi(mo, null, ['In lúc ' + C.dinhDang(Date.now())], dinhDang, 'Thong_ke_nop_bao_cao');
}
async function xuatKeHoach(token, opt, dinhDang) {
  const { nguon, rows } = await KHO.khTatCa(token, opt), tong = {}; let t = 0;
  rows.forEach((r) => { t += r.tong; Object.keys(r.von).forEach((k) => { tong[k] = (tong[k] || 0) + r.von[k]; }); });
  const th = ['STT', 'Tên dự án', 'Mã dự án', 'Chủ đầu tư', 'Mục (QĐ 2623)'].concat(nguon.map((n) => n.code), ['TỔNG']).map((v) => ({ v, cs: 1, rs: 1 }));
  const bd = rows.map((r, i) => ({ k: 'row', a: i + 1, n: r.ten, v: [r.ma, r.cdt, r.muc].concat(nguon.map((n) => r.von[n.id] || 0), [r.tong]), t: ['g', 'g', 'g'] }));
  bd.push({ k: 'tot', a: '', n: 'TỔNG CỘNG (' + rows.length + ' dự án)', v: ['', '', ''].concat(nguon.map((n) => tong[n.id] || 0), [t]), t: ['g', 'g', 'g'] });
  const mo = { title: ['KHO BẠC NHÀ NƯỚC KHU VỰC VIII', '', 'KẾ HOẠCH VỐN ĐẦU TƯ CÔNG NGUỒN NGÂN SÁCH ĐỊA PHƯƠNG 2026-2030 (QĐ 2623/QĐ-UBND)', 'Đơn vị: triệu đồng'], ncol: 2 + th.length - 2 + 0, head: [th], body: bd, cols: [], widths: [6, 60, 12, 40, 34].concat(nguon.map(() => 14), [16]) };
  mo.ncol = th.length;
  return dongGoi(mo, null, ['In lúc ' + C.dinhDang(Date.now())], dinhDang, 'Ke_hoach_von_2623');
}
module.exports = { xuatBieu, xuatTong, xuatThongKe, xuatKeHoach };
