'use strict';
// Đối chiếu số liệu giải ngân PGD nhập với số liệu THBC (file báo cáo 01b/TTKHN, đơn vị đồng).
// Biểu 01-KBNN (có Biểu 02, Biểu 03) nhập theo chủ đầu tư, còn file THBC chỉ chia theo PGD và nhóm vốn (không có cột chủ đầu tư),
// nên đối chiếu ở mức: tổng lũy kế của từng PGD theo từng nhóm vốn. Mọi so sánh quy về triệu đồng.
const L = require('./logic');
const C = require('./common');
const bulk = require('./bulk');
const { docXlsx } = require('./xlsxread');
const { E, db, nap, docKy, chonKy, nk } = L._;

// Nhóm vốn trong file THBC:  NSDP = "1. Vốn cân đối NSĐP",  NSTW21 = "2.1 Vốn NSTW ngành, lĩnh vực",  NSTW22 = "2.2 Vốn NSTW chương trình MTQG"
// f: kd = lũy kế thanh toán kế hoạch vốn kéo dài (cột J), nam = lũy kế thanh toán kế hoạch vốn năm (cột M), tong = tổng lũy kế (cột I)
const MUC = [
  { id: 'b01k', bid: 'b01', cot: [5], nhom: 'NSDP', f: 'kd', ten: 'Biểu 01 · NSĐP · vốn kéo dài năm 2025 sang 2026' },
  { id: 'b01n', bid: 'b01', cot: [6], nhom: 'NSDP', f: 'nam', ten: 'Biểu 01 · NSĐP · vốn kế hoạch năm 2026' },
  { id: 'b02k', bid: 'b02', cot: [5], nhom: 'NSTW21', f: 'kd', ten: 'Biểu 02 · NSTW · vốn kéo dài năm 2025 sang 2026' },
  { id: 'b02n', bid: 'b02', cot: [6], nhom: 'NSTW21', f: 'nam', ten: 'Biểu 02 · NSTW · vốn kế hoạch năm 2026' },
  { id: 'b03a', bid: 'b03a', cot: [5, 7, 9], nhom: 'NSTW22', f: 'tong', ten: 'Biểu 03 (21-25) · NSTW các chương trình MTQG' },
];
const NHOM = ['NSDP', 'NSTW21', 'NSTW22'];
const COT = { kh: 4, tong: 8, kd: 9, nam: 12 };   // chỉ số cột (0-based) trong file THBC: E, I, J, M
const tenPgd = (b) => { const m = /PGD\s*số\s*(\d+)/i.exec(b); if (m) { const t = 'Phòng giao dịch ' + m[1]; return C.DS_PGD.includes(t) ? t : null; } return /Phòng\s*Nghiệp\s*vụ\s*2/i.test(b) ? C.PHONG_NV2 : null; };
const so = (x) => (typeof x === 'number' && isFinite(x) ? x : 0);

function phanTich(rows) {
  const dau = rows.slice(0, 12).map((r) => r.filter((x) => x != null).join(' ')).join(' ');
  if (!/01b\s*\/\s*TTKHN|THANH TOÁN VỐN ĐẦU TƯ CÔNG/i.test(dau)) throw E('File không đúng mẫu báo cáo 01b/TTKHN của THBC (không thấy tiêu đề báo cáo thanh toán vốn đầu tư công).');
  const dv = /Đơn vị tính\s*:\s*([^\s]+)/i.exec(dau), dvn = dv ? dv[1].toLowerCase() : 'đồng';
  const heSo = /^đồng|^dong/.test(dvn) ? 1 : (/^nghìn|^ngàn/.test(dvn) ? 1e3 : (/^triệu/.test(dvn) ? 1e6 : 0));
  if (!heSo) throw E('Không nhận ra đơn vị tính trong file (' + (dv ? dv[1] : 'trống') + '). Cần "Đồng", "Nghìn đồng" hoặc "Triệu đồng".');
  const hd = rows.slice(5, 10).map((r) => r.join(' ')).join(' ');
  if (!/Lũy kế vốn thanh toán/i.test(hd)) throw E('Không thấy cột "Lũy kế vốn thanh toán từ đầu năm" ở phần tiêu đề bảng. File có thể đã bị đổi mẫu.');
  const den = (/đến ngày\s*(\d{2}\/\d{2}\/\d{4})/i.exec(dau) || [])[1] || '';
  const ref = {}; let cur = null;
  for (let i = 9; i < rows.length; i++) {
    const r = rows[i], a = r[0] == null ? '' : String(r[0]).trim(), b = r[1] == null ? '' : String(r[1]).trim();
    if (/^\d{4}$/.test(a) && /^KBNN/i.test(b)) { cur = tenPgd(b); if (cur) ref[cur] = {}; continue; }
    if (/^Nơi nhận/i.test(b)) break;
    if (!cur) continue;
    const nh = (a === '1' && /^Vốn cân đối/i.test(b)) ? 'NSDP' : (a === '2.1' ? 'NSTW21' : (a === '2.2' ? 'NSTW22' : ''));
    if (!nh || ref[cur][nh]) continue;
    ref[cur][nh] = { kh: so(r[COT.kh]) * heSo, tong: so(r[COT.tong]) * heSo, kd: so(r[COT.kd]) * heSo, nam: so(r[COT.nam]) * heSo };
  }
  const co = Object.keys(ref);
  if (!co.length) throw E('Không tìm thấy khối số liệu của phòng giao dịch nào trong file (cần các dòng "KBNN Khu vực VIII - PGD số …").');
  return { ref, den, thieu: C.DS_PGD.filter((p) => !ref[p]) };
}

