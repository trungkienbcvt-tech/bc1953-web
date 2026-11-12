'use strict';
const CFG = require('./cfg.json');
const DS_PGD = ['Phòng Nghiệp vụ 2', 'Phòng giao dịch 17', 'Phòng giao dịch 18', 'Phòng giao dịch 19', 'Phòng giao dịch 20', 'Phòng giao dịch 21',
  'Phòng giao dịch 22', 'Phòng giao dịch 23', 'Phòng giao dịch 24', 'Phòng giao dịch 25', 'Phòng giao dịch 26', 'Phòng giao dịch 27'];
const ADMIN = 'Tổng hợp toàn tỉnh', PHONG_NV2 = 'Phòng Nghiệp vụ 2';
const TINH_TRANG = ['Đã gửi BC', 'Gửi BC chậm', 'Chưa gửi BC'];
const T = { CHUA: 'Chưa gửi', GUI: 'Đã gửi', NHAN: 'Đã tiếp nhận', TRA: 'Bị trả lại', NOP: 'Đã nộp tổng hợp',
  CHO_KTT: 'Chờ KTT duyệt', CHO_TP: 'Chờ TP phê duyệt', TH_NHAN: 'Tổng hợp đã tiếp nhận', TRINH: 'Đã trình lãnh đạo phòng' };
// Đơn vị thí điểm quy trình nhiều cấp ký duyệt: Lập biểu → Kế toán trưởng → Trưởng phòng → NV2 → Tổng hợp → Lãnh đạo phòng
const THI_DIEM = ['Phòng giao dịch 17'];
const DA_NOP = [T.NOP, T.TH_NHAN, T.TRINH];
const CV_TEN = { LAP: 'Người lập biểu', KTT: 'Kế toán trưởng', TP: 'Trưởng phòng' };
const TK_THI_DIEM = [   // [tên đăng nhập, vt, scope, đơn vị, chức vụ]
  ['PGD17 - Người lập biểu', 'PGD', '', 'Phòng giao dịch 17', 'LAP'],
  ['PGD17 - Kế toán trưởng', 'PGD', '', 'Phòng giao dịch 17', 'KTT'],
  ['PGD17 - Trưởng phòng', 'PGD', '', 'Phòng giao dịch 17', 'TP'],
  ['Huy (NV2 - PGD 17)', 'NV2', 'Phòng giao dịch 17', '', ''],
];
const TONG_COL = { b01: [4, 7], b02: [4, 7], b03a: [4, 11], b03b: [4, 19] };   // cột tổng lũy kế, tổng trong tháng
const PAIR_OFF = { b01: 3, b02: 3, b03a: 7, b03b: 15 };                            // cột trong tháng = cột lũy kế + số này
const TOT = { b01: [[4, [5, 6]], [7, [8, 9]]], b02: [[4, [5, 6]], [7, [8, 9]]], b03a: [[4, [5, 6, 7, 8, 9, 10]], [11, [12, 13, 14, 15, 16, 17]]],
  b03b: [[5, [6, 7]], [8, [9, 10, 11, 12, 13, 14, 15, 16, 17, 18]], [4, [5, 8]], [20, [21, 22]], [23, [24, 25, 26, 27, 28, 29, 30, 31, 32, 33]], [19, [20, 23]]] };
const BIEU_IN = { 'B01': 'b01', 'B02': 'b02', 'B03(21-25)': 'b03a', 'B03(26-30)': 'b03b' };
const nhom = (c) => { const t = String(c.lv[0] || '').toUpperCase(); return t.indexOf('LŨY KẾ') >= 0 ? 'lk' : (t.indexOf('TRONG THÁNG') >= 0 ? 'th' : ''); };
const capCot = (b) => { const lk = b.cols.filter((c) => c.t === 'n' && nhom(c) === 'lk').map((c) => c.c); return { lk, th: lk.map((c) => c + PAIR_OFF[b.id]) }; };
const byId = {}; CFG.forEach((b) => { byId[b.id] = b; b.cc = capCot(b); });
const kySau = (ky) => { const p = ky.split('-'); let y = +p[0], m = +p[1] + 1; if (m > 12) { m = 1; y++; } return y + '-' + ('0' + m).slice(-2); };
const kyTruoc = (ky) => { const p = ky.split('-'); let y = +p[0], m = +p[1] - 1; if (m < 1) { m = 12; y--; } return y + '-' + ('0' + m).slice(-2); };
const kyNhan = (ky) => ky.substring(5) + '/' + ky.substring(0, 4);
const tinhTong = (bid, o) => { (TOT[bid] || []).forEach((t) => { let s = 0; t[1].forEach((c) => { s += Number(o[c]) || 0; }); o[t[0]] = s; }); };
// Giờ Việt Nam (UTC+7)
const TZ_MS = 7 * 3600e3;
function dinhDang(ms, f) {
  if (!ms) return '';
  const d = new Date(Number(ms) + TZ_MS), p = (n) => ('0' + n).slice(-2);
  const dd = p(d.getUTCDate()), mm = p(d.getUTCMonth() + 1), yy = d.getUTCFullYear(), hh = p(d.getUTCHours()), mi = p(d.getUTCMinutes());
  return f === 'dd/MM HH:mm' ? `${dd}/${mm} ${hh}:${mi}` : `${dd}/${mm}/${yy} ${hh}:${mi}`;
}
function parseHan(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/.exec(String(s || '').trim());
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - TZ_MS : 0;
}
const soGio = (ms) => { const g = Math.round(ms / 36e5); return g >= 24 ? Math.floor(g / 24) + ' ngày ' + (g % 24) + ' giờ' : g + ' giờ'; };
module.exports = { THI_DIEM, DA_NOP, CV_TEN, TK_THI_DIEM, CFG, DS_PGD, ADMIN, PHONG_NV2, TINH_TRANG, T, TONG_COL, PAIR_OFF, TOT, BIEU_IN, byId, nhom, capCot, kySau, kyTruoc, kyNhan, tinhTong, dinhDang, parseHan, soGio };
