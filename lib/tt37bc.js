'use strict';
// Báo cáo tổng hợp từ file TT37 (Biểu 01b/TTKHN): nhiều sheet theo chủ đầu tư lớn / phòng giao dịch / tính chất / CTMT...
// Kế hoạch lấy ngay từ các cột kế hoạch của file TT37; không ghi gì vào cơ sở dữ liệu.
const L = require('./logic');
const C = require('./common');
const BT = require('./bieutong');
const M = require('./danhmuc');
const XL = require('./xlsx');
const T = require('./tt37');
const { E } = L._;
const r1 = (x) => Math.round((Number(x) || 0) * 1000) / 1000;
const KHONG_TC = 'Dự án thông thường (không có tính chất đặc thù)', KHONG_CT = 'Không thuộc chương trình mục tiêu', CHUA_DM = '(Chưa có trong danh mục dự án)', CHUA_CDT = '(Danh mục chưa có chủ đầu tư)';
const CTMT = { DTTS: 'DTTS – CTMTQG phát triển KT-XH vùng đồng bào dân tộc thiểu số và miền núi', NTM: 'NTM – CTMTQG xây dựng nông thôn mới', GNBV: 'GNBV – CTMTQG giảm nghèo bền vững', PTVH: 'PTVH – Phát triển văn hóa', PCMT: 'PCMT – Phòng chống ma túy', GDDT: 'GDDT – Giáo dục và đào tạo', SKDS: 'SKDS – Sức khỏe, dân số' };
// v: [lk, kd_tt, kd_tu, n_tt, n_tu], kh: [tổng, kéo dài]
const zero = () => ({ so: 0, kh: 0, khKd: 0, lk: 0, kdTt: 0, kdTu: 0, nTt: 0, nTu: 0 });
const cong = (a, x) => { a.so++; a.kh += x.kh[0]; a.khKd += x.kh[1]; a.lk += x.v[0]; a.kdTt += x.v[1]; a.kdTu += x.v[2]; a.nTt += x.v[3]; a.nTu += x.v[4]; };
const phanTram = (a, b) => (b > 0 ? (Math.round(a / b * 1000) / 10).toLocaleString('vi-VN') + '%' : '');

