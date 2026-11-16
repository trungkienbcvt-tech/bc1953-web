// ĐỐI CHIẾU SỐ LIỆU – bản độc lập (không đăng nhập, không máy chủ): mọi file Excel chỉ đọc và xử lý trên máy người dùng.
//   B5-01 (TABMIS) ⇄ THBC Thông tư 37 · B5-01 ⇄ THBC Thông tư 85 · THBC Thông tư 37 ⇄ Thông tư 85
import * as E from './engine.js';
import * as B5 from './b501.js';
import * as DTE from './dt.js';

const TABS = { b5: 'B5-01 ↔ Thông tư 37', b585: 'B5-01 ↔ Thông tư 85', tt3785: 'Thông tư 37 ↔ Thông tư 85', dtkb: 'Thông tư 85 ↔ ĐTKB-GD' };
const ICON_TAB = { b5: '🔍', b585: '🔎', tt3785: '🔁', dtkb: '🧾' };
const S = { tab: TABS[location.hash.slice(1)] ? location.hash.slice(1) : 'b5', cdt: [] };
const tabsCua = () => TABS;
const coXuat = () => true;

// ---------------------------------------------------------------- Tiện ích
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf0 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const fmtDong = n => nf0.format(Math.round(n || 0));
const norm = s => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const ddmmyyyy = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type; el.textContent = msg;
  document.getElementById('toast').append(el);
  setTimeout(() => el.remove(), type === 'err' ? 7000 : 3500);
}
const fail = e => { console.error(e); toast(e?.message || String(e), 'err'); };
async function loadXLSX() {
  for (const u of ['https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm', 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs']) {
    try { return await import(u); } catch (e) { console.warn('Không tải được', u, e); }
  }
  throw new Error('Không tải được thư viện đọc Excel. Kiểm tra kết nối mạng.');
}
function loadExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
    s.onload = () => res(window.ExcelJS); s.onerror = () => rej(new Error('Không tải được thư viện xuất Excel.'));
    document.head.append(s);
  });
}
// Lưu file tải về: chạy trong trang claude.ai (artifact) thì dùng quyền "downloads" của Claude, còn lại tải bình thường
async function luuFile(buf, ten) {
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const dl = window.claude?.use ? await window.claude.use('downloads').catch(() => null) : null;
  if (dl) {
    try { await dl.save({ filename: ten, data: blob }); toast('Đã lưu file ' + ten, 'ok'); }
    catch (e) { if (e?.code !== 'declined') toast('Không lưu được file: ' + (e?.message || e?.code || e), 'err'); }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = ten; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
function tenPhongKB(k, tenFile) {
  const p = DTE.KB_PHONG[k];
  if (p) return DTE.tenPhong(p);
  return (tenFile || '').replace(/^.*?KBNN\s*/i, '').trim() || 'KBNN ' + k;
}

// ---------------------------------------------------------------- Khung trang
const view = () => document.getElementById('view');
function menuAn() { try { return localStorage.getItem('dc_an_menu') === '1'; } catch { return false; } }
function khung() {
  document.getElementById('app').innerHTML = `
    <header class="topbar">
      <div><div class="org">KBNN KHU VỰC VIII</div><h1>⚖️ Đối chiếu số liệu TABMIS – THBC</h1></div>
      <div class="who"><div><b>Bản độc lập</b><span>File Excel chỉ xử lý trên máy bạn, không gửi lên máy chủ</span></div></div>
    </header>
    <div class="khung ${menuAn() ? 'an-menu' : ''}">
    <nav class="tabs side">
      <button class="tab-thu" id="thuMenu" title="Thu gọn / mở menu">«</button>
      <div class="nhom"><div class="nhom-dau">⚖️ Đối chiếu số liệu<span></span></div>
        ${Object.entries(TABS).map(([k, t]) => `<button class="tab ${k === S.tab ? 'on' : ''}" data-tab="${k}" title="${esc(t)}"><i>${ICON_TAB[k]}</i>${esc(t)}</button>`).join('')}</div>
    </nav>
    <main id="view"></main></div>`;
  document.getElementById('thuMenu').onclick = () => { const k = document.querySelector('.khung'); k.classList.toggle('an-menu'); try { localStorage.setItem('dc_an_menu', k.classList.contains('an-menu') ? '1' : ''); } catch { /* bỏ qua */ } };
  document.querySelectorAll('.tab[data-tab]').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; history.replaceState(null, '', '#' + S.tab); show(); window.scrollTo(0, 0); });
}
function show() {
  document.querySelectorAll('.tab[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
  const v = view();
  try { ({ b5: viewB501, b585: viewB501, tt3785: viewTT3785, dtkb: viewDTKB })[S.tab](v); } catch (e) { fail(e); }
}
window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (TABS[t] && t !== S.tab) { S.tab = t; show(); } });

