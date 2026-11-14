// =====================================================================
//  ĐỐI CHIẾU BÁO CÁO DỰ ÁN CHUYỂN ĐỔI SỐ ↔ B5-01 NS tỉnh + NS xã
//  BC chuyển đổi số (sheet "CHUYỂN ĐỔI SỐ", triệu đồng): Tên đơn vị, Mã KBNN, Mã dự án, Tên dự án,
//     Kinh phí thực hiện NQ57, Lũy kế giải ngân (cột G)
//  So với B5-01: Lũy kế chi từ đầu năm – Tổng số (cột O) − Dư tạm ứng năm trước chuyển sang (cột L)
// =====================================================================
const txt = v => (v === null || v === undefined) ? '' : String(v).normalize('NFC').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const norm = v => txt(v).toLowerCase();
const so = v => { if (typeof v === 'number') return v; const n = Number(String(v ?? '').replace(/\s/g, '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };

function timCot(rows, re, den = 15) {
  for (let i = 0; i < Math.min(rows.length, den); i++) {
    const r = rows[i] || [];
    for (let c = 0; c < r.length; c++) if (re.test(norm(r[c]))) return { dong: i, cot: c, text: txt(r[c]) };
  }
  return null;
}

// Nhận dạng sheet báo cáo chuyển đổi số
export function laBaoCaoCDS(rows) {
  return !!(timCot(rows, /^mã dự án$/) && timCot(rows, /lũy kế giải ngân|luỹ kế giải ngân/) && timCot(rows, /tên đơn vị/));
}

export function docCDS(rows) {
  const c = {
    dv: timCot(rows, /^tên đơn vị/), kb: timCot(rows, /^mã kbnn|^mã kho bạc/), ma: timCot(rows, /^mã dự án$/),
    ten: timCot(rows, /^tên nhiệm vụ|^tên dự án/), kp: timCot(rows, /^kinh phí/), gn: timCot(rows, /lũy kế giải ngân|luỹ kế giải ngân/),
    gc: timCot(rows, /^ghi chú/),
  };
  if (!c.ma || !c.gn) throw new Error('BC chuyển đổi số: không tìm thấy cột "Mã dự án" hoặc "Lũy kế giải ngân".');
  const dau = Math.max(c.ma.dong, c.gn.dong) + 1;
  const tieuDe = txt((rows.slice(0, c.ma.dong).find(r => (r || []).some(v => /báo cáo/i.test(txt(v)))) || []).find(v => /báo cáo/i.test(txt(v))));
  const out = [], nhom = [], donVi = [];
  let cap = '', dv = '', kbDV = '', uDV = null;
  for (let i = dau; i < rows.length; i++) {
    const r = rows[i] || [];
    const a = txt(r[0]), b = c.dv ? txt(r[c.dv.cot]) : '', kb = c.kb ? txt(r[c.kb.cot]) : '', ma = txt(r[c.ma.cot]).replace(/\s+/g, '');
    if (!a && !b && !ma) continue;
    if (/^\d+$/.test(a) && !ma && !kb && b && !/^\d+$/.test(b)) { cap = b; nhom.push({ cap, kp: so(r[c.kp?.cot]), gn: so(r[c.gn.cot]) }); continue; }   // Cấp tỉnh / Cấp xã
    if (!a && /^chi /i.test(b) && !ma) continue;                                                   // dòng "CHI ĐẦU TƯ"
    if (/^\d+$/.test(a) && /^\d+$/.test(b)) continue;                                               // dòng đánh số cột
    if (b) { dv = b; kbDV = kb; uDV = { dong: i + 1, dv: b, cap, gDong: ma ? null : (txt(r[c.gn.cot]) === '' ? null : so(r[c.gn.cot])), conG: 0, soDA: 0 }; donVi.push(uDV); }
    if (!ma) continue;
    if (uDV) { uDV.conG += so(r[c.gn.cot]); uDV.soDA++; }
    out.push({
      dong: i + 1, stt: a, cap, dv, kb: kb || kbDV, ma_da: ma, ten: c.ten ? txt(r[c.ten.cot]) : '',
      kp: c.kp ? so(r[c.kp.cot]) : 0, gn: so(r[c.gn.cot]), ghi_chu: c.gc ? txt(r[c.gc.cot]) : '',
    });
  }
  // Kiểm tra nội bộ file: dòng đơn vị (không có mã dự án) có lũy kế khác cộng các dự án bên dưới
  const lechDV = donVi.filter(u => u.soDA && !(u.soDA === 1 && u.gDong === null && out.find(d => d.dong === u.dong)))
    .filter(u => u.gDong === null ? u.conG !== 0 : Math.abs(u.gDong - u.conG) > 0.0005)
    .filter(u => !out.some(d => d.dong === u.dong));
  return { ds: out, nhom, tieuDe, cotGN: c.gn.text, lechDV };
}

// So sánh. b5 = [B5-01 NS tỉnh, B5-01 NS xã] (b501.docB501). saiSo: chênh lệch tối đa coi là khớp (triệu đồng)
export function soSanhCDS(cds, tinh, xa, saiSo = 0.5) {
  const rows = cds.ds.map(d => {
    const t = tinh.ds.get(d.ma_da), x = xa.ds.get(d.ma_da);
    const vt = t ? t.gtGN : 0, vx = x ? x.gtGN : 0, b5 = vt + vx;
    const kbB5 = [...new Set([...Object.keys(t?.theoKB || {}), ...Object.keys(x?.theoKB || {})])];
    const lech = d.gn - b5;
    const coLech = Math.abs(lech) > saiSo + 1e-9;
    const ly = [];
    if (!t && !x) ly.push('Không có trên B5-01 NS tỉnh, NS xã');
    else if (coLech) ly.push(lech > 0 ? 'BC chuyển đổi số lớn hơn B5-01' : 'B5-01 lớn hơn BC chuyển đổi số');
    else if (Math.abs(lech) >= 0.0005) ly.push('Khớp (chênh do làm tròn)');
    if ((t || x) && d.kb && kbB5.length && !kbB5.includes(d.kb)) ly.push(`B5-01 giao dịch tại KBNN ${kbB5.join(', ')}`);
    if (t && x) ly.push('Có trên cả NS tỉnh và NS xã');
    return { ...d, tinh: vt, xa: vx, b5, lech, coLech, coB5: !!(t || x), kbB5, ly_do: ly.join('; '), tenB5: t?.ten || x?.ten || '' };
  });
  // theo phòng giao dịch (mã KBNN trên BC chuyển đổi số)
  const ph = new Map();
  for (const r of rows) {
    const p = ph.get(r.kb) || { kb: r.kb, soDA: 0, soLech: 0, kp: 0, gn: 0, tinh: 0, xa: 0, b5: 0, lech: 0 };
    p.soDA++; if (r.coLech) p.soLech++;
    for (const k of ['kp', 'gn', 'tinh', 'xa', 'b5', 'lech']) p[k] += r[k];
    ph.set(r.kb, p);
  }
  const phong = [...ph.values()].sort((a, b) => a.kb.localeCompare(b.kb));
  const tong = rows.reduce((s, r) => { for (const k of ['kp', 'gn', 'tinh', 'xa', 'b5', 'lech']) s[k] += r[k]; return s; }, { kp: 0, gn: 0, tinh: 0, xa: 0, b5: 0, lech: 0 });
  return { rows, phong, tong, soLech: rows.filter(r => r.coLech).length, saiSo };
}

// ---- Lưu lên máy chủ: B5-01 chỉ giữ phần cần cho đối chiếu (O − L, L, mã kho bạc) để gọn
const tron = n => Math.round((n || 0) * 1e6) / 1e6;
export function goiB5(x) {
  return { kb: x.kb || '', tongGN: x.tongGN ?? null, ds: [...x.ds.values()].map(d => [d.ma_da, tron(d.gtGN), tron(d.tu), Object.keys(d.theoKB || {})]) };
}
export function moB5(d, loai) {
  const ds = new Map((d.ds || []).map(([ma, gn, tu, kb]) => [ma, { ma_da: ma, gtGN: gn, tu, theoKB: Object.fromEntries((kb || []).map(k => [k, {}])) }]));
  return { loai, ds, kb: d.kb, tongGN: d.tongGN, co: { GN: true }, gon: true };
}