const HEAD = (ten) => [
  [{ v: ten, s: 2 }, null, null, { v: 'Kế hoạch vốn năm', s: 2 }, null, null, { v: 'Lũy kế vốn thanh toán từ đầu năm', s: 2 }, null, null, null, null, null, null, { v: 'Tỷ lệ giải ngân (%)', s: 2 }, null, null],
  [null, null, null, { v: 'Tổng số', s: 2 }, { v: 'Trong đó: kéo dài năm trước chuyển sang', s: 2 }, { v: 'Giao trong năm', s: 2 }, { v: 'Tổng số', s: 2 }, { v: 'Kế hoạch kéo dài', s: 2 }, null, null, { v: 'Kế hoạch năm nay', s: 2 }, null, null, { v: 'Tổng số', s: 2 }, { v: 'Kéo dài', s: 2 }, { v: 'Năm nay', s: 2 }],
  [{ v: 'STT', s: 2 }, { v: 'Nội dung', s: 2 }, { v: 'Số dự án', s: 2 }, null, null, null, null, { v: 'Tổng số', s: 2 }, { v: 'Thanh toán KLHT', s: 2 }, { v: 'Tạm ứng chưa thu hồi', s: 2 }, { v: 'Tổng số', s: 2 }, { v: 'Thanh toán KLHT', s: 2 }, { v: 'Tạm ứng chưa thu hồi', s: 2 }, null, null, null],
];
const MERGE = (r0) => ['A' + r0 + ':A' + (r0 + 2), 'B' + r0 + ':B' + (r0 + 2), 'C' + r0 + ':C' + (r0 + 2), 'D' + r0 + ':F' + r0, 'D' + (r0 + 1) + ':D' + (r0 + 2), 'E' + (r0 + 1) + ':E' + (r0 + 2), 'F' + (r0 + 1) + ':F' + (r0 + 2), 'G' + r0 + ':M' + r0, 'G' + (r0 + 1) + ':G' + (r0 + 2), 'H' + (r0 + 1) + ':J' + (r0 + 1), 'K' + (r0 + 1) + ':M' + (r0 + 1), 'N' + r0 + ':P' + r0, 'N' + (r0 + 1) + ':N' + (r0 + 2), 'O' + (r0 + 1) + ':O' + (r0 + 2), 'P' + (r0 + 1) + ':P' + (r0 + 2)];
function dongSo(stt, ten, a, dam) {
  const s = dam ? 5 : 4, st = dam ? 8 : 3, kdLk = a.kdTt + a.kdTu, nLk = a.nTt + a.nTu, khN = a.kh - a.khKd;
  return [{ v: stt, s: dam ? 8 : 11 }, { v: ten, s: st }, { v: a.so, s }, { v: r1(a.kh), s }, { v: r1(a.khKd), s }, { v: r1(khN), s }, { v: r1(a.lk), s }, { v: r1(kdLk), s }, { v: r1(a.kdTt), s }, { v: r1(a.kdTu), s }, { v: r1(nLk), s }, { v: r1(a.nTt), s }, { v: r1(a.nTu), s },
    { v: phanTram(a.lk, a.kh), s: st }, { v: phanTram(kdLk, a.khKd), s: st }, { v: phanTram(nLk, khN), s: st }];
}
// groups: Map ten -> acc; thứ tự theo "thuTu" (mảng tên) rồi theo kế hoạch giảm dần
function sheetNhom(ten, tieuDe, ghiChu, groups, tong, thuTu) {
  const keys = [...groups.keys()].sort((a, b) => { const ia = thuTu ? thuTu.indexOf(a) : -1, ib = thuTu ? thuTu.indexOf(b) : -1; if (ia >= 0 || ib >= 0) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib); return groups.get(b).kh - groups.get(a).kh; });
  const rows = [[{ v: tieuDe, s: 6 }], [{ v: ghiChu, s: 7 }], [], ...HEAD('Nội dung')];
  rows[3][0] = { v: 'STT', s: 2 }; rows[3][1] = { v: 'Nội dung', s: 2 }; rows[3][2] = { v: 'Số dự án', s: 2 };
  rows[3][3] = { v: 'Kế hoạch vốn năm', s: 2 }; rows[3][6] = { v: 'Lũy kế vốn thanh toán từ đầu năm', s: 2 }; rows[3][13] = { v: 'Tỷ lệ giải ngân (%)', s: 2 };
  rows.push(dongSo('', 'TỔNG CỘNG', tong, true));
  keys.forEach((k, i) => rows.push(dongSo(i + 1, k, groups.get(k))));
  return { name: ten, cols: [6, 52, 9, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 11, 11, 11], rows, merges: ['A1:P1', 'A2:P2', ...MERGE(4)], landscape: true };
}
async function baoCao(token, tenFile, b64, id) {
  const q = await L.quyen(token); if (q.vt === 'PGD') throw E('Chỉ Chuyên viên THBC hoặc cán bộ Nghiệp vụ 2 được xuất báo cáo này.');
  b64 = await T._layFile(b64, id); const kq = T._docFile(b64);
  const bd = {}; (await M._banDo()).forEach((x) => { bd[String(x[0]).trim()] = { cdt: x[2] || '', cdt2: x[3] || '', kbnn: x[4] || '', tc: x[5] || '', ct: x[6] || '' }; });
  const ci = await M._ctInfo();
  const tong = zero(), cLon = new Map(), cTt = new Map(), pg = new Map(), tc = new Map(), ct = new Map(), cp = new Map(), chua = [];
  const tg = (m, k) => { if (!m.has(k)) m.set(k, zero()); return m.get(k); };
  C.DS_PGD.forEach((p) => { if (kq.khoi.some((k) => k.pgd === p)) tg(pg, p); });
  for (const k of kq.khoi) for (const x of Object.values(k.da)) {
    if (!x.v.some((y) => Math.abs(y) > 1e-9) && !x.kh.some((y) => Math.abs(y) > 1e-9)) continue;
    const d = bd[x.ma], lon = d ? (d.cdt2 || d.cdt || CHUA_CDT) : CHUA_DM, tt = d ? (d.cdt || d.cdt2 || CHUA_CDT) : CHUA_DM;
    cong(tong, x); cong(tg(cLon, lon), x); cong(tg(cTt, tt), x); cong(tg(pg, k.pgd), x); cong(tg(cp, tt + '||' + k.pgd), x);
    cong(tg(tc, d ? (d.tc || KHONG_TC) : CHUA_DM), x);
    const codes = d ? String(d.ct).split('+').map((s) => s.trim()).filter(Boolean) : [];
    if (!d) cong(tg(ct, CHUA_DM), x); else if (!codes.length) cong(tg(ct, KHONG_CT), x); else codes.forEach((c) => cong(tg(ct, CTMT[c] || c), x));
    if (!d || !d.cdt) chua.push({ ma: x.ma, ten: x.ten, pgd: k.pgd, kh: x.kh[0], lk: x.v[0], lyDo: d ? CHUA_CDT : CHUA_DM });
  }
  const ngay = kq.ngay ? kq.ngay.split('-').reverse().join('/') : '';
  const td = (s) => s + (ngay ? ' – lũy kế đến ngày ' + ngay : '');
  const gc = 'Đơn vị: Triệu đồng. Nguồn: file TT37 (Biểu 01b/TTKHN) – kế hoạch lấy theo các cột kế hoạch của file. Chỉ tính dự án có kế hoạch hoặc có số thanh toán.';
  const sheets = [];
  // Sheet 1: tổng hợp chung
  const t1 = new Map([['Toàn tỉnh (theo file TT37)', tong]]);
  sheets.push(sheetNhom('Tổng hợp', td('BÁO CÁO TỔNG HỢP GIẢI NGÂN VỐN ĐẦU TƯ CÔNG'), gc, t1, tong));
  sheets.push(sheetNhom('Theo CĐT lớn', td('BÁO CÁO GIẢI NGÂN THEO CHỦ ĐẦU TƯ LỚN'), gc, cLon, tong, ci.lon && ci.lon.length ? ci.lon : null));
  sheets.push(sheetNhom('Theo PGD', td('BÁO CÁO GIẢI NGÂN THEO PHÒNG GIAO DỊCH / KBNN'), gc + ' Phòng theo khối KBNN trong file.', pg, tong, C.DS_PGD));
  sheets.push(sheetNhom('Theo tính chất DA', td('BÁO CÁO GIẢI NGÂN THEO TÍNH CHẤT DỰ ÁN'), gc + ' Tính chất lấy theo Danh mục dự án.', tc, tong, ['Trọng điểm', 'Chuyển đổi số', KHONG_TC]));
  sheets.push(sheetNhom('Theo CTMT', td('BÁO CÁO GIẢI NGÂN THEO CHƯƠNG TRÌNH MỤC TIÊU'), gc + ' Dự án thuộc nhiều chương trình được tính vào từng chương trình nên cộng các dòng có thể lớn hơn tổng cộng.', ct, tong, [...Object.values(CTMT), KHONG_CT]));
  sheets.push(sheetNhom('Theo CĐT trực thuộc', td('BÁO CÁO GIẢI NGÂN THEO CHỦ ĐẦU TƯ (TRỰC THUỘC)'), gc + ' Chủ đầu tư theo cột "Chủ đầu tư (BC tháng)" của Danh mục dự án.', cTt, tong, ci.ten));
  // CĐT × PGD
  const keys = [...cp.keys()].sort((a, b) => { const [ta, pa] = a.split('||'), [tb, pb] = b.split('||'); return (ci.ten.indexOf(ta) < 0 ? 999 : ci.ten.indexOf(ta)) - (ci.ten.indexOf(tb) < 0 ? 999 : ci.ten.indexOf(tb)) || C.DS_PGD.indexOf(pa) - C.DS_PGD.indexOf(pb); });
  const m2 = new Map(); keys.forEach((k) => { const [a, b] = k.split('||'); m2.set(a + ' – ' + b, cp.get(k)); });
  const s7 = sheetNhom('CĐT x PGD', td('BÁO CÁO GIẢI NGÂN THEO CHỦ ĐẦU TƯ × PHÒNG GIAO DỊCH'), gc, m2, tong, [...m2.keys()]); sheets.push(s7);
  // Chưa xếp được
  chua.sort((a, b) => Math.abs(b.lk) - Math.abs(a.lk));
  const hd = ['STT', 'Mã dự án', 'Tên dự án', 'Phòng (trong file)', 'Kế hoạch', 'Lũy kế thanh toán', 'Lý do'];
  const r8 = [[{ v: 'DỰ ÁN CHƯA XẾP ĐƯỢC VÀO CHỦ ĐẦU TƯ (' + chua.length + ')', s: 6 }], [{ v: 'Bổ sung vào Danh mục dự án rồi tải lại file. Đơn vị: triệu đồng.', s: 7 }], [], hd.map((v) => ({ v, s: 2 }))];
  chua.forEach((c, i) => r8.push([i + 1, c.ma, c.ten, c.pgd, r1(c.kh), r1(c.lk), c.lyDo].map((v, j) => ({ v, s: j === 0 ? 11 : (j === 4 || j === 5 ? 4 : 3) }))));
  sheets.push({ name: 'Chưa xếp được', cols: [6, 12, 70, 22, 14, 16, 30], rows: r8, merges: ['A1:G1', 'A2:G2'], landscape: true });
  const buf = XL.writeMulti(sheets);
  return { name: 'BC_giai_ngan_TT37' + (kq.ngay ? '_' + kq.ngay : '') + '.xlsx', b64: buf.toString('base64'), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
}
module.exports = { baoCao };