// ---------------------------------------------------------------- Đối chiếu (giống mục "Đối chiếu số liệu" của hệ thống Tổng hợp)
const B5S = { file: {} };   // file tải lên ở trang Đối chiếu (độc lập với Dữ liệu đầu vào): TINH, XA, TT37, TT85
const f3 = n => (n === null || n === undefined) ? '' : (Math.abs(n) < 0.0005 ? '-' : n.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 3 }));
const tinhB5 = () => { };   // giữ tên gọi cũ (mục Dự án trọng điểm, Chuyển đổi số gọi sau khi nạp B5-01)
// Trạng thái lọc từng trang đối chiếu
const DCS = { b5: { ct: '*', loc: 'lech', tim: '', phong: '*' }, b585: { ct: '*', loc: 'lech', tim: '', phong: '*' }, tt3785: { ct: '*', loc: 'lech', tim: '', phong: '*' }, dtkb: { ct: '*', loc: 'lech', tim: '', phong: '*' } };
// Tên chỉ tiêu = tên cột của biểu THBC
const COT_THBC_TEN = {
  TT37: { KD: ['F', 'Kế hoạch vốn kéo dài năm trước chuyển sang'], NAM: ['H', 'Kế hoạch vốn giao trong năm'], GN: ['I', 'Lũy kế vốn thanh toán từ đầu năm – Tổng số'] },
  TT85: { TC: ['V', 'Tổng cộng vốn đã thanh toán KLHT quyết toán trong năm'], TU: ['W', 'Lũy kế số vốn tạm ứng theo chế độ chưa thu hồi đến hết năm quyết toán'] },
};
const COT_B5_TEN = { KD: 'Dư dự toán năm trước chuyển sang (cột J)', NAM: 'Dự toán giao đầu năm + Dự toán điều chỉnh (cột M + N)', TC: 'Thực chi (cột P)', TU: 'Dư tạm ứng chưa thanh toán (cột Q)' };
const COT_TT85_TEN = { KD: 'cột J', NAM: 'cột P', GN: 'cột K + Q' };
const dsDC = () => [['b5', 'B5-01', 'Thông tư 37'], ['b585', 'B5-01', 'Thông tư 85'], ['tt3785', 'Thông tư 37', 'Thông tư 85']];
const dongDC = (nhan, noi) => `<div class="dc-dong"><span class="dc-lbl">${nhan}</span><div class="dc-noi">${noi}</div></div>`;
const B5_TEN = { TT15: 'File THBC riêng (2461_TT15 hoặc TT37 – mẫu 01b/TTKHN)', XA: 'B5-01 Ngân sách xã/phường', TINH: 'B5-01 Ngân sách tỉnh' };
const oNguon = (ten, x, phu = '') => `<span class="dc-chip ${x ? 'ok' : 'no'}" title="${x ? esc(`${x.ten_file || ''}${x.ky ? ` · kỳ ${x.ky.tu} – ${x.ky.den}` : ''}${x.luu ? ' · số liệu đã nạp ở mục Dữ liệu đầu vào' : ''}`) : ''}">
  ${x ? '✓' : '○'} <b>${esc(ten)}</b>${x ? ` <span>${esc(x.ten_file || '')}${x.ky ? ` · đến ${esc(x.ky.den)}` : ''} · ${fmtDong(x.ds.size)} DA</span>` : ` <span>${phu || 'chưa tải file'}</span>`}</span>`;

const TEN_FILE_DC = { TINH: 'B5-01 NS tỉnh', XA: 'B5-01 NS xã', TT37: 'THBC Thông tư 37', TT85: 'THBC Thông tư 85', DTKB: 'Sổ ĐTKB-GD' };
B5S.dtkb = {};   // sổ ĐTKB-GD theo mã KBNN lập sổ
// Đọc file tải lên ở trang Đối chiếu: tự nhận B5-01 NS tỉnh / NS xã, THBC TT37 (mẫu 01b/TTKHN), THBC TT85 (biểu 03KBQT)
async function docFileDC(files) {
  const XLSX = await loadXLSX();
  for (const fl of files) {
    const wb = XLSX.read(await fl.arrayBuffer(), { type: 'array' });
    let gap = false;
    for (const n of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: null, raw: true, blankrows: true });
      const loai = B5.nhanDang(rows);
      let l = '', x = null;
      if (loai === 'TINH' || loai === 'XA') { l = loai; x = B5.docB501(rows, loai); }
      else if (loai === 'TT15') { l = 'TT37'; x = B5.docTT15(rows); }        // mẫu 01b/TTKHN (TT37, 2461_TT15)
      else if (loai === 'TT85') {
        l = 'TT85';
        const hs = E.heSoNguon(rows, 'TT85'), ky = E.docKyIn(rows);
        x = B5.tuNguonLuu(E.docNguon(rows, 'TT85', hs), { tong: E.docTong(rows, 'TT85', hs), ky_in: ky?.text || '', ten_file: fl.name }, 'TT85');
        x.luu = false;
      }
      else if (loai === 'DTKB') { l = 'DTKB'; x = B5.docDTKB(rows); }
      if (!x) continue;
      x.ten_file = fl.name + (wb.SheetNames.length > 1 ? ` (sheet ${n})` : ''); gap = true;
      if (l === 'DTKB') {
        if (!x.kb) { toast(`Sổ ĐTKB-GD ${fl.name}: không nhận ra mã KBNN từ tên đơn vị "${x.donVi}".`, 'err'); break; }
        B5S.dtkb[x.kb] = x;
        toast(`Đã đọc sổ ĐTKB-GD của KBNN ${x.kb} – ${tenPhongKB(x.kb)}: ${fmtDong(x.ds.size)} dự án.`, 'ok');
        break;
      }
      B5S.file[l] = x;
      toast(`Đã đọc ${TEN_FILE_DC[l]}: ${fmtDong(x.ds.size)} dự án.`, 'ok');
      break;
    }
    if (!gap) toast(`Không nhận ra file: ${fl.name} (cần B5-01 NS tỉnh / NS xã, BC TT37 mẫu 01b/TTKHN, BC TT85 biểu 03KBQT hoặc sổ ĐTKB-GD).`, 'err');
  }
}
const nutTaiDC = ds => `<label class="btn small primary">📂 Tải file ${ds}…<input type="file" id="dcf" accept=".xls,.xlsx" multiple hidden></label>
  <span class="muted small">Chọn được nhiều file cùng lúc, phần mềm tự nhận ra từng loại. File chỉ xử lý trên máy bạn, dùng chung cho các trang đối chiếu, không gửi lên máy chủ.</span>`;