async function nhapKbnn(token, tenFile, b64) {
  const q = await L.quyen(token); if (q.vt === 'PGD') throw E('Chỉ cán bộ Nghiệp vụ 2 hoặc tổng hợp được tải số liệu THBC.');
  b64 = String(b64 || ''); if (!b64) throw E('Chưa chọn file.'); if (b64.length > 4e6) throw E('File quá lớn (tối đa khoảng 3 MB).');
  let rows; try { rows = docXlsx(Buffer.from(b64, 'base64')); } catch (e) { throw E(e.message || 'Không đọc được file Excel.'); }
  const kq = phanTich(rows), k = await docKy();
  const dong = []; Object.keys(kq.ref).forEach((p) => NHOM.forEach((n) => { const x = kq.ref[p][n] || { kh: 0, tong: 0, kd: 0, nam: 0 }; dong.push([k.ky, p, n, x.kh, x.tong, x.kd, x.nam]); }));
  const meta = { file: String(tenFile || '').substring(0, 120), luc: Date.now(), nguoi: q.ten, den: kq.den, thieu: kq.thieu };
  await db().tx(async (t) => {
    await t.q('DELETE FROM kbnn_ref WHERE ky=$1', [k.ky]);
    await bulk(t, 'kbnn_ref', ['ky', 'pgd', 'nhom', 'kh', 'tong', 'kd', 'nam'], dong);
    await t.q('INSERT INTO kv (k,v) VALUES ($1,$2) ON CONFLICT (k) DO UPDATE SET v=excluded.v', ['kbnn:' + k.ky, JSON.stringify(meta)]);
  });
  await nk(q.ten, 'Tải số liệu THBC', meta.file, kq.den, Object.keys(kq.ref).length + ' phòng');
  return doiChieu(token);
}
async function xoaKbnn(token) {
  const q = await L.quyen(token); if (q.vt === 'PGD') throw E('Không có quyền.');
  const k = await docKy();
  await db().tx(async (t) => { await t.q('DELETE FROM kbnn_ref WHERE ky=$1', [k.ky]); await t.q('DELETE FROM kv WHERE k=$1', ['kbnn:' + k.ky]); });
  await nk(q.ten, 'Xóa số liệu THBC', k.ky, '', '');
  return doiChieu(token);
}

const dungSai = (soDong) => Math.max(1, soDong * 0.5);   // triệu đồng: mỗi dòng nhập có thể lệch tối đa 0,5 do làm tròn
const ketLuan = (nhap, kbnn, soDong) => { const l = nhap - kbnn; return Math.abs(l) <= dungSai(soDong) ? 'khop' : (l < 0 ? 'thap' : 'cao'); };
const lam1 = (x) => Math.round(x * 10) / 10;

async function doiChieu(token, kyIn) {
  const q = await L.quyen(token), c = await chonKy(kyIn);
  const rf = await db().q('SELECT pgd,nhom,kh,tong,kd,nam FROM kbnn_ref WHERE ky=$1', [c.ky]);
  const mt = await db().q('SELECT v FROM kv WHERE k=$1', ['kbnn:' + c.ky]);
  let meta = null; try { meta = mt.length ? JSON.parse(mt[0].v) : null; } catch (e) { meta = null; }
  const muc = MUC.map((m) => ({ id: m.id, bid: m.bid, cot: m.cot, ten: m.ten }));
  const out = { ky: c.nhan, co: rf.length > 0, meta: meta && { file: meta.file, luc: C.dinhDang(meta.luc), nguoi: meta.nguoi, den: meta.den, thieu: meta.thieu || [] }, muc, ds: [], dem: { khop: 0, thap: 0, cao: 0 }, dungSai: 'Chênh lệch ≤ 1 triệu đồng (hoặc 0,5 triệu mỗi dòng đã nhập) coi là khớp do làm tròn.' };
  if (!rf.length) return out;
  const R = {}; rf.forEach((x) => { (R[x.pgd] = R[x.pgd] || {})[x.nhom] = x; });
  const all = await nap(c);
  q.scope.forEach((p) => {
    if (!R[p]) { out.ds.push({ pgd: p, mucs: null }); return; }
    const mucs = MUC.map((m) => {
      const rows = all[m.bid].filter((z) => z.d.pgd === p); let nhap = 0, soDong = 0;
      rows.forEach((z) => { let s = 0; m.cot.forEach((col) => { s += Number(z.o[col]) || 0; }); if (s) soDong++; nhap += s; });
      const kb = ((R[p][m.nhom] || {})[m.f] || 0) / 1e6, tt = ketLuan(nhap, kb, soDong);
      out.dem[tt]++;
      return { id: m.id, nhap: lam1(nhap), kbnn: lam1(kb), lech: lam1(nhap - kb), tt, soDong };
    });
    out.ds.push({ pgd: p, mucs });
  });
  return out;
}
module.exports = { nhapKbnn, xoaKbnn, doiChieu, _: { phanTich, MUC, ketLuan } };
