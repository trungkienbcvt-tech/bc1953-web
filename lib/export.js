'use strict';
// In / xuất biểu: tạo mô hình bảng từ số liệu rồi xuất Excel (.xlsx) hoặc HTML để in PDF (Ctrl+P).
const C = require('./common');
const X = require('./xlsx');
const L = require('./logic');
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
  const out = [{ k: 'tot', a: '', n: 'TỔNG CỘNG', v: sumCols(b, rows) }];
  if (!tatCa) {   // biểu của một phòng: chỉ tên chủ đầu tư (đúng tên theo biểu đối chiếu THBC), không chia khu vực; chỉ có dòng nhóm khi một đơn vị chủ quản có từ 2 đơn vị trở lên
    const dem = {}; rows.forEach((z) => { if (z.d.par) dem[z.d.par] = (dem[z.d.par] || 0) + 1; });
    let par = null, stt = 0;
    rows.forEach((z) => {
      if (z.d.par && z.d.par !== par) { par = z.d.par; if (dem[par] > 1) out.push({ k: 'par', a: '', n: par, v: sumCols(b, rows.filter((y) => y.d.par === par)) }); }
      if (!z.d.par) par = null;
      out.push({ k: 'row', a: ++stt, n: z.d.bd, v: b.cols.map((c) => z.o[c.c] === undefined ? '' : z.o[c.c]) });
    });
    return out;
  }
  (st.secs[b.id].length ? st.secs[b.id] : ['']).forEach((sec) => {
    const rr = rows.filter((z) => z.d.sec === sec);
    out.push({ k: 'sec', a: '', n: sec, v: sumCols(b, rr) });
    let par = null;
    rr.forEach((z) => {
      if (z.d.par && z.d.par !== par) { par = z.d.par; out.push({ k: 'par', a: '', n: par, v: sumCols(b, rr.filter((y) => y.d.par === par)) }); }
      if (!z.d.par) par = null;
      out.push({ k: 'row', a: z.d.a, n: z.d.bd + ' – ' + z.d.pgd, v: b.cols.map((c) => z.o[c.c] === undefined ? '' : z.o[c.c]) });
    });
  });
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
  return { dv: true, bieu: b.title, title: tieuDe, ncol: 2 + b.cols.length, head: header(b), body: body(b, rows, st, tatCa), cols, widths: [6, 58].concat(b.cols.map((x) => x.t === 'g' ? 38 : x.t === 's' ? 12 : 14)) };
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
  bodyR.unshift({ k: 'tot', a: '', n: 'TỔNG CỘNG (' + ds.length + ' chủ đầu tư)', v: ['', L1, T1], t: ['g', 'n', 'n'] });
  return { dv: true, title: tieuDe, ncol: 5, head, body: bodyR, cols: [{ t: 'g' }, { t: 'n' }, { t: 'n' }], widths: [6, 60, 18, 18, 18] };
}
/* ---- kết xuất ---- */
function toXlsx(mo, sig, foot, ten) {
  const n = mo.ncol, rows = [], merges = [], ref = (r, c) => X.colName(c) + (r + 1);
  const put = (r, c, cell) => { (rows[r] = rows[r] || [])[c] = cell; };
  // Thể thức văn bản: tên cơ quan góc trái, tiêu đề ở giữa, "Đơn vị: Triệu đồng" góc phải phía trên bảng
  const cw = Math.min(2, n), tw = Math.max(1, n); let r = 0;
  if (mo.bieu) { const c0 = Math.max(n - 3, 0); for (let c = c0; c < n; c++) put(0, c, { v: c === c0 ? mo.bieu : '', s: 16 }); if (n - 1 > c0) merges.push(ref(0, c0) + ':' + ref(0, n - 1)); }
  (mo.co || []).forEach((t, i) => { put(r, 0, { v: t, s: i === (mo.co.length - 1) ? 11 : 13 }); if (cw > 1) merges.push(ref(r, 0) + ':' + ref(r, cw - 1)); r++; });
  r++;
  mo.title.forEach((t, i) => { put(r, 0, { v: t, s: i === 0 ? 6 : 11 }); if (tw > 1) merges.push(ref(r, 0) + ':' + ref(r, tw - 1)); r++; });
  r++;
  if (mo.dv) { const c0 = Math.max(n - 3, 0); put(r, c0, { v: 'Đơn vị: Triệu đồng', s: 12 }); if (n - 1 > c0) merges.push(ref(r, c0) + ':' + ref(r, n - 1)); r++; }
  let r0 = r;
  const occ = {};
  mo.head.forEach((hr, hi) => { let c = 0; hr.forEach((h) => { while (occ[(r0 + hi) + ',' + c]) c++; for (let a = 0; a < h.rs; a++) for (let b2 = 0; b2 < h.cs; b2++) { occ[(r0 + hi + a) + ',' + (c + b2)] = 1; put(r0 + hi + a, c + b2, { v: a === 0 && b2 === 0 ? h.v : '', s: 2 }); } if (h.rs > 1 || h.cs > 1) merges.push(ref(r0 + hi, c) + ':' + ref(r0 + hi + h.rs - 1, c + h.cs - 1)); c += h.cs; }); });
  const hr0 = r0 + 1; r0 += mo.head.length === 1 ? 1 : 3; const titleRows = [hr0, r0];
  mo.body.forEach((x, i) => {
    const r = r0 + i, sec = x.k === 'sec', par = x.k === 'par', tot = x.k === 'tot';
    put(r, 0, { v: x.a, s: sec ? 8 : (par || tot ? 9 : 3) }); put(r, 1, { v: x.n, s: sec ? 8 : (par || tot ? 9 : 3) });
    x.v.forEach((v, j) => { const t = (x.t && x.t[j]) || (mo.cols[j] && mo.cols[j].t); const num = typeof v === 'number' && t !== 's' && t !== 'g'; put(r, 2 + j, { v: v === '' ? '' : v, s: sec ? (num ? 15 : 8) : (num ? (par || tot ? 10 : 4) : (par || tot ? 9 : 3)) }); });
  });
  r = r0 + mo.body.length + 1;
  foot.forEach((f) => { put(r, 0, { v: f, s: 7 }); r++; });
  if (sig) {   // chữ ký: mỗi chức danh một ô gộp trải nhiều cột → không làm giãn cột số liệu
    const wd = (mo.widths || []).slice(0, n); while (wd.length < n) wd.push(12);
    const tot = wd.reduce((x, y) => x + y, 0), blocks = [['NGƯỜI LẬP BIỂU', sig.lap, 'LAP']];
    if (sig.coKtt) blocks.push(['KẾ TOÁN TRƯỞNG', sig.ktt, 'KTT']);
    blocks.push([sig.tpChucVu || 'TRƯỞNG PHÒNG', sig.tp, 'TP']);
    const seg = []; let acc = 0, ci = 0;
    for (let i = 0; i < blocks.length; i++) { const lim = tot * (i + 1) / blocks.length, c0 = ci; while (ci < n && (acc + wd[ci] / 2 <= lim || i === blocks.length - 1)) { acc += wd[ci]; ci++; } seg.push([c0, Math.max(ci - 1, c0)]); }
    const span = (row, [c0, c1], cell) => { put(row, c0, cell); for (let c = c0 + 1; c <= c1; c++) put(row, c, { v: '', s: cell.s }); if (c1 > c0) merges.push(ref(row, c0) + ':' + ref(row, c1)); };
    r++; const last = seg[seg.length - 1]; span(r, last, { v: sig.ngay, s: 14 }); r++;
    blocks.forEach((bl, i) => { span(r, seg[i], { v: bl[0], s: 11 }); if (sig.da && sig.da[bl[2]]) span(r + 2, seg[i], { v: '(đã ký)', s: 14 }); span(r + 5, seg[i], { v: bl[1] || '', s: 11 }); });
    r += 6;
  }
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  const buf = X.write({ name: ten, cols: mo.widths, rows, merges, titleRows });
  return buf;
}
function toHtml(mo, sig, foot, ten) {
  let h = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>&nbsp;</title><style>
@page{size:A4 landscape;margin:12mm 10mm 14mm}.bn{float:right;font-weight:700;font-size:13px;margin:0 0 4px 10px}body{font:12px 'Times New Roman',serif;color:#000;margin:0}h1{font-size:15px;text-align:center;margin:10px 0 2px;text-transform:uppercase}p.c{text-align:center;margin:2px 0}.co{width:46%;text-align:center;line-height:1.35}.co p{margin:0;text-transform:uppercase}.co p.l{font-weight:700}.co p.l:after{content:'';display:block;width:60px;border-top:1px solid #000;margin:2px auto 0}.dv{text-align:right;font-style:italic;margin:6px 0 -4px}thead{display:table-header-group}tr{page-break-inside:avoid}
table{border-collapse:collapse;width:100%;margin-top:8px;table-layout:fixed}th,td{border:1px solid #000;padding:2px 4px;vertical-align:middle;word-wrap:break-word;overflow-wrap:anywhere;font-size:11px}th{font-size:10.5px}td:nth-child(2){text-align:left}th{background:#f3d9dd;text-align:center}
td.n{text-align:right;font-variant-numeric:tabular-nums}tr.sec td{background:#8b2335;color:#fff;font-weight:700}tr.par td{background:#faedef;font-weight:700}tr.tot td{background:#f3d9dd;font-weight:700}
.f{margin-top:8px;font-style:italic;font-size:11px}.sg{display:flex;justify-content:space-between;margin-top:14px;text-align:center}.sg div{min-width:180px}.sg b{display:block;margin-bottom:60px}.sg b.k{margin-bottom:0}.sg i.k{display:block;height:60px;line-height:60px;color:#15803d;font-weight:700}
@media print{.np{display:none}}</style></head><body><div class="np" style="margin-bottom:8px;font:14px sans-serif">Bấm <b>Ctrl+P</b> để in hoặc lưu PDF.</div>`;
  if (mo.bieu) h += `<div class="bn">${escH(mo.bieu)}</div>`;
  if ((mo.co || []).length) h += '<div class="co">' + mo.co.map((t, i) => `<p${i === mo.co.length - 1 ? ' class="l"' : ''}>${escH(t)}</p>`).join('') + '</div>';
  mo.title.forEach((t, i) => { h += i === 0 ? `<h1>${escH(t)}</h1>` : `<p class="c" style="font-weight:700">${escH(t)}</p>`; });
  if (mo.dv) h += '<div class="dv">Đơn vị: Triệu đồng</div>';
  const wd = (mo.widths || []).slice(0, mo.ncol), sw = wd.reduce((x, y) => x + y, 0);
  h += '<table>' + (wd.length === mo.ncol && sw ? '<colgroup>' + wd.map((w) => `<col style="width:${(w * 100 / sw).toFixed(2)}%">`).join('') + '</colgroup>' : '') + '<thead>';
  mo.head.forEach((hr) => { h += '<tr>' + hr.map((c) => `<th colspan="${c.cs}" rowspan="${c.rs}">${escH(c.v)}</th>`).join('') + '</tr>'; });
  h += '</thead><tbody>';
  mo.body.forEach((x) => {
    h += `<tr class="${x.k}"><td>${escH(x.a)}</td><td>${escH(x.n)}</td>` + x.v.map((v, j) => { const t = (x.t && x.t[j]) || (mo.cols[j] && mo.cols[j].t); const num = typeof v === 'number' && t !== 's' && t !== 'g'; return `<td${num ? ' class="n"' : ''}>${num ? fmtN(v) : escH(v)}</td>`; }).join('') + '</tr>';
  });
  h += '</tbody></table>' + foot.map((f) => `<div class="f">${escH(f)}</div>`).join('');
  if (sig) h += `<p class="c" style="text-align:right;margin-top:10px"><i>${escH(sig.ngay)}</i></p><div class="sg">${[['NGƯỜI LẬP BIỂU', sig.lap, 'LAP', true], ['KẾ TOÁN TRƯỞNG', sig.ktt, 'KTT', sig.coKtt], [sig.tpChucVu || 'TRƯỞNG PHÒNG', sig.tp, 'TP', true]].filter((x) => x[3]).map((x) => sig.da ? `<div><b class="k">${x[0]}</b><i class="k">${sig.da[x[2]] ? '(đã ký)' : ''}</i>${escH(x[1])}</div>` : `<div><b>${x[0]}</b>${escH(x[1])}</div>`).join('')}</div>`;
  return h + '<script>setTimeout(function(){window.print()},400)</script></body></html>';
}
const tenPhongHoa = (p) => (p === 'Phòng Nghiệp vụ 2' ? 'PHÒNG NGHIỆP VỤ 2' : p.replace(/^Phòng giao dịch\s*/i, 'PHÒNG GIAO DỊCH SỐ ').toUpperCase());
function coPhong(mo, pgd) {   // biểu của một phòng: KBNN KHU VỰC VIII + tên phòng ở góc trái (chỉ biểu của Tổng hợp toàn tỉnh mới có "KHO BẠC NHÀ NƯỚC")
  return Object.assign({}, mo, { co: ['KHO BẠC NHÀ NƯỚC KHU VỰC VIII', tenPhongHoa(pgd)], title: mo.title.filter((t) => !/^KHO BẠC NHÀ NƯỚC/.test(t)) });
}
function chuanHoa(mo) {   // tên cơ quan (các dòng đầu bắt đầu bằng "KHO BẠC NHÀ NƯỚC") đưa về góc trái
  if (mo.co) return mo; const t = mo.title.slice(), co = [];
  while (t.length > 1 && /^KHO BẠC NHÀ NƯỚC/.test(t[0])) co.push(t.shift());
  return Object.assign({}, mo, { co, title: t });
}
function dongGoi(mo, sig, foot, dinhDang, tenFile) {
  mo = chuanHoa(mo);
  if (dinhDang === 'xlsx') return { name: tenFile + '.xlsx', b64: toXlsx(mo, sig, foot, tenFile.substring(0, 30)).toString('base64'), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  return { name: tenFile + '.html', b64: Buffer.from(toHtml(mo, sig, foot, tenFile), 'utf8').toString('base64'), mime: 'text/html' };
}
async function tieuDeBieu(b, c) {
  const td = require('./tieude.json')[b.id] || [];
  return td.filter((t) => !/^\d+$/.test(t) && t.indexOf('(Kèm') < 0).map((t) => /^KỲ BÁO CÁO/.test(t) ? 'KỲ BÁO CÁO: THÁNG ' + c.nhan : t);
}
// Đơn vị thí điểm: họ tên lấy từ 3 tài khoản chức danh; "(đã ký)" theo các bước đã duyệt trong kỳ
async function chuKyThiDiem(sig, c, pgd) {
  const ds = await db().q('SELECT cv,hoten FROM accounts WHERE donvi=$1', [pgd]), kd = await db().q('SELECT buoc FROM ky_duyet WHERE ky=$1 AND pgd=$2', [c.ky, pgd]);
  const ten = (cv) => ((ds.find((a) => a.cv === cv) || {}).hoten) || '';
  sig.lap = ten('LAP') || sig.lap; sig.ktt = ten('KTT') || sig.ktt; sig.tp = ten('TP') || sig.tp; sig.coKtt = pgd !== C.PHONG_NV2; if (pgd === C.PHONG_NV2) sig.tpChucVu = 'LÃNH ĐẠO PHÒNG';
  sig.da = {}; kd.forEach((k) => { sig.da[k.buoc] = true; });
}
async function xuatBieu(token, bieu, ngay, xem, dinhDang, kyIn) {
  const q = await L.quyen(token, xem), c = await chonKy(kyIn), pgd = q.pgd;
  const sig = { ngay: ngayChu(ngay), lap: q.tk.lap || '', ktt: q.tk.ktt || '', tp: q.tk.tp || '', coKtt: q.vt === 'PGD' && pgd.indexOf('Nghiệp vụ') < 0 };
  if (q.vt !== 'PGD') { const a = (await db().q('SELECT * FROM accounts WHERE ten=$1', [pgd]))[0]; if (a) { sig.lap = a.lap || ''; sig.ktt = a.ktt || ''; sig.tp = a.tp || ''; sig.coKtt = pgd.indexOf('Nghiệp vụ') < 0; } }
  if (C.THI_DIEM.includes(pgd)) await chuKyThiDiem(sig, c, pgd);
  const foot = [await chanTrang(c, pgd)];
  if (bieu === 'BCĐT') {
    const mo = coPhong(await modelCdt(c, [pgd], ['KHO BẠC NHÀ NƯỚC', 'KHO BẠC NHÀ NƯỚC KHU VỰC VIII', 'TÌNH HÌNH GIẢI NGÂN THEO CHỦ ĐẦU TƯ', 'KỲ BÁO CÁO: THÁNG ' + c.nhan]), pgd);
    return dongGoi(mo, sig, foot, dinhDang, 'BCDT_' + slug(pgd));
  }
  const bid = C.BIEU_IN[bieu]; if (!bid) throw E('Biểu không hợp lệ');
  const b = byId[bid], mo = coPhong(await modelBieu(b, c, [pgd], false, await tieuDeBieu(b, c)), pgd);
  return dongGoi(mo, sig, foot, dinhDang, slug(bieu) + '_' + slug(pgd));
}
async function xuatTong(token, id, dinhDang, kyIn) {
  if (id === 'bt') return xuatBieuTong(token, dinhDang, kyIn);
  const q = await L.quyen(token); if (q.vt !== 'TH') throw E('Chỉ cán bộ tổng hợp được in biểu toàn tỉnh.');
  const c = await chonKy(kyIn), foot = [await chanTrang(c, '')];
  if (id === 'cdt') return dongGoi(await modelCdt(c, DS_PGD, ['KHO BẠC NHÀ NƯỚC', 'KHO BẠC NHÀ NƯỚC KHU VỰC VIII', 'TÌNH HÌNH GIẢI NGÂN THEO CHỦ ĐẦU TƯ – TOÀN TỈNH', 'KỲ BÁO CÁO: THÁNG ' + c.nhan]), null, foot, dinhDang, 'Tong_hop_cdt');
  const b = byId[id]; if (!b) throw E('Biểu không hợp lệ');
  return dongGoi(await modelBieu(b, c, DS_PGD, true, await tieuDeBieu(b, c)), null, foot, dinhDang, 'Tong_hop_' + id);
}
async function xuatBieuTong(token, dinhDang, kyIn) {
  const q = await L.quyen(token);
  const r = await require('./bieutong').tinh(token, kyIn), c = await chonKy(kyIn), foot = [await chanTrang(c, q.vt === 'PGD' ? q.pgd : '')];
  const co = !!r.co, hd = ['STT', 'Chủ đầu tư / đơn vị / xã, phường', 'KBNN nơi giao dịch', 'Tổng giải ngân lũy kế', 'Tổng giải ngân trong tháng'].concat(co ? ['THBC lũy kế', 'Chênh lệch lũy kế (web − THBC)'] : []).concat(['Ghi chú']);
  const head = [hd.map((v) => ({ v, cs: 1, rs: 1 }))];
  const sp = '\u00a0\u00a0\u00a0';
  const body = r.rows.map((x) => ({ k: x.k === 'khoi' ? 'sec' : (x.k === 'tot' ? 'tot' : (x.k === 'nhom' ? 'par' : 'row')), a: x.a, n: sp.repeat(Math.max(x.lv - 1, 0)) + x.b, v: [x.c, x.lk, x.th].concat(co ? (x.n != null ? [x.tlk, x.ttl === 'khop' ? 'Khớp' : Math.round(x.dlk * 10) / 10] : ['', '']) : []).concat(['']), t: ['g', 'n', 'n'].concat(co ? ['n', 'n'] : []).concat(['g']) }));
  const mo = { dv: true, title: ['KHO BẠC NHÀ NƯỚC', 'KHO BẠC NHÀ NƯỚC KHU VỰC VIII', 'TỔNG HỢP KẾT QUẢ GIẢI NGÂN VỐN ĐẦU TƯ THEO CHỦ ĐẦU TƯ', 'KỲ BÁO CÁO: THÁNG ' + c.nhan], ncol: hd.length, head, body, cols: [{ t: 'g' }, { t: 'n' }, { t: 'n' }].concat(co ? [{ t: 'n' }, { t: 'n' }] : []).concat([{ t: 'g' }]), widths: [7, 56, 22, 18, 18].concat(co ? [18, 20] : []).concat([18]) };
  return dongGoi(!r.full && q.vt === 'PGD' ? coPhong(mo, q.pgd) : mo, null, foot, dinhDang, 'Bieu_tong_THBC');
}
async function chuKyChung(q, pgd, c) {   // chữ ký cho biểu không có ngày lập riêng (lấy ngày hôm nay)
  const sig = { ngay: ngayChu(''), lap: q.tk.lap || '', ktt: q.tk.ktt || '', tp: q.tk.tp || '', coKtt: false };
  if (pgd) {
    sig.coKtt = pgd.indexOf('Nghiệp vụ') < 0;
    if (q.vt !== 'PGD') { const a = (await db().q('SELECT * FROM accounts WHERE ten=$1', [pgd]))[0]; if (a) { sig.lap = a.lap || ''; sig.ktt = a.ktt || ''; sig.tp = a.tp || ''; } }
    if (C.THI_DIEM.includes(pgd)) await chuKyThiDiem(sig, c, pgd);
  } else {
    const t = (await db().q('SELECT hoten FROM accounts WHERE ten=$1', ['Trưởng phòng Tổng hợp']))[0];
    if (t && t.hoten) sig.tp = t.hoten;
  }
  return sig;
}
async function xuatTinhTrang(token, dinhDang, kyIn) {
  const r = await require('./tinhtrang').tinh(token, kyIn), c = await chonKy(kyIn), q = await L.quyen(token), foot = [await chanTrang(c, q.vt === 'PGD' ? q.pgd : '')];
  const h = (v, cs, rs) => ({ v, cs: cs || 1, rs: rs || 1 });
  const head = [[h('STT', 1, 2), h('Chủ đầu tư / đơn vị / xã, phường', 1, 2), h('KBNN nơi giao dịch', 1, 2), h('Tình trạng báo cáo theo từng biểu', 4), h('Tình trạng báo cáo', 3), h('Ghi chú', 1, 2)],
    [h('Biểu 01-KBNN'), h('Biểu 02-KBNN'), h('Biểu 03 (21-25)'), h('Biểu 03 (26-30)'), h('Đúng hạn'), h('Gửi chậm'), h('Chưa gửi / chưa đầy đủ')]];
  const sp = '\u00a0\u00a0\u00a0', dau = (n) => (n ? n : '');
  const body = r.rows.map((x) => {
    const lf = x.k === 'row', ids = ['b01', 'b02', 'b03a', 'b03b'];
    const v = [x.c].concat(lf ? ids.map((i) => (x.s[i] || '—')) : ['', '', '', '']).concat(lf ? [x.cat === 'dung' ? 'X' : '', x.cat === 'cham' ? 'X' : '', x.cat === 'chua' ? 'X' : ''] : [dau(x.nd), dau(x.nc), dau(x.nx)]).concat([x.gc || '']);
    return { k: x.k === 'khoi' ? 'sec' : (x.k === 'tot' ? 'tot' : (x.k === 'nhom' ? 'par' : 'row')), a: x.a, n: sp.repeat(Math.max(x.lv - 1, 0)) + x.b, v, t: v.map((z, i) => (i >= 5 && i <= 7 && !lf ? 'n' : 'g')) };
  });
  const mo = { title: ['KHO BẠC NHÀ NƯỚC', 'KHO BẠC NHÀ NƯỚC KHU VỰC VIII', 'TÌNH TRẠNG GỬI BÁO CÁO CỦA CHỦ ĐẦU TƯ THEO TỪNG BIỂU' + (r.full ? '' : ' – ' + r.pgd.toUpperCase()), 'KỲ BÁO CÁO: THÁNG ' + c.nhan], ncol: 11, bieu: 'Biểu 04-KBNN', head, body, cols: Array(9).fill({ t: 'g' }), widths: [6, 56, 18, 13, 13, 13, 13, 10, 10, 12, 46] };
  const sig = await chuKyChung(q, r.full ? '' : q.pgd, c);
  return dongGoi(!r.full && q.vt === 'PGD' ? coPhong(mo, q.pgd) : mo, sig, foot, dinhDang, 'Bieu_04_KBNN_Tinh_trang_gui_BC');
}
async function xuatThongKe(token, dinhDang, kyIn) {
  const q = await L.quyen(token); if (q.vt === 'PGD') throw E('Không có quyền.');
  const t = await L.trangThai(token, kyIn), c = await chonKy(kyIn);
  const head = [['STT', 'Đơn vị', 'Trạng thái', 'Gửi lúc', 'Tiếp nhận lúc', 'Nộp tổng hợp lúc', 'Số lần bị trả', 'Chậm / quá hạn', 'Ghi chú (lý do trả)'].map((v) => ({ v, cs: 1, rs: 1 }))];
  const bd = t.list.map((x, i) => { const k = []; if (x.cham) k.push('Gửi chậm ' + x.tre); if (x.quaHan) k.push('Quá hạn chưa gửi'); if (x.nv2Cham) k.push('NV2 nộp chậm'); if (x.nv2QuaHan && !x.nv2Cham) k.push('Quá hạn nộp tổng hợp'); return { k: 'row', a: i + 1, n: x.pgd, v: [x.tt, x.gui, x.nhan, x.nop, x.soTra, k.join('; '), x.lyDo], t: ['g', 'g', 'g', 'g', 'g', 'g', 'g'] }; });
  const mo = { title: ['KHO BẠC NHÀ NƯỚC KHU VỰC VIII', 'THỐNG KÊ TÌNH HÌNH NỘP BÁO CÁO – KỲ THÁNG ' + c.nhan, 'Hạn PGD gửi: ' + (t.hanHienThi.pgd || 'chưa đặt') + '   |   Hạn Nghiệp vụ 2 nộp tổng hợp: ' + (t.hanHienThi.nv2 || 'chưa đặt')], ncol: 9, head, body: bd, cols: [], widths: [6, 28, 16, 17, 17, 17, 10, 30, 36] };
  return dongGoi(mo, null, ['In lúc ' + C.dinhDang(Date.now())], dinhDang, 'Thong_ke_nop_bao_cao');
}
module.exports = { xuatBieu, xuatTong, xuatThongKe, xuatBieuTong, xuatTinhTrang };