function ganTaiDC(v, ve) {
  v.querySelector('#dcf').addEventListener('change', async e => {
    const files = [...e.target.files]; e.target.value = '';
    try { await docFileDC(files); ve(v); } catch (err) { fail(err); }
  });
}

// ---- Mô hình đối chiếu chung: mỗi dòng dự án mang số của tất cả chỉ tiêu
//   M = { a, b (tên 2 bên), cts: [{ k, ten, cot, moTa, kq: { tong, dongTong, soLech } }], rows: [{ key, ma_da, ten, kb, v: { k: { a, b, lech, coLech, ly_do, xa, tinh } }, soLech }], coPhong }
function moHinhB5(l, t, f) {
  const cts = B5.CT_CAP[l].map(k => {
    const kq = B5.soSanhB501(t, f.XA, f.TINH, k), [cot, ten] = COT_THBC_TEN[l][k];
    return { k, ten, cot, moTa: `${l} cột ${cot} ⇄ B5-01 ${COT_B5_TEN[k]}`, kq: { tong: { a: kq.tong.tt15, b: kq.tong.b501, lech: kq.tong.lech, xa: kq.tong.xa, tinh: kq.tong.tinh }, dongTong: { a: kq.dongTong.tt15, b: (kq.dongTong.xa || 0) + (kq.dongTong.tinh || 0) }, soLech: kq.soLech, kbLoc: kq.kbLoc }, rows: kq.rows };
  });
  const m = new Map();
  for (const c of cts) for (const r of c.rows) {
    const kbB5 = () => Object.keys(f.XA?.ds.get(r.ma_da)?.theoKB || f.TINH?.ds.get(r.ma_da)?.theoKB || {})[0] || '';
    const x = m.get(r.ma_da) || { key: r.ma_da, ma_da: r.ma_da, ten: r.ten, kb: r.kb || t.ds.get(r.ma_da)?.kb || kbB5(), v: {} };
    x.v[c.k] = { a: r.tt15, b: r.b501, xa: r.xa, tinh: r.tinh, lech: r.lech, coLech: r.coLech, ly_do: r.ly_do };
    m.set(r.ma_da, x);
  }
  return { a: `THBC ${l}`, b: 'B5-01', cts, rows: hoanTatDong(m, cts), coPhong: true, kbLoc: cts[0]?.kq.kbLoc };
}
function moHinhTT(a, b) {
  const cts = ['KD', 'NAM', 'GN'].map(k => {
    const kq = B5.soSanhTHBC(a, b, k), [cot, ten] = COT_THBC_TEN.TT37[k];
    return { k, ten, cot, moTa: `TT37 cột ${cot} ⇄ TT85 ${COT_TT85_TEN[k]}`, kq: { tong: kq.tong, dongTong: kq.dongTong, soLech: kq.soLech }, rows: kq.rows };
  });
  const m = new Map();
  for (const c of cts) for (const r of c.rows) {
    const key = r.ma_da + '|' + r.kb;
    const x = m.get(key) || { key, ma_da: r.ma_da, ten: r.ten, kb: r.kb, v: {} };
    x.v[c.k] = { a: r.a, b: r.b, lech: r.lech, coLech: r.coLech, ly_do: r.ly_do };
    m.set(key, x);
  }
  return { a: 'TT37', b: 'TT85', cts, rows: hoanTatDong(m, cts), coPhong: true, theoKB: true };
}
// TT85 ↔ ĐTKB-GD: cột cùng màu trên 2 file (vàng L⇄W, đỏ M⇄Y, xanh dương R⇄AC, xanh lá S⇄AD), theo dự án có trong sổ và KBNN lập sổ
const CT_DTKB = [
  { k: 'L', b: 'W', mau: '#FFFF00', ten: 'Thanh toán KH vốn kéo dài – Số vốn thanh toán KLHT', tenB: 'TTKLHT – vốn KH kéo dài' },
  { k: 'M', b: 'Y', mau: '#FF0000', ten: 'Thanh toán KH vốn kéo dài – Số vốn tạm ứng theo chế độ chưa thu hồi', tenB: 'Vốn tạm ứng theo chế độ chưa thu hồi – KH kéo dài' },
  { k: 'R', b: 'AC', mau: '#00B0F0', ten: 'Thanh toán KH vốn năm 2026 – Số vốn thanh toán KLHT', tenB: 'TTKLHT – vốn KH năm' },
  { k: 'S', b: 'AD', mau: '#92D050', ten: 'Thanh toán KH vốn năm 2026 – Số vốn tạm ứng theo chế độ chưa thu hồi', tenB: 'Vốn tạm ứng theo chế độ chưa thu hồi – KH năm' },
];
function moHinhDTKB(t, so) {
  const kbs = Object.keys(so).sort(), m = new Map();
  for (const kb of kbs) {
    const d = so[kb];
    // phạm vi = các dự án có trong sổ (sổ có thể lập cho một đơn vị / chủ đầu tư, không phải cả KBNN)
    for (const mda of d.ds.keys()) {
      const x = t.ds.get(mda), a = x?.theoKB?.[kb], b = d.ds.get(mda);
      const r = { key: mda + '|' + kb, ma_da: mda, ten: x?.ten || b?.ten || '', kb, v: {} };
      for (const c of CT_DTKB) {
        const va = a?.c?.[c.k] || 0, vb = b?.v[c.b] || 0, lech = va - vb, coLech = Math.abs(lech) >= B5.SAI_SO;
        r.v[c.k] = { a: va, b: vb, lech, coLech, ly_do: !coLech ? '' : !a ? `Không có trên TT85 (KBNN ${kb})` : lech > 0 ? 'TT85 lớn hơn ĐTKB-GD' : 'ĐTKB-GD lớn hơn TT85' };
      }
      if (CT_DTKB.some(c => r.v[c.k].a || r.v[c.k].b)) m.set(r.key, r);
    }
  }
  const rows = [...m.values()];
  const cts = CT_DTKB.map(c => {
    const sum = f => rows.reduce((s, r) => s + r.v[c.k][f], 0);
    return { k: c.k, ten: c.ten, cot: c.k, mau: c.mau, moTa: `TT85 cột ${c.k} ⇄ ĐTKB-GD cột ${c.b} (${c.tenB})`,
      kq: { tong: { a: sum('a'), b: sum('b'), lech: sum('lech') }, soLech: rows.filter(r => r.v[c.k].coLech).length } };
  });
  return { a: 'TT85', b: 'ĐTKB-GD', cts, rows: hoanTatDong(new Map(rows.map(r => [r.key, r])), cts), coPhong: true, theoKB: true, kbs };
}
function viewDTKB(v) {
  const t = B5S.file.TT85, so = B5S.dtkb, kbs = Object.keys(so).sort(), st = DCS.dtkb;
  const ky = [t?.ky?.den, ...kbs.map(k => so[k].ky?.den)].filter(Boolean);
  const oSo = kbs.length ? kbs.map(k => `<span class="dc-chip ok" title="${esc(so[k].ten_file)}${so[k].ky ? ' · kỳ ' + esc(so[k].ky.tu) + ' – ' + esc(so[k].ky.den) : ''}">✓ <b>ĐTKB-GD ${esc(k)}</b> <span>${esc(tenPhongKB(k))} · ${esc(so[k].ten_file)} · ${fmtDong(so[k].ds.size)} DA</span></span>`).join('')
    : oNguon('Sổ ĐTKB-GD', null);
  v.innerHTML = `<div class="card dc-gon no-print"><h2>Đối chiếu số liệu: Thông tư 85 ⇄ ĐTKB-GD</h2>
    ${dongDC('Nguồn số liệu', `${oNguon(TEN_FILE_DC.TT85, t)}<span class="dc-ngan">⇄</span>${oSo}${nutTaiDC('BC TT85, sổ ĐTKB-GD (nhiều phòng)')}
      ${kbs.length ? '<button class="btn small ghost" id="dtkbXoa" title="Bỏ các sổ ĐTKB-GD đã tải để tải lại">Bỏ sổ ĐTKB-GD đã tải</button>' : ''}`)}
    ${dongDC('Cột đối chiếu', `<span class="muted small">Đối chiếu các cột cùng màu trên 2 file, theo từng dự án của KBNN lập sổ:</span> ${CT_DTKB.map(c => `<span class="dc-chip"><span class="mau-o" style="background:${c.mau}"></span><b>TT85 cột ${c.k}</b> ⇄ <b>ĐTKB-GD cột ${c.b}</b></span>`).join('')}`)}
    ${new Set(ky).size > 1 ? `<div class="warnbox">⚠ Các file khác ngày số liệu (${[...new Set(ky)].map(esc).join(', ')}) – nên dùng cùng ngày để đối chiếu chính xác.</div>` : ''}
    ${kbs.length && t ? `<div class="okbox">Đối chiếu các dự án có trong sổ ĐTKB-GD với số TT85 của đúng KBNN lập sổ: ${kbs.map(k => `<b>${esc(k)}</b> – ${esc(tenPhongKB(k))} (${fmtDong(so[k].ds.size)} dự án)`).join(', ')}. Muốn đối chiếu thêm đơn vị / phòng khác thì tải thêm sổ.</div>` : ''}
  </div><div id="dckq"></div>`;
  ganTaiDC(v, viewDTKB);
  v.querySelector('#dtkbXoa')?.addEventListener('click', () => { B5S.dtkb = {}; viewDTKB(v); });
  const box = v.querySelector('#dckq');
  const thieu = [!t && 'BC Thông tư 85', !kbs.length && 'sổ ĐTKB-GD'].filter(Boolean);
  if (thieu.length) { box.innerHTML = `<div class="card"><p class="muted" style="margin:0">Chưa đủ file: còn thiếu ${thieu.join(', ')}. Bấm <b>📂 Tải file…</b> ở trên để chọn (chọn được nhiều sổ ĐTKB-GD của các phòng cùng lúc).</p></div>`; return; }
  veDoiChieu(box, moHinhDTKB(t, so), st, { tenFile: 'Doi chieu TT85 - DTKB-GD', ngay: t.ky?.den });
}
function hoanTatDong(m, cts) {
  const rows = [...m.values()];
  for (const r of rows) { r.soLech = cts.filter(c => r.v[c.k]?.coLech).length; r.maxLech = Math.max(0, ...cts.map(c => Math.abs(r.v[c.k]?.lech || 0))); }
  return rows;
}

// ---- Trang đối chiếu (3 cặp biểu): nguồn số liệu → tổng hợp kết quả → chi tiết dự án (đủ các chỉ tiêu)
function viewB501(v) {
  const tab = S.tab, l = tab === 'b585' ? 'TT85' : 'TT37', st = DCS[tab];
  const f = B5S.file, t = f[l];
  const ky = [t?.ky?.den, f.XA?.ky?.den, f.TINH?.ky?.den].filter(Boolean);
  v.innerHTML = `<div class="card dc-gon no-print"><h2>Đối chiếu số liệu: B5-01 ⇄ Thông tư ${l === 'TT85' ? '85' : '37'}</h2>
    ${dongDC('Nguồn số liệu', `${oNguon('B5-01 NS tỉnh', f.TINH)}${oNguon('B5-01 NS xã', f.XA)}<span class="dc-ngan">⇄</span>${oNguon(TEN_FILE_DC[l], t)}
      ${nutTaiDC(`B5-01 NS tỉnh, NS xã, BC TT${l === 'TT85' ? '85' : '37'}`)}`)}
    ${new Set(ky).size > 1 ? `<div class="warnbox">⚠ Các file khác ngày số liệu (${[...new Set(ky)].map(esc).join(', ')}) – nên dùng cùng ngày để đối chiếu chính xác.</div>` : ''}
  </div><div id="dckq"></div>`;
  ganTaiDC(v, viewB501);
  const box = v.querySelector('#dckq');
  const thieu = [!f.TINH && 'B5-01 NS tỉnh', !f.XA && 'B5-01 NS xã', !t && `BC Thông tư ${l === 'TT85' ? '85' : '37'}`].filter(Boolean);
  if (thieu.length) { box.innerHTML = `<div class="card"><p class="muted" style="margin:0">Chưa đủ file: còn thiếu ${thieu.map(esc).join(', ')}. Bấm <b>📂 Tải file…</b> ở trên để chọn.</p></div>`; return; }
  veDoiChieu(box, moHinhB5(l, t, f), st, { tenFile: `Doi chieu B5-01 - ${l}`, ngay: t.ky?.den });
}
function viewTT3785(v) {
  const f = B5S.file, a = f.TT37, b = f.TT85, st = DCS.tt3785;
  const ky = [a?.ky?.den, b?.ky?.den].filter(Boolean);
  v.innerHTML = `<div class="card dc-gon no-print"><h2>Đối chiếu số liệu: Thông tư 37 ⇄ Thông tư 85</h2>
    ${dongDC('Nguồn số liệu', `${oNguon(TEN_FILE_DC.TT37, a)}<span class="dc-ngan">⇄</span>${oNguon(TEN_FILE_DC.TT85, b)}${nutTaiDC('BC TT37, BC TT85')}`)}
    ${new Set(ky).size > 1 ? `<div class="warnbox">⚠ Hai biểu khác ngày số liệu (TT37 đến ${esc(a.ky.den)}, TT85 đến ${esc(b.ky.den)}) – một phần chênh lệch có thể do khác ngày.</div>` : ''}
  </div><div id="dckq"></div>`;
  ganTaiDC(v, viewTT3785);
  const box = v.querySelector('#dckq');
  if (!a || !b) { box.innerHTML = `<div class="card"><p class="muted" style="margin:0">Chưa đủ file: còn thiếu ${[!a && 'BC Thông tư 37', !b && 'BC Thông tư 85'].filter(Boolean).join(', ')}. Bấm <b>📂 Tải file…</b> ở trên để chọn.</p></div>`; return; }
  veDoiChieu(box, moHinhTT(a, b), st, { tenFile: 'Doi chieu TT37 - TT85', ngay: a.ky?.den });
}
function veDoiChieu(box, M, st, opt) {
  const cls = n => Math.abs(n) < B5.SAI_SO ? '' : n > 0 ? 'duong' : 'am';
  const cdt = new Map((S.cdt || []).map(x => [x.ma_da, x]));
  const soLechAny = M.rows.filter(r => r.soLech).length;
  if (st.ct !== '*' && !M.cts.some(c => c.k === st.ct)) st.ct = '*';
  const cts = st.ct === '*' ? M.cts : M.cts.filter(c => c.k === st.ct);
  const lechCT = r => st.ct === '*' ? r.soLech > 0 : !!r.v[st.ct]?.coLech;
  let ds = M.rows.filter(r => (st.loc === 'tat' || lechCT(r)) && (st.phong === '*' || r.kb === st.phong));
  const q = norm(st.tim);
  if (q) ds = ds.filter(r => norm(r.ma_da).includes(q) || norm(r.ten).includes(q) );
  const doLon = r => st.ct === '*' ? r.maxLech : Math.abs(r.v[st.ct]?.lech || 0);
  ds.sort((x, y) => doLon(y) - doLon(x) || x.ma_da.localeCompare(y.ma_da));
  // theo phòng giao dịch (TT37 ↔ TT85)
  let phong = [];
  if (M.coPhong) {
    const pm = new Map();
    for (const r of M.rows) { const p = pm.get(r.kb) || { kb: r.kb, soDA: 0, soLech: 0, lech: {}, soCT: {} }; p.soDA++; if (r.soLech) p.soLech++;
      for (const c of M.cts) { p.lech[c.k] = (p.lech[c.k] || 0) + (r.v[c.k]?.lech || 0); if (r.v[c.k]?.coLech) p.soCT[c.k] = (p.soCT[c.k] || 0) + 1; } pm.set(r.kb, p); }
    phong = [...pm.values()].sort((x, y) => x.kb.localeCompare(y.kb));
  }
  const nhanCT = c => `${c.mau ? `<span class="mau-o" style="background:${c.mau}"></span>` : ''}${esc(c.ten)} <small>(cột ${esc(c.cot)})</small>`;
  const ghi = r => [...new Set(cts.map(c => r.v[c.k]?.coLech ? r.v[c.k].ly_do : '').filter(Boolean))].join('; ');
  const HIEN = 1500;
  box.innerHTML = `<div class="card">
    <div class="dc-kq-dau"><h3>Tổng hợp kết quả</h3>
      <div class="actions" style="margin:0">${coXuat() ? '<button class="btn primary" id="dcxuat">⬇ Xuất Excel kết quả đối chiếu</button>' : '<span class="muted small"></span>'}</div></div>
    ${M.kbLoc ? `<div class="okbox">File THBC gồm nhiều KBNN: chỉ lấy số của khối KBNN <b>${esc(M.kbLoc)}</b> (đơn vị lập B5-01).</div>` : ''}
    <div class="${soLechAny ? 'warnbox' : 'okbox'}">${soLechAny ? `Có <b>${soLechAny}</b> dự án${M.theoKB ? ' (theo mã KBNN)' : ''} chênh lệch ở ít nhất một chỉ tiêu, trên tổng số ${M.rows.length} dự án có số liệu.` : `✓ ${M.a} và ${M.b} khớp ở tất cả chỉ tiêu, đến từng dự án.`}</div>
    <div class="tbl-wrap"><table class="tbl ss"><thead><tr><th>Chỉ tiêu (tên cột THBC)</th><th>Cột đối chiếu</th><th>${esc(M.a)}</th><th>${esc(M.b)}</th><th>Chênh lệch<br>${esc(M.a)} − ${esc(M.b)}</th><th>Số dự án<br>chênh lệch</th></tr></thead>
    <tbody>${M.cts.map(c => `<tr class="click ${st.ct === c.k ? 'chon' : ''}" data-ctk="${c.k}" title="Bấm để xem các dự án chênh lệch ở chỉ tiêu này"><td><b>${nhanCT(c)}</b></td><td class="small">${esc(c.moTa)}</td>
      <td class="num">${f3(c.kq.tong.a)}</td><td class="num">${f3(c.kq.tong.b)}</td><td class="num ${cls(c.kq.tong.lech)}"><b>${f3(c.kq.tong.lech)}</b></td>
      <td class="c">${c.kq.soLech ? `<span class="chip am">${c.kq.soLech}</span>` : '<span class="chip duong">✓ khớp</span>'}</td></tr>`).join('')}</tbody></table></div>
    ${M.coPhong ? `<h3 style="margin-top:16px">Thống kê theo phòng giao dịch</h3>
    <div class="tbl-wrap"><table class="tbl ss dc-phong"><thead><tr><th rowspan="2">Mã KBNN – phòng giao dịch</th><th rowspan="2">Số dự án</th><th rowspan="2">Dự án<br>chênh lệch</th>${M.cts.map(c => `<th colspan="2" class="nhomct">${nhanCT(c)}</th>`).join('')}</tr>
      <tr>${M.cts.map(() => '<th>Số DA lệch</th><th>Chênh lệch</th>').join('')}</tr></thead>
    <tbody>${phong.map(p => `<tr class="click ${st.phong === p.kb ? 'chon' : ''}" data-kb="${esc(p.kb)}" title="Bấm để xem dự án của phòng này"><td>${esc(p.kb || '(không rõ)')} – ${esc(p.kb ? tenPhongKB(p.kb) : '')}</td><td class="c">${p.soDA}</td><td class="c">${p.soLech ? `<span class="chip am">${p.soLech}</span>` : '<span class="chip duong">0</span>'}</td>
      ${M.cts.map(c => `<td class="c dauct">${p.soCT[c.k] ? `<b>${p.soCT[c.k]}</b>` : '-'}</td><td class="num ${cls(p.lech[c.k])}">${f3(p.lech[c.k])}</td>`).join('')}</tr>`).join('')}
      <tr class="l0"><td>Tổng cộng</td><td class="c">${M.rows.length}</td><td class="c">${soLechAny}</td>${M.cts.map(c => `<td class="c dauct">${c.kq.soLech || '-'}</td><td class="num">${f3(c.kq.tong.lech)}</td>`).join('')}</tr></tbody></table></div>` : ''}
  </div>
  <div class="card" id="dcct">
    <div class="dc-kq-dau"><h3>Chi tiết dự án</h3></div>
    <div class="bar">
      <label>Chỉ tiêu chênh lệch<select id="dcctl"><option value="*">Tất cả chỉ tiêu (${soLechAny})</option>${M.cts.map(c => `<option value="${c.k}" ${st.ct === c.k ? 'selected' : ''}>${esc(c.ten)} – cột ${esc(c.cot)} (${c.kq.soLech})</option>`).join('')}</select></label>
      ${M.coPhong ? `<label>Phòng giao dịch<select id="dcph"><option value="*">Tất cả phòng (${soLechAny} DA chênh lệch)</option>${phong.map(p => `<option value="${esc(p.kb)}" ${st.phong === p.kb ? 'selected' : ''}>${esc(p.kb)} – ${esc(p.kb ? tenPhongKB(p.kb) : '')} (${p.soLech} DA chênh lệch)</option>`).join('')}</select></label>` : ''}
      <label>Hiển thị<select id="dcloc"><option value="lech" ${st.loc === 'lech' ? 'selected' : ''}>Chỉ dự án chênh lệch</option><option value="tat" ${st.loc === 'tat' ? 'selected' : ''}>Tất cả dự án có số</option></select></label>
      <label style="min-width:240px">Tìm mã / tên dự án<input id="dctim" value="${esc(st.tim)}"></label>
    </div>
    <div class="tbl-wrap tall"><table class="tbl ss dc-bang"><thead>
      <tr><th rowspan="2">STT</th><th rowspan="2">Mã DA</th><th rowspan="2" class="ten">Tên dự án</th>${M.coPhong ? '<th rowspan="2" class="kbc">Mã KBNN –<br>phòng giao dịch</th>' : ''}
        ${cts.map(c => `<th colspan="3" class="nhomct">${nhanCT(c)}</th>`).join('')}<th rowspan="2" class="nxc">Nhận xét</th></tr>
      <tr>${cts.map(() => `<th>${esc(M.a)}</th><th>${esc(M.b)}</th><th>Chênh lệch</th>`).join('')}</tr></thead>
    <tbody>${ds.slice(0, HIEN).map((r, i) => `<tr><td class="c">${i + 1}</td><td>${esc(r.ma_da)}</td><td class="ten" title="${esc(r.ten)}">${esc(r.ten)}</td>${M.coPhong ? `<td class="kbc"><b>${esc(r.kb)}</b><br><span class="small muted">${esc(r.kb ? tenPhongKB(r.kb) : '')}</span></td>` : ''}
      ${cts.map(c => { const x = r.v[c.k] || { a: 0, b: 0, lech: 0 }; return `<td class="num dauct" ${x.xa !== undefined ? `title="B5-01 NS xã ${f3(x.xa) || 0} · NS tỉnh ${f3(x.tinh) || 0}"` : ''}>${f3(x.a)}</td><td class="num">${f3(x.b)}</td><td class="num ${x.coLech ? cls(x.lech) + ' lechct' : ''}"><b>${x.coLech ? f3(x.lech) : '-'}</b></td>`; }).join('')}
      <td class="small nxc">${esc(ghi(r))}</td></tr>`).join('') || `<tr><td colspan="${4 + (M.coPhong ? 1 : 0) + cts.length * 3}" class="empty">Không có dự án phù hợp.</td></tr>`}</tbody></table></div>
    <p class="small muted">Đơn vị: triệu đồng. Bỏ qua chênh dưới 0,001 triệu (làm tròn). Chênh lệch = ${esc(M.a)} − ${esc(M.b)}; xanh: ${esc(M.a)} lớn hơn, đỏ: ${esc(M.b)} lớn hơn. ${ds.length > HIEN ? `Đang hiện ${fmtDong(HIEN)}/${fmtDong(ds.length)} dự án – xuất Excel để xem đủ.` : `${fmtDong(ds.length)} dự án.`}</p></div>`;
  // tiêu đề 2 dòng: dòng thứ hai dính ngay dưới dòng thứ nhất khi cuộn
  const tb = box.querySelector('.dc-bang'), h1 = tb.querySelector('thead tr:first-child');
  const datTop = () => { const h = h1.getBoundingClientRect().height; tb.querySelectorAll('thead tr:nth-child(2) th').forEach(th => th.style.top = h + 'px'); };
  datTop(); requestAnimationFrame(datTop);
  const ve = () => veDoiChieu(box, M, st, opt);
  box.querySelectorAll('tr[data-ctk]').forEach(tr => tr.onclick = () => { st.ct = st.ct === tr.dataset.ctk ? '*' : tr.dataset.ctk; ve(); box.querySelector('#dcct').scrollIntoView({ behavior: 'smooth' }); });
  box.querySelectorAll('tr[data-kb]').forEach(tr => tr.onclick = () => { st.phong = st.phong === tr.dataset.kb ? '*' : tr.dataset.kb; ve(); box.querySelector('#dcct').scrollIntoView({ behavior: 'smooth' }); });
  box.querySelector('#dcctl').onchange = e => { st.ct = e.target.value; ve(); };
  box.querySelector('#dcph')?.addEventListener('change', e => { st.phong = e.target.value; ve(); });
  box.querySelector('#dcloc').onchange = e => { st.loc = e.target.value; ve(); };
  let hen; box.querySelector('#dctim').oninput = e => { st.tim = e.target.value; clearTimeout(hen); hen = setTimeout(() => { ve(); const i = box.querySelector('#dctim'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300); };
  box.querySelector('#dcxuat')?.addEventListener('click', () => xuatDoiChieu(M, opt).catch(fail));
}
async function xuatDoiChieu(M, opt) {
  const ExcelJS = await loadExcelJS();
  const cdt = new Map((S.cdt || []).map(x => [x.ma_da, x]));
  const wb = new ExcelJS.Workbook(), NF = '#,##0.000;[Red]-#,##0.000;"-"';
  const w0 = wb.addWorksheet('Tong hop');
  w0.addRow([`ĐỐI CHIẾU SỐ LIỆU ${M.a.toUpperCase()} VỚI ${M.b.toUpperCase()}`]).font = { bold: true, size: 13 };
  w0.addRow([`Số liệu đến ngày ${opt.ngay || ''}. Đơn vị: triệu đồng. Chênh lệch = ${M.a} − ${M.b}.`]);
  w0.addRow([]);
  w0.addRow(['Chỉ tiêu (tên cột THBC)', 'Cột đối chiếu', M.a, M.b, 'Chênh lệch', 'Số dự án chênh lệch']).font = { bold: true };
  for (const c of M.cts) w0.addRow([`${c.ten} (cột ${c.cot})`, c.moTa, c.kq.tong.a, c.kq.tong.b, c.kq.tong.lech, c.kq.soLech]);
  w0.addRow(['Số dự án chênh lệch ở ít nhất một chỉ tiêu', '', '', '', '', M.rows.filter(r => r.soLech).length]).font = { bold: true };
  [60, 50, 18, 18, 18, 14].forEach((w, i) => w0.getColumn(i + 1).width = w); for (let c = 3; c <= 5; c++) w0.getColumn(c).numFmt = NF;
  if (M.coPhong) {
    const pm = new Map();
    for (const r of M.rows) { const p = pm.get(r.kb) || { kb: r.kb, soDA: 0, soLech: 0, ct: {} }; p.soDA++; if (r.soLech) p.soLech++;
      for (const c of M.cts) { const o = p.ct[c.k] ||= { so: 0, lech: 0 }; o.lech += r.v[c.k]?.lech || 0; if (r.v[c.k]?.coLech) o.so++; } pm.set(r.kb, p); }
    const wp = wb.addWorksheet('Theo phong giao dich');
    wp.addRow(['Mã KBNN', 'Phòng giao dịch', 'Số dự án', 'Dự án chênh lệch', ...M.cts.flatMap(c => [`${c.ten} (cột ${c.cot}) – số DA lệch`, 'Chênh lệch'])]).font = { bold: true };
    for (const p of [...pm.values()].sort((x, y) => x.kb.localeCompare(y.kb))) wp.addRow([p.kb, p.kb ? tenPhongKB(p.kb) : '', p.soDA, p.soLech, ...M.cts.flatMap(c => [p.ct[c.k].so, p.ct[c.k].lech])]);
    wp.addRow(['', 'Tổng cộng', M.rows.length, M.rows.filter(r => r.soLech).length, ...M.cts.flatMap(c => [c.kq.soLech, c.kq.tong.lech])]).font = { bold: true };
    [10, 24, 10, 12, ...M.cts.flatMap(() => [16, 18])].forEach((w, i) => wp.getColumn(i + 1).width = w);
    M.cts.forEach((c, i) => wp.getColumn(6 + i * 2).numFmt = NF);
    wp.getRow(1).alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' }; wp.getRow(1).height = 45;
  }
  const ws = wb.addWorksheet('Chi tiet du an', { views: [{ state: 'frozen', xSplit: 3, ySplit: 2 }] });
  const dau = ['STT', 'Mã DA', 'Tên dự án', ...(M.coPhong ? ['Mã KBNN', 'Phòng giao dịch'] : [])];
  const h1 = ws.addRow([...dau, ...M.cts.flatMap(c => [`${c.ten} (cột ${c.cot})`, '', '']), 'Số chỉ tiêu chênh lệch', 'Nhận xét']);
  const h2 = ws.addRow([...dau.map(() => ''), ...M.cts.flatMap(() => [M.a, M.b, 'Chênh lệch']), '', '']);
  dau.forEach((_, i) => ws.mergeCells(1, i + 1, 2, i + 1));
  M.cts.forEach((c, i) => ws.mergeCells(1, dau.length + 1 + i * 3, 1, dau.length + 3 + i * 3));
  const cuoi = dau.length + M.cts.length * 3;
  ws.mergeCells(1, cuoi + 1, 2, cuoi + 1); ws.mergeCells(1, cuoi + 2, 2, cuoi + 2);
  [h1, h2].forEach(h => { h.font = { bold: true }; h.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; }); h1.height = 45;
  M.cts.forEach((c, i) => { if (!c.mau) return; for (let j = 0; j < 3; j++) for (const h of [h1, h2]) h.getCell(dau.length + 1 + i * 3 + j).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + c.mau.slice(1) } }; });
  const ds = [...M.rows].sort((x, y) => (y.soLech > 0) - (x.soLech > 0) || y.maxLech - x.maxLech || x.ma_da.localeCompare(y.ma_da));
  ds.forEach((r, i) => {
    const row = ws.addRow([i + 1, r.ma_da, r.ten, ...(M.coPhong ? [r.kb, r.kb ? tenPhongKB(r.kb) : ''] : []),
      ...M.cts.flatMap(c => { const x = r.v[c.k] || { a: 0, b: 0, lech: 0 }; return [x.a, x.b, Math.round(x.lech * 1e6) / 1e6]; }), r.soLech,
      [...new Set(M.cts.map(c => r.v[c.k]?.coLech ? r.v[c.k].ly_do : '').filter(Boolean))].join('; ')]);
    M.cts.forEach((c, j) => { if (r.v[c.k]?.coLech) row.getCell(dau.length + 3 + j * 3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4E5' } }; });
  });
  [6, 11, 60, ...(M.coPhong ? [9, 20] : []), ...M.cts.flatMap(() => [16, 16, 16]), 10, 40].forEach((w, i) => ws.getColumn(i + 1).width = w);
  for (let c = dau.length + 1; c <= cuoi; c++) ws.getColumn(c).numFmt = NF;
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: cuoi + 2 } };
  const buf = await wb.xlsx.writeBuffer();
  await luuFile(buf, `${opt.tenFile} ${(opt.ngay || ddmmyyyy(new Date())).replace(/\//g, '.')}.xlsx`);
}


khung();
show();
