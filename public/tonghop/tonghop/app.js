// =====================================================================
//  TỔNG HỢP GIẢI NGÂN THEO CHỦ ĐẦU TƯ
//  Đầu vào : sheet CDT, BC TT 85, BC TT 15 (file xuất từ hệ thống)
//  Đầu ra  : BC tuần CT (TT15, TT85, TT37), BC giải ngân tháng (TT85, TT37)
//  Dữ liệu lưu trên Supabase; công thức tính ở tonghop/engine.js
// =====================================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { CONFIG } from '../config.js';
import * as E from './engine.js';
import * as B5 from './b501.js';
import * as DTE from './dt.js';
import * as TD from './td.js';

const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
const app = document.getElementById('app');

const QUYEN_XEM = ['ADMIN', 'KBNN_NHAN', 'KBNN_DUYET', 'XEM', 'TH_PGD', 'TH_NV2'];
const QUYEN_SUA = ['ADMIN', 'KBNN_NHAN', 'KBNN_DUYET', 'TH_NV2'];
// Tab được xem theo vai trò (mặc định: tất cả)
const TAB_THEO_VAI_TRO = { TH_PGD: ['da', 'bc', 'dt', 'td', 'b5'] };
// Phòng giao dịch: xem báo cáo, so sánh; không in, không xuất Excel
const coXuat = () => S.me?.vai_tro !== 'TH_PGD';
const tabsCua = () => { const t = TAB_THEO_VAI_TRO[S.me?.vai_tro]; return t ? Object.fromEntries(Object.entries(TABS).filter(([k]) => t.includes(k))) : TABS; };
const TABS = { dl: 'Dữ liệu đầu vào', da: 'Danh mục dự án', bc: 'Báo cáo', dt: 'Biểu đối chiếu THBC', td: 'Dự án trọng điểm', b5: 'Đối chiếu THBC – B5-01', dc: 'Cộng thêm', ky: 'Kỳ đã lưu' };
const NGUON_TEN = { CDT: 'Sheet CDT (danh mục dự án – chủ đầu tư)', TT85: 'Sheet BC TT 85', TT15: 'Sheet BC TT 15', TT37: 'Báo cáo TT37 (mẫu 01b/TTKHN)' };
const LOAI_NGUON = ['TT85', 'TT15', 'TT37'];
// Tên sheet thường gặp → loại dữ liệu
const DOAN_SHEET = { CDT: /^\s*cdt\s*$/i, TT85: /tt\s*85/i, TT15: /tt\s*15/i, TT37: /tt\s*_?37/i };
// Bố cục mẫu
const BO_CUC = {
  TT15: { cuoi: 'AE', dauBang: 6, dongKy: 'A4', dongVB: 'B5' },
  TT85: { cuoi: 'AE', dauBang: 6, dongKy: 'A4', dongVB: 'B5' },
  THANG: { cuoi: 'R', dauBang: 5, dongKy: 'A3', dongVB: 'B4' },
};
BO_CUC.TT37 = BO_CUC.TT15; BO_CUC.THANG37 = BO_CUC.THANG;
const laThang = id => E.laThang(id);
const COT_DC = {
  TUAN: { D: 'KHV kéo dài', E: 'KHV năm 2026', U: 'GN KHV kéo dài – Thanh toán KLHT', V: 'GN KHV kéo dài – Tạm ứng',
    X: 'GN KHV năm 2026 – Thanh toán KLHT', Y: 'GN KHV năm 2026 – Tạm ứng' },
  THANG: { E: 'KHV kéo dài', F: 'KHV năm 2026', K: 'GN KHV kéo dài – Thanh toán KLHT', L: 'GN KHV kéo dài – Tạm ứng',
    N: 'GN KHV năm 2026 – Thanh toán KLHT', O: 'GN KHV năm 2026 – Tạm ứng' },
};
const cotDC = id => COT_DC[E.BAO_CAO[id].loai];

const S = {
  me: null, mau: null, tab: 'dl', bc: 'TT15',
  file: {}, cdt: null, nguon: {}, gan: {}, dc: [], ky: [],
  truoc: {}, dongKy: {}, dongVB: {}, kq: null, xem: null,
};

// ---------------------------------------------------------------- Tiện ích
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf0 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const fmt = n => (n === null || n === undefined || Number.isNaN(n)) ? '' : (Math.abs(n) < 0.5 ? '-' : nf0.format(Math.round(n)));
const fmtPct = n => (n === null || n === undefined || !Number.isFinite(n)) ? '' : (n * 100).toFixed(1).replace('.', ',') + '%';
const fmtDong = n => nf0.format(Math.round(n || 0));
const ngay = s => s ? new Date(s).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '';
const canEdit = () => QUYEN_SUA.includes(S.me?.vai_tro);
// Sửa / thêm dự án trong Danh mục dự án: thêm Phòng giao dịch
const canEditDM = () => canEdit() || S.me?.vai_tro === 'TH_PGD';
const norm = s => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type; el.textContent = msg;
  document.getElementById('toast').append(el);
  setTimeout(() => el.remove(), type === 'err' ? 7000 : 3500);
}
function viErr(e) {
  const m = e?.message || String(e);
  if (/row-level security|permission denied|Không có quyền/i.test(m)) return 'Không có quyền thực hiện thao tác này.';
  if (/Invalid login credentials/i.test(m)) return 'Sai tài khoản hoặc mã đăng nhập.';
  if (/Failed to fetch/i.test(m)) return 'Không kết nối được máy chủ. Kiểm tra mạng.';
  if (/relation .*th_.* does not exist|Could not find the (table|function)/i.test(m)) return 'Chưa tạo bảng dữ liệu. Chạy file supabase/tonghop.sql trong Supabase → SQL Editor.';
  if (/statement timeout|canceling statement/i.test(m)) return 'Máy chủ xử lý quá lâu, vui lòng thử lại.';
  return m;
}
const fail = e => { console.error(e); toast(viErr(e), 'err'); };
async function q(p) { const { data, error } = await p; if (error) throw error; return data; }
async function all(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const d = await q(build().range(from, from + 999));
    out.push(...d); if (d.length < 1000) break;
  }
  return out;
}
function modal(title, body, onOk, okLabel = 'Đồng ý') {
  return new Promise(resolve => {
    const d = document.createElement('dialog'); d.className = 'modal';
    d.innerHTML = `<form method="dialog"><h3>${title}</h3>${body}
      <div class="actions"><button class="btn ghost" value="cancel" formnovalidate>Hủy</button>
      <button class="btn primary" value="ok">${okLabel}</button></div></form>`;
    document.body.append(d); d.showModal();
    let done = false;
    d.querySelector('form').addEventListener('submit', async e => {
      if (e.submitter?.value !== 'ok') return;
      e.preventDefault();
      const b = e.submitter; b.disabled = true;
      try { if (onOk) await onOk(new FormData(e.target), d); done = true; d.close(); resolve(true); } catch (err) { fail(err); }
      b.disabled = false;
    });
    d.addEventListener('close', () => { d.remove(); if (!done) resolve(false); });
  });
}
async function loadXLSX() {
  for (const u of ['https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs', 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm']) {
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
const colLetters = last => { const n = E.colIdx(last); return Array.from({ length: n + 1 }, (_, i) => i < 26 ? String.fromCharCode(65 + i) : 'A' + String.fromCharCode(65 + i - 26)); };
const addr = a => { const m = /^([A-Z]+)(\d+)$/.exec(a); return { c: E.colIdx(m[1]), r: +m[2] }; };
const ddmmyyyy = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
const parseDMY = s => { const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s || ''); return m ? new Date(+m[3], m[2] - 1, +m[1]) : null; };

// ---------------------------------------------------------------- Khởi động
async function boot() {
  try {
    S.mau = S.mau || await (await fetch(new URL('./mau.json', import.meta.url))).json();
    for (const id of Object.keys(E.BAO_CAO)) S.mau[id] ||= S.mau[E.mauCua(id)];   // TT37 dùng mẫu TT15 / mẫu tháng
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return renderLogin();
    S.me = (await q(sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle()));
    if (!S.me || !S.me.hoat_dong) { await sb.auth.signOut(); toast('Tài khoản chưa được cấp quyền.', 'err'); return renderLogin(); }
    if (!QUYEN_XEM.includes(S.me.vai_tro)) {
      app.innerHTML = `<div class="login-wrap"><div class="card"><h2>Không có quyền truy cập</h2>
        <p>Chức năng tổng hợp theo chủ đầu tư dành cho Quản trị, KBNN và tài khoản tổng hợp.</p>
        <button class="btn" id="out">Đăng xuất</button></div></div>`;
      app.querySelector('#out').onclick = async () => { await sb.auth.signOut(); renderLogin(); };
      return;
    }
    if (!tabsCua()[S.tab]) S.tab = Object.keys(tabsCua())[0];
    document.body.classList.toggle('khong-in', !coXuat());
    renderShell();
    await taiDuLieu();
    show();
  } catch (e) { fail(e); app.innerHTML = `<div class="loading">${esc(viErr(e))}</div>`; }
}

// Biểu tượng trang trí (tự vẽ: mái cột + đồng tiền) – không phải logo chính thức
const HUY_HIEU = `<svg viewBox="0 0 96 96" width="76" height="76"><defs><linearGradient id="kbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6d77a"/><stop offset="1" stop-color="#c99a2e"/></linearGradient></defs>
  <circle cx="48" cy="48" r="45" fill="#0f3d6e" stroke="url(#kbg)" stroke-width="3"/>
  <circle cx="48" cy="48" r="38" fill="none" stroke="url(#kbg)" stroke-width="1" stroke-dasharray="2 3" opacity=".8"/>
  <path d="M22 40 L48 24 L74 40 Z" fill="url(#kbg)"/><rect x="24" y="41" width="48" height="4" rx="1" fill="url(#kbg)"/>
  <g fill="url(#kbg)"><rect x="28" y="47" width="5" height="18" rx="1"/><rect x="38" y="47" width="5" height="18" rx="1"/><rect x="53" y="47" width="5" height="18" rx="1"/><rect x="63" y="47" width="5" height="18" rx="1"/></g>
  <rect x="22" y="66" width="52" height="5" rx="1" fill="url(#kbg)"/><circle cx="48" cy="34" r="4" fill="#0f3d6e"/></svg>`;
const ICON_TCKB = `<svg viewBox="0 0 48 48" width="38" height="38"><path d="M8 17 L24 8 L40 17 Z"/><rect x="9" y="18" width="30" height="3" rx="1"/>
  <rect x="12" y="23" width="4" height="13" rx="1"/><rect x="19" y="23" width="4" height="13" rx="1"/><rect x="26" y="23" width="4" height="13" rx="1"/><rect x="33" y="23" width="4" height="13" rx="1"/>
  <rect x="8" y="37" width="32" height="4" rx="1"/></svg>`;
function renderLogin() {
  const phong = CONFIG.TONGHOP_PHONG || [];
  app.innerHTML = `<div class="login-wrap kb-login">
    <div class="kb-nen" aria-hidden="true"></div>
    <div class="hero">
      <div class="kb-huy" aria-hidden="true">${HUY_HIEU}</div>
      <div class="kb-org">KHO BẠC NHÀ NƯỚC · KHU VỰC VIII</div>
      <h1>Hệ thống báo cáo giải ngân vốn đầu tư công</h1>
      <p class="sub">Chọn đơn vị để vào hệ thống</p></div>
    <div class="phong-grid">${phong.map((p, i) => `<button class="phong" data-i="${i}">
      <span class="ic">${p.bieu_tuong || '🏢'}</span><b>${esc(p.ten)}</b><span>${esc(p.mo_ta || '')}</span></button>`).join('')}</div>
    <form class="card login" id="fp" hidden><h3 id="fp-ten"></h3>
      <label>Mã đăng nhập<input name="p" type="password" autocomplete="current-password"></label>
      <button class="btn primary">Vào hệ thống</button></form>
    <a class="tckb" href="https://tckb-kbviii.vercel.app/" target="_blank" rel="noopener" title="Mở Ứng dụng tra cứu Kho bạc">
      <span class="tckb-ic">${ICON_TCKB}</span><span class="tckb-chu"><b>TCKB+</b><span>Ứng dụng tra cứu Kho bạc</span></span><span class="tckb-mo">↗</span></a>
    </div>`;
  const dangNhap = async (u, pw, btn) => {
    if (btn) { btn.disabled = true; }
    const { error } = await sb.auth.signInWithPassword({ email: `${u}@${CONFIG.EMAIL_DOMAIN}`, password: pw });
    if (btn) btn.disabled = false;
    if (error) return fail(error);
    boot();
  };
  let chon = null;
  app.querySelector('.phong-grid').addEventListener('click', e => {
    const b = e.target.closest('.phong'); if (!b) return;
    chon = phong[+b.dataset.i];
    if (chon.ma) return dangNhap(chon.tai_khoan, chon.ma, b);
    const fp = app.querySelector('#fp'); fp.hidden = false;
    fp.querySelector('#fp-ten').textContent = chon.ten; fp.p.value = ''; fp.p.focus();
  });
  app.querySelector('#fp').addEventListener('submit', e => { e.preventDefault(); dangNhap(chon.tai_khoan, e.target.p.value, e.submitter); });
}

function renderShell() {
  app.innerHTML = `
    <header class="topbar">
      <div><div class="org">${esc(CONFIG.TEN_DON_VI || 'KBNN KHU VỰC VIII')}</div><h1>📑 Hệ thống báo cáo giải ngân vốn đầu tư công</h1></div>
      <div class="who"><div><b>${esc(S.me.ho_ten)}</b><span>${canEdit() ? 'Quản trị – được cập nhật dữ liệu' : canEditDM() ? 'Hoàn thiện danh mục dự án' : 'Chỉ xem'}</span></div>
        <a class="btn small" href="/?cong=1" title="Về trang chủ hệ thống" style="text-decoration:none">🏠 Trang chủ</a>
        <button class="btn small" id="logout">Đăng xuất</button></div>
    </header>
    <nav class="tabs">${Object.entries(tabsCua()).map(([k, v]) => `<button class="tab ${k === S.tab ? 'on' : ''}" data-tab="${k}">${v}</button>`).join('')}
      <a class="tab tab-link" href="https://tckb-kbviii.vercel.app/" target="_blank" rel="noopener" title="Mở Ứng dụng tra cứu Kho bạc (TCKB+) ở tab mới">🏛️ Ứng dụng tra cứu Kho bạc ↗</a></nav>
    <main id="view"><div class="loading">Đang tải dữ liệu...</div></main>`;
  app.querySelector('.tabs').addEventListener('click', e => {
    const t = e.target.closest('[data-tab]'); if (!t) return;
    S.tab = t.dataset.tab; S.xem = null;
    app.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b === t));
    show();
  });
  app.querySelector('#logout').onclick = async () => { await sb.auth.signOut(); S.me = null; S.tab = 'dl'; renderLogin(); };
}
const view = () => document.getElementById('view');

function show() {
  const v = view(); if (!v) return;
  ({ dl: viewDuLieu, da: viewDanhMuc, bc: viewBaoCao, dt: viewDT, td: viewTD, b5: viewB501, dc: viewCongThem, ky: viewKy })[S.tab](v);
}

// ---------------------------------------------------------------- Dữ liệu
async function taiDuLieu() {
  // Phòng giao dịch chỉ cần danh mục dự án → không tải số liệu TT85/TT15
  const coNguon = Object.keys(tabsCua()).some(t => t !== 'da');
  const [files, goi, dc, ky] = await Promise.all([
    q(sb.from('th_nguon_file').select('*')),
    q(sb.rpc('th_tai_du_lieu', { p_co_nguon: coNguon })),        // 1 lần gọi, dữ liệu dạng mảng gọn
    coNguon ? q(sb.from('th_dieu_chinh').select('*').order('bao_cao').order('dong')) : [],
    coNguon ? q(sb.from('th_ky').select('id,bao_cao,ten,dong_tieu_de,so_van_ban,ky_truoc_id,chot,tao_boi,tao_luc').order('tao_luc', { ascending: false })) : [],
  ]);
  S.file = Object.fromEntries(files.map(f => [f.loai, f]));
  S.cdt = goi.cdt.map(([ma_da, ten_da, cdt, cdt2, kbnn, dac_thu, loai_ct, ctmt, thu_tu, sua_tay, them_tay, cap_nhat_luc, cap_nhat_boi, ctmt_2630]) =>
    ({ ma_da, ten_da, cdt, cdt2, kbnn, dac_thu, loai_ct, ctmt, ctmt_2630, thu_tu, sua_tay, them_tay, cap_nhat_luc, cap_nhat_boi }));
  const nguon = goi.nguon.map(([loai, ma_da, dia_diem, kb, so, ten]) => ({ loai, ma_da, dia_diem, kb, so, ten: ten || '' }));
  S.nguon = Object.fromEntries(LOAI_NGUON.map(l => [l, nguon.filter(r => r.loai === l)]));
  S.dc = dc; S.ky = ky;
  S.ghiChu = coNguon ? await q(sb.from('th_ghi_chu').select('*')) : [];
  tinhGan();
}
const ghiChu = (bc, dong) => S.ghiChu?.find(g => g.bao_cao === bc && g.dong === dong);
async function luuGhiChu(bc, dong, ten, noi_dung) {
  const rec = { bao_cao: bc, dong, ten_dong: ten, noi_dung: noi_dung || null, cap_nhat_boi: S.me.ho_ten, cap_nhat_luc: new Date().toISOString() };
  await q(sb.from('th_ghi_chu').upsert(rec));
  const cu = ghiChu(bc, dong); if (cu) Object.assign(cu, rec); else S.ghiChu.push(rec);
}
// Ô ghi chú (sửa được với Phòng NV2, Phòng giao dịch; tự lưu khi rời ô)
const oGhiChu = (bc, dong) => {
  const g = ghiChu(bc, dong), t = g?.noi_dung || '';
  const tip = g?.noi_dung ? `${g.cap_nhat_boi || ''} · ${ngay(g.cap_nhat_luc)}` : '';
  return canEditDM() ? `<input class="gc" data-gc="${bc}|${dong}" value="${esc(t)}" title="${esc(tip)}" placeholder="…">` : `<span title="${esc(tip)}">${esc(t)}</span>`;
};
function ganGhiChu(box, mau) {
  box.addEventListener('change', async e => {
    const inp = e.target.closest('input[data-gc]'); if (!inp) return;
    const [bc, dong] = inp.dataset.gc.split('|');
    try { await luuGhiChu(bc, +dong, mau.rows[+dong]?.ten, inp.value.trim()); inp.classList.add('sua'); toast('Đã lưu ghi chú.', 'ok'); }
    catch (err) { fail(err); }
  });
}
function tinhGan() {
  S.gan = {};
  for (const l of LOAI_NGUON) S.gan[l] = E.ganCDT(S.nguon[l] || [], S.cdt || []);
  S.kq = null; nguonCache.clear();
}
// Dòng nguồn của một báo cáo (BC tháng TT37: đổi cột về vị trí mẫu tháng đọc)
const nguonCache = new Map();
const nguonCua = id => {
  const rows = S.gan[E.BAO_CAO[id].nguon]?.rows || [];
  if (!E.BAO_CAO[id].doiCot) return rows;
  let c = nguonCache.get(id); if (!c || c.rows !== rows) nguonCache.set(id, c = { rows, out: E.chuyenNguon(id, rows) });
  return c.out;
};

// ================================================================ TAB 1: DỮ LIỆU ĐẦU VÀO
function viewDuLieu(v) {
  const card = loai => {
    const f = S.file[loai];
    return `<div class="src ${f ? 'ok' : 'no'}"><h3>${esc(NGUON_TEN[loai])}</h3>
      ${f ? `<div><b>${fmtDong(f.so_dong)}</b> dòng${loai === 'CDT' ? ' dự án' : ' có mã dự án'}</div>
        ${f.ky_in ? `<div class="small">${esc(f.ky_in)}</div>` : ''}
        <div class="st">File: ${esc(f.ten_file || '')}<br>Cập nhật ${esc(ngay(f.tai_luc))} · ${esc(f.tai_boi || '')}</div>`
      : '<div class="st">Chưa có dữ liệu</div>'}</div>`;
  };
  v.innerHTML = `
    <div class="card"><h2>Dữ liệu đang dùng để lập báo cáo</h2>
      <div class="src-grid">${card('CDT')}${card('TT85')}${card('TT15')}${card('TT37')}</div>
      ${canEdit() ? `<div class="actions"><label class="btn primary">📂 Chọn file Excel để cập nhật…
        <input type="file" id="f" accept=".xlsx,.xls,.xlsm" hidden></label>
        <span class="muted small">Có thể chọn cả file "BC Chủ đầu tư" (gồm 3 sheet) hoặc từng file xuất từ hệ thống (BC TT 85, BC TT 15, Báo cáo TT37 mẫu 01b/TTKHN). Dữ liệu mới sẽ thay toàn bộ dữ liệu cũ của loại đó.</span></div>` : ''}
      <div id="nhap"></div></div>
    <div class="card"><h2>Kiểm tra dữ liệu</h2><div id="kt"></div>
      <p class="small muted">Đối chiếu tổng số giữa file hệ thống và báo cáo: xem ở tab <b>Báo cáo</b>, cuối trang.</p></div>`;
  v.querySelector('#f')?.addEventListener('change', e => { const f = e.target.files[0]; if (f) docFile(f, v.querySelector('#nhap')); e.target.value = ''; });
  renderKiemTra(v.querySelector('#kt'));
}

// ---- Đối chiếu tổng số
async function tinhDoiChieu(id) {
  const kq = await tinh(id, { loc: true }), k = kbLoc(id);
  const f = S.file[E.BAO_CAO[id].nguon];
  let tong = E.chuyenTong(id, f?.tong);
  // lọc KBNN: đối chiếu với dòng tổng của khối KBNN đó trong file hệ thống
  if (k && tong) tong = { ...tong, nhan: tong.kb?.[k]?.ten || 'KBNN ' + k, tong: tong.kb?.[k]?.so || {}, kb: tong.kb?.[k] ? { [k]: tong.kb[k] } : {} };
  return { f: f && { ...f, tong }, dong: E.doiChieu(id, S.mau[id], nguonBC(id), tong, k ? dcLoc(id) : dcCua(id), kq) };
}
async function renderDoiChieu(box, id) {
  if (!nguonCua(id).length) { box.innerHTML = '<p class="muted">Chưa có dữ liệu nguồn.</p>'; return; }
  try {
    const { f, dong } = await tinhDoiChieu(id);
    const cot = cotDC(id), coTong = !!f?.tong;
    const d0 = n => n === null || n === undefined ? '' : fmtDong(n);
    const lech = n => Math.abs(n || 0) >= 1;
    const ten = d => `${d.cot} – ${esc(cot[d.cot] || d.cot)}`;
    const ly = [];
    if (!coTong) ly.push(`<li>Chưa có số tổng của file hệ thống: hãy <b>tải lại file ${esc(NGUON_TEN[E.BAO_CAO[id].nguon])}</b> để đối chiếu cột (1), (2).</li>`);
    const l12 = dong.filter(d => coTong && lech(d.f1 - d.f2));
    if (l12.length) ly.push(`<li><b>File hệ thống tự lệch:</b> dòng "${esc(f.tong.nhan || 'TỔNG')}" khác cộng dòng tổng các KBNN – ${l12.map(d => `${ten(d)}: <b>${d0(d.f1 - d.f2)}</b> đ`).join('; ')}. Báo cáo tính theo chi tiết dự án nên không bị ảnh hưởng; nên kiểm tra lại số tổng trên hệ thống.</li>`);
    const kbl = dong.flatMap(d => d.kbLech.map(x => ({ ...x, d })));
    if (kbl.length) ly.push(`<li><b>Dòng tổng KBNN khác cộng các dự án của KBNN đó:</b> ${kbl.map(x => `KB ${esc(x.kb)} (${esc(x.ten)}) – ${ten(x.d)}: <b>${d0(x.lech)}</b> đ`).join('; ')}.</li>`);
    const thieu = dong.filter(d => lech(d.thieuCDT));
    if (thieu.length) ly.push(`<li><b>Dự án chưa có mã trong sheet CDT</b> (không vào báo cáo): ${thieu.map(d => `${ten(d)}: <b>${d0(d.thieuCDT)}</b> đ`).join('; ')}. ${canEdit() ? 'Xem danh sách ở tab <b>Dữ liệu đầu vào → Kiểm tra dữ liệu</b>.' : 'Phòng giao dịch bổ sung qua nút <b>Hoàn thiện dự án đã phát sinh giải ngân</b> ở tab Danh mục dự án.'}</li>`);
    const kk = dong.filter(d => lech(d.khongKhop));
    if (kk.length) {
      const ds = E.kiemTra(id, S.mau[id], nguonBC(id)).filter(x => !x.ten.startsWith('(chưa có mã'));
      ly.push(`<li><b>Chủ đầu tư không có dòng tương ứng trên báo cáo</b> (không vào báo cáo): ${kk.map(d => `${ten(d)}: <b>${d0(d.khongKhop)}</b> đ`).join('; ')}.
        <br>Gồm: ${ds.map(x => `${esc(x.ten)} (${x.so_da} dự án)`).join('; ')}. ${laThang(id) ? 'Thường do dòng của chủ đầu tư trên mẫu chỉ lọc một số mã KBNN, trong khi có dự án giao dịch ở KBNN khác.' : 'Thường do tên chủ đầu tư trong sheet CDT khác tên trên mẫu báo cáo.'}</li>`);
    }
    const ct = dong.filter(d => lech(d.f5));
    if (ct.length) ly.push(`<li><b>Cộng thêm thủ công</b> (tab Cộng thêm): ${ct.map(d => `${ten(d)}: <b>${d0(d.f5)}</b> đ`).join('; ')}.</li>`);
    const con = dong.filter(d => lech(d.du));
    if (con.length) ly.push(`<li style="color:var(--red)"><b>Còn chênh chưa giải thích:</b> ${con.map(d => `${ten(d)}: ${d0(d.du)} đ`).join('; ')}.</li>`);
    const khop = coTong && dong.every(d => !lech(d.f6 - d.f1));
    box.innerHTML = `
      <div class="${khop ? 'okbox' : 'warnbox'}">${khop ? '✓ Số trên báo cáo khớp hoàn toàn với dòng tổng của file hệ thống.'
        : 'Số trên báo cáo = Cộng chi tiết dự án − Không vào báo cáo + Cộng thêm. Chênh lệch so với file hệ thống được giải thích bên dưới.'}</div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Chỉ tiêu (cột báo cáo ← cột nguồn)</th>
        <th>(1) Dòng TỔNG file hệ thống</th><th>(2) Cộng dòng tổng các KBNN</th><th>(3) Cộng chi tiết dự án</th>
        <th>(4) Không vào báo cáo</th><th>(5) Cộng thêm</th><th>(6) Trên báo cáo</th><th>(6) − (1)</th><th>Cân đối<br>(6)=(3)−(4)+(5)</th></tr></thead>
      <tbody>${dong.map(d => `<tr><td>${ten(d)} <span class="muted small">← ${d.src}</span></td>
        <td class="num">${d0(d.f1)}</td><td class="num ${coTong && lech(d.f2 - d.f1) ? 'adj' : ''}">${d0(d.f2)}</td>
        <td class="num ${coTong && lech(d.f3 - d.f2) ? 'adj' : ''}">${d0(d.f3)}</td><td class="num ${lech(d.f4) ? 'adj' : ''}">${d0(d.f4)}</td>
        <td class="num ${lech(d.f5) ? 'adj' : ''}">${d0(d.f5)}</td><td class="num"><b>${d0(d.f6)}</b></td>
        <td class="num">${coTong ? d0(d.f6 - d.f1) : ''}</td><td class="c">${lech(d.du) ? '<span style="color:var(--red)">✗ ' + d0(d.du) + '</span>' : '<span style="color:var(--ok)">✓</span>'}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="small muted">Đơn vị: đồng. Ô tô cam là chỗ phát sinh chênh lệch.</p>
      ${ly.length ? `<h3>Lý do chênh lệch</h3><ul>${ly.join('')}</ul>` : ''}`;
  } catch (e) { fail(e); box.innerHTML = `<p>${esc(viErr(e))}</p>`; }
}

function renderKiemTra(box) {
  if (!S.cdt?.length) { box.innerHTML = '<p class="muted">Chưa có sheet CDT.</p>'; return; }
  let h = '';
  for (const l of LOAI_NGUON) {
    const g = S.gan[l];
    if (!g?.rows.length) { h += `<div class="warnbox">${esc(NGUON_TEN[l])}: chưa có dữ liệu.</div>`; continue; }
    if (g.thieu.length) {
      h += `<div class="warnbox"><b>${esc(NGUON_TEN[l])}: ${g.thieu.length} mã dự án chưa có trong sheet CDT</b> (Excel hiện ".chưa cập nhật mã DA") – số liệu các dự án này không vào báo cáo.
        <details><summary>Xem danh sách</summary><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Mã DA</th><th>Tên dự án</th></tr></thead><tbody>
        ${g.thieu.map(t => `<tr><td>${esc(t.ma_da)}</td><td>${esc(t.ten)}</td>${canEditDM() ? `<td><button class="btn small" data-them="${esc(t.ma_da)}" data-ten="${esc(t.ten)}">+ Thêm vào danh mục</button></td>` : ''}</tr>`).join('')}</tbody></table></div></details></div>`;
    } else h += `<div class="okbox">${esc(NGUON_TEN[l])}: tất cả ${fmtDong(g.rows.length)} dòng dự án đều có trong sheet CDT.</div>`;
  }
  for (const id of Object.keys(E.BAO_CAO)) {
    const rows = nguonCua(id); if (!rows.length) continue;
    const sot = E.kiemTra(id, S.mau[id], rows);
    h += sot.length
      ? `<div class="warnbox"><b>${esc(E.BAO_CAO[id].ten)}: ${sot.length} chủ đầu tư không khớp dòng nào trên báo cáo</b> (tên trong sheet CDT khác tên trên mẫu báo cáo${laThang(id) ? ' hoặc khác mã KBNN' : ''}) – số liệu bị sót:
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Chủ đầu tư (theo sheet CDT)</th><th>Số dòng</th><th>Tổng số tiền các cột dùng (đồng)</th></tr></thead><tbody>
        ${sot.map(s => `<tr><td>${esc(s.ten)}</td><td class="num">${s.so_da}</td><td class="num">${fmtDong(s.tong)}</td></tr>`).join('')}</tbody></table></div></div>`
      : `<div class="okbox">${esc(E.BAO_CAO[id].ten)}: toàn bộ số liệu đều vào đúng dòng chủ đầu tư.</div>`;
  }
  box.innerHTML = h;
  box.onclick = e => {
    const b = e.target.closest('[data-them]'); if (!b) return;
    suaDuAn(null, { ma_da: b.dataset.them, ten_da: b.dataset.ten.replace(new RegExp('^' + b.dataset.them + '\\s*-\\s*'), '') });
  };
}

async function docFile(file, box) {
  box.innerHTML = '<p class="muted">Đang đọc file…</p>';
  try {
    const XLSX = await loadXLSX();
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
    const names = wb.SheetNames;
    const doan = {};
    for (const [l, re] of Object.entries(DOAN_SHEET)) doan[l] = names.find(n => re.test(n) && !/tuan|tuần|thang|tháng/i.test(n)) || '';
    // File xuất từ hệ thống (1 sheet "BaoCao"…): đoán theo tên file
    for (const l of ['TT37', 'TT15', 'TT85']) if (!doan[l] && DOAN_SHEET[l].test(file.name) && !Object.values(doan).includes(names[0])) doan[l] = names[0];
    const opts = sel => `<option value="">— Không cập nhật —</option>` + names.map(n => `<option ${n === sel ? 'selected' : ''}>${esc(n)}</option>`).join('');
    box.innerHTML = `<div class="card form" style="margin-top:12px"><h3>File: ${esc(file.name)}</h3>
      <p class="muted small">Chọn sheet tương ứng cho từng loại dữ liệu:</p>
      ${['CDT', ...LOAI_NGUON].map(l => `<div class="map-row"><b>${l === 'CDT' ? 'CDT' : 'BC ' + l.replace('TT', 'TT ')}</b>
        <select data-l="${l}">${opts(doan[l])}</select><span class="small muted" data-info="${l}"></span></div>`).join('')}
      <div class="actions"><button class="btn primary" id="go">⬆ Cập nhật lên máy chủ</button><button class="btn ghost" id="huy">Hủy</button></div></div>`;
    const parsed = {};
    const doc = l => {
      const sel = box.querySelector(`[data-l="${l}"]`).value, info = box.querySelector(`[data-info="${l}"]`);
      if (!sel) { parsed[l] = null; info.textContent = ''; return; }
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sel], { header: 1, defval: null, raw: true, blankrows: true });
      if (l === 'CDT') {
        const ch = E.chuanHoaCDT(E.docCDT(rows), S.mau);
        parsed[l] = { rows: ch.rows };
        info.textContent = `${fmtDong(ch.rows.length)} dự án${ch.doi ? ` · tự chuẩn hóa ${ch.doi} tên chủ đầu tư` : ''}`;
      }
      else {
        const ky = E.docKyIn(rows);
        parsed[l] = { rows: E.docNguon(rows, l), ky: ky?.text || '', tong: E.docTong(rows, l) };
        info.textContent = `${fmtDong(parsed[l].rows.length)} dòng có mã DA${ky ? ' · ' + ky.tu + '–' + ky.den : ''}`;
      }
    };
    ['CDT', ...LOAI_NGUON].forEach(l => { doc(l); box.querySelector(`[data-l="${l}"]`).addEventListener('change', () => doc(l)); });
    box.querySelector('#huy').onclick = () => { box.innerHTML = ''; };
    box.querySelector('#go').onclick = async e => {
      const btn = e.target; btn.disabled = true;
      try {
        const ds = Object.entries(parsed).filter(([, p]) => p && p.rows.length);
        if (!ds.length) throw new Error('Chưa chọn sheet nào có dữ liệu.');
        for (const [l, p] of ds) {
          btn.textContent = `Đang cập nhật ${l}…`;
          const rows = l === 'CDT' ? p.rows : p.rows.map(r => ({ ...r, ten: r.ten.slice(0, 300) }));
          const n = await q(sb.rpc('th_thay_nguon', { p_loai: l, p_rows: rows, p_ten_file: file.name, p_ky_in: p.ky || null, p_tong: p.tong || null }));
          toast(`Đã cập nhật ${l}: ${fmtDong(n)} dòng.`, 'ok');
          if (l !== 'CDT') S.dongKy = {};   // gợi ý lại dòng thời gian theo file mới
        }
        box.innerHTML = '';
        await taiDuLieu(); show();
      } catch (err) { fail(err); btn.disabled = false; btn.textContent = '⬆ Cập nhật lên máy chủ'; }
    };
  } catch (e) { fail(e); box.innerHTML = ''; }
}

// ================================================================ TAB: DANH MỤC DỰ ÁN (sheet CDT)
// Cột phân loại đang hiện (Loại CT tạm ẩn – dữ liệu vẫn giữ, vẫn xuất Excel)
const DM_COT = { dac_thu: 'Đặc thù (Chuyển đổi số…)', ctmt: 'CTMTQG giai đoạn 2021-2025', ctmt_2630: 'CTMTQG giai đoạn 2026-2030' };
const DM = { tim: '', cdt: '', kbnn: '', dac_thu: '', ctmt: '', ctmt_2630: '', trang: 0 };
const giaTri = f => [...new Set((S.cdt || []).map(r => r[f]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
const tenCDTMau = () => [...new Set(Object.values(S.mau).flatMap(m => m.rows.filter(r => r.loai === 'ct').map(r => r.ten)))].sort((a, b) => a.localeCompare(b, 'vi'));
function locDM() {
  const t = norm(DM.tim);
  return (S.cdt || []).filter(r =>
    (!t || norm(r.ma_da).includes(t) || norm(r.ten_da).includes(t)) &&
    (!DM.cdt || r.cdt === DM.cdt || r.cdt2 === DM.cdt) && (!DM.kbnn || r.kbnn === DM.kbnn) &&
    Object.keys(DM_COT).every(f => !DM[f] || (DM[f] === '__trong' ? !r[f] : DM[f] === '__co' ? !!r[f] : r[f] === DM[f])));
}
function viewDanhMuc(v) {
  if (!S.cdt?.length) { v.innerHTML = '<div class="card"><p class="muted">Chưa có sheet CDT. Vào tab Dữ liệu đầu vào để tải lên.</p></div>'; return; }
  const all = S.cdt, ds = locDM(), per = 100, soTrang = Math.max(1, Math.ceil(ds.length / per));
  if (DM.trang >= soTrang) DM.trang = soTrang - 1;
  const dem = (f, val) => all.filter(r => val ? r[f] === val : !!r[f]).length;
  const optLoc = f => `<option value="">Tất cả</option><option value="__co" ${DM[f] === '__co' ? 'selected' : ''}>(có phân loại)</option><option value="__trong" ${DM[f] === '__trong' ? 'selected' : ''}>(chưa phân loại)</option>`
    + giaTri(f).map(x => `<option ${x === DM[f] ? 'selected' : ''}>${esc(x)}</option>`).join('');
  const kpi = [['Tổng số dự án', all.length], ['Chuyển đổi số', dem('dac_thu', 'Chuyển đổi số')], ['Có đặc thù', dem('dac_thu')],
    ['CTMTQG 2021-2025', dem('ctmt')], ['CTMTQG 2026-2030', dem('ctmt_2630')], ['Bổ sung trên web', all.filter(r => r.sua_tay || r.them_tay).length]];
  const trang = ds.slice(DM.trang * per, DM.trang * per + per);
  const dl = f => `<datalist id="dl-${f}">${giaTri(f).map(x => `<option value="${esc(x)}">`).join('')}</datalist>`;
  v.innerHTML = `<div class="card">
    <h2>Danh mục dự án (sheet CDT)</h2>
    <div class="kpi">${kpi.map(([t, n]) => `<div><span>${t}</span><b>${fmtDong(n)}</b></div>`).join('')}</div>
    <div class="bar">
      <label style="min-width:260px">Tìm mã / tên dự án<input id="tim" value="${esc(DM.tim)}" placeholder="vd: 8077917 hoặc trường THPT"></label>
      <label>Chủ đầu tư<select id="lcdt"><option value="">Tất cả</option>${[...new Set([...giaTri('cdt'), ...giaTri('cdt2')])].sort((a, b) => a.localeCompare(b, 'vi')).map(x => `<option ${x === DM.cdt ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
      <label style="min-width:120px">KBNN<select id="lkbnn"><option value="">Tất cả</option>${giaTri('kbnn').map(x => `<option ${x === DM.kbnn ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
      ${Object.entries(DM_COT).map(([f, t]) => `<label style="min-width:150px">${t}<select data-loc="${f}">${optLoc(f)}</select></label>`).join('')}
    </div>
    <div class="actions" style="margin-top:0;margin-bottom:12px">
      ${canEditDM() ? `<button class="btn primary" id="them">+ Thêm dự án</button>
        <button class="btn ${S.canHT?.length ? 'canh' : ''}" id="hoanthien">⚠ Hoàn thiện dự án đã phát sinh giải ngân <span class="badge">${S.canHT ? S.canHT.length : '…'}</span></button>
        <button class="btn" id="hangloat">Gán phân loại hàng loạt…</button>` : ''}
      <button class="btn" id="xuat">⬇ Xuất Excel (${fmtDong(ds.length)} dự án)</button>
      <span class="muted small">Đang lọc ${fmtDong(ds.length)} / ${fmtDong(all.length)} dự án.${canEditDM() ? ' Gõ trực tiếp vào 3 cột phân loại, tự lưu khi rời ô.' : ''}</span>
    </div>
    <div id="htbox"></div>
    ${Object.keys(DM_COT).map(dl).join('')}
    <div class="tbl-wrap tall"><table class="tbl dm"><thead><tr><th>Mã DA</th><th>Tên dự án</th><th>Chủ đầu tư</th><th>Chủ đầu tư 2 (BC tuần)</th><th>KBNN</th>
      ${Object.values(DM_COT).map(t => `<th>${t}</th>`).join('')}${canEditDM() ? '<th></th>' : ''}</tr></thead>
    <tbody>${trang.map(r => `<tr data-ma="${esc(r.ma_da)}"><td>${esc(r.ma_da)}${r.them_tay ? ' <span class="badge" title="Thêm trên web">mới</span>' : ''}</td>
      <td class="ten" title="${esc(r.ten_da)}">${esc(r.ten_da)}</td><td>${esc(r.cdt)}</td><td>${esc(r.cdt2)}</td><td class="c">${esc(r.kbnn)}</td>
      ${Object.keys(DM_COT).map(f => canEditDM() ? `<td><input data-f="${f}" list="dl-${f}" value="${esc(r[f] || '')}" class="${r.sua_tay ? 'sua' : ''}"></td>` : `<td>${esc(r[f] || '')}</td>`).join('')}
      ${canEditDM() ? `<td class="c"><button class="btn small" data-act="sua">Sửa</button></td>` : ''}</tr>`).join('') || '<tr><td colspan="9" class="empty">Không có dự án phù hợp.</td></tr>'}</tbody></table></div>
    <div class="actions">${soTrang > 1 ? `<button class="btn small" id="truocT" ${DM.trang ? '' : 'disabled'}>‹ Trước</button>
      <span>Trang ${DM.trang + 1}/${soTrang}</span><button class="btn small" id="sauT" ${DM.trang < soTrang - 1 ? '' : 'disabled'}>Sau ›</button>` : ''}</div>
    <p class="small muted">Khi tải lại sheet CDT: thông tin phân loại đã sửa trên web và dự án thêm trên web được giữ nguyên; tên, chủ đầu tư, KBNN lấy theo file.</p></div>`;
  const ve = () => viewDanhMuc(v);
  let hen;
  v.querySelector('#tim').addEventListener('input', e => { DM.tim = e.target.value; DM.trang = 0; clearTimeout(hen); hen = setTimeout(() => { ve(); const i = v.querySelector('#tim'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300); });
  v.querySelector('#lcdt').onchange = e => { DM.cdt = e.target.value; DM.trang = 0; ve(); };
  v.querySelector('#lkbnn').onchange = e => { DM.kbnn = e.target.value; DM.trang = 0; ve(); };
  v.querySelectorAll('[data-loc]').forEach(s => s.onchange = e => { DM[s.dataset.loc] = e.target.value; DM.trang = 0; ve(); });
  v.querySelector('#truocT')?.addEventListener('click', () => { DM.trang--; ve(); });
  v.querySelector('#sauT')?.addEventListener('click', () => { DM.trang++; ve(); });
  v.querySelector('#them')?.addEventListener('click', () => suaDuAn(null));
  v.querySelector('#hoanthien')?.addEventListener('click', () => { DM.moHT = !DM.moHT; veHoanThien(v); });
  if (canEditDM()) { if (!S.canHT) taiCanHT().then(() => viewDanhMuc(v)).catch(fail); else veHoanThien(v); }
  v.querySelector('#hangloat')?.addEventListener('click', ganHangLoat);
  v.querySelector('#xuat').onclick = () => xuatDanhMuc(ds).catch(fail);
  v.querySelector('tbody').addEventListener('change', async e => {
    const inp = e.target.closest('input[data-f]'); if (!inp) return;
    const ma = inp.closest('tr').dataset.ma, f = inp.dataset.f, val = inp.value.trim() || null;
    const r = S.cdt.find(x => x.ma_da === ma); if ((r[f] || null) === val) return;
    try {
      const rec = { [f]: val, sua_tay: true, cap_nhat_luc: new Date().toISOString(), cap_nhat_boi: S.me.ho_ten };
      await q(sb.from('th_cdt').update(rec).eq('ma_da', ma));
      Object.assign(r, rec); inp.classList.add('sua'); toast(`Đã lưu ${DM_COT[f]} – ${ma}`, 'ok');
    } catch (err) { fail(err); inp.value = r[f] || ''; }
  });
  v.querySelector('tbody').addEventListener('click', e => {
    if (e.target.dataset.act !== 'sua') return;
    suaDuAn(S.cdt.find(x => x.ma_da === e.target.closest('tr').dataset.ma));
  });
}

// ---- Dự án đã phát sinh số liệu nhưng chưa vào được báo cáo (lấy từ máy chủ, Phòng giao dịch cũng xem được)
async function taiCanHT() {
  S.canHT = await q(sb.rpc('th_du_an_can_hoan_thien', { p_ten_mau: tenCDTMau() }));
}
function veHoanThien(v) {
  const box = v.querySelector('#htbox'); if (!box) return;
  if (!DM.moHT || !S.canHT) { box.innerHTML = ''; return; }
  const ds = S.canHT.filter(x => !DM.kbnn || x.kbnn === DM.kbnn);
  const tr = n => (n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
  box.innerHTML = `<div class="warnbox" style="margin-bottom:14px">
    <b>Dự án đã có số liệu trong BC TT 85 / TT 15 nhưng chưa vào được báo cáo: ${ds.length}${DM.kbnn ? ` (lọc theo ${esc(DM.kbnn)})` : ''}</b>
    <div class="small">Phòng giao dịch bấm <b>Hoàn thiện</b>, chọn đúng <b>chủ đầu tư</b> (theo tên trên báo cáo) rồi Lưu. Dự án sẽ tự vào báo cáo ở lần lập tiếp theo.</div>
    ${ds.length ? `<div class="tbl-wrap" style="margin-top:8px"><table class="tbl dm"><thead><tr><th>Mã DA</th><th>Tên dự án</th><th>KBNN</th><th>Vấn đề</th>
      <th>KHV (triệu)</th><th>Giải ngân (triệu)</th><th>Có trong</th><th></th></tr></thead><tbody>
      ${ds.map(x => `<tr><td>${esc(x.ma_da)}</td><td class="ten" title="${esc(x.ten)}">${esc(x.ten)}</td><td>${esc(x.kbnn || x.kb || '')}</td>
        <td class="small">${x.loi === 'CHUA_CO' ? '<span class="chip am">Chưa có trong danh mục</span>'
          : `<span class="chip am">Chủ đầu tư chưa đúng tên trên báo cáo</span><br>${esc(x.cdt2 || x.cdt || '(trống)')}`}</td>
        <td class="num">${tr(x.khv)}</td><td class="num">${tr(x.gn)}</td><td class="c small">${[x.co85 && 'TT85', x.co15 && 'TT15', x.co37 && 'TT37'].filter(Boolean).join(', ')}</td>
        <td class="c"><button class="btn small primary" data-ht="${esc(x.ma_da)}">Hoàn thiện</button></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="okbox" style="margin:8px 0 0">✓ Tất cả dự án đã phát sinh số liệu đều đã đủ thông tin.</div>'}</div>`;
  box.onclick = e => {
    const b = e.target.closest('[data-ht]'); if (!b) return;
    const x = S.canHT.find(y => y.ma_da === b.dataset.ht);
    const r = S.cdt.find(y => y.ma_da === x.ma_da);
    suaDuAn(r || null, r ? {} : { ma_da: x.ma_da, ten_da: x.ten, kbnn: x.kbnn });
  };
}

async function suaDuAn(r, macDinh = {}) {
  const moi = !r; const d = r || macDinh;
  const ds = (id, arr) => `<datalist id="${id}">${arr.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`;
  const ok = await modal(moi ? 'Thêm dự án vào danh mục' : `Sửa dự án ${esc(d.ma_da)}`, `
    <div class="grid2" style="min-width:min(760px,85vw)">
      <label>Mã dự án<input name="ma_da" required value="${esc(d.ma_da || '')}" ${moi ? '' : 'readonly'}></label>
      <label>KBNN giao dịch<input name="kbnn" value="${esc(d.kbnn || '')}" list="m-kbnn" placeholder="vd: P 17">${ds('m-kbnn', giaTri('kbnn'))}</label>
    </div>
    <label>Tên dự án<input name="ten_da" value="${esc(d.ten_da || '')}"></label>
    <div class="grid2">
      <label>Chủ đầu tư (dùng cho BC tháng)<input name="cdt" required value="${esc(d.cdt || '')}" list="m-cdt">${ds('m-cdt', [...new Set([...giaTri('cdt'), ...tenCDTMau()])].sort())}</label>
      <label>Chủ đầu tư 2 (dùng cho BC tuần)<input name="cdt2" required value="${esc(d.cdt2 || '')}" list="m-cdt2">${ds('m-cdt2', [...new Set([...giaTri('cdt2'), ...tenCDTMau()])].sort())}</label>
    </div>
    <div class="grid3">${Object.entries(DM_COT).map(([f, t]) => `<label>${t}<input name="${f}" value="${esc(d[f] || '')}" list="m-${f}">${ds('m-' + f, giaTri(f))}</label>`).join('')}</div>
    <p class="small muted">Tên chủ đầu tư phải trùng tên dòng trên mẫu báo cáo thì số liệu mới vào báo cáo (chọn trong danh sách gợi ý).
    ${moi ? '' : 'Tên, chủ đầu tư, KBNN sẽ lấy lại theo sheet CDT khi tải lại file; phân loại được giữ.'}</p>`,
  async fd => {
    const g = k => (fd.get(k) || '').trim() || null;
    // Tên chủ đầu tư phải có trên mẫu báo cáo (không phân biệt hoa/thường) thì số liệu mới vào báo cáo
    const mau = new Map(tenCDTMau().map(t => [norm(t), t]));
    for (const k of ['cdt', 'cdt2']) {
      const val = g(k); if (!val || (!moi && val === d[k])) continue;
      if (!mau.has(norm(val))) throw new Error(`"${val}" chưa có trên mẫu báo cáo. Hãy chọn tên chủ đầu tư trong danh sách gợi ý.`);
      fd.set(k, mau.get(norm(val)));
    }
    const rec = { ten_da: g('ten_da'), cdt: g('cdt'), cdt2: g('cdt2'), kbnn: g('kbnn'), ...Object.fromEntries(Object.keys(DM_COT).map(f => [f, g(f)])),
      sua_tay: true, cap_nhat_luc: new Date().toISOString(), cap_nhat_boi: S.me.ho_ten };
    if (moi) {
      const ma = g('ma_da'); if (!ma) throw new Error('Chưa nhập mã dự án.');
      if (S.cdt.some(x => x.ma_da === ma)) throw new Error(`Mã ${ma} đã có trong danh mục.`);
      const row = { ma_da: ma, ...rec, them_tay: true, thu_tu: 999999 };
      await q(sb.from('th_cdt').insert(row)); S.cdt.push(row);
    } else {
      await q(sb.from('th_cdt').update(rec).eq('ma_da', d.ma_da)); Object.assign(r, rec);
    }
  }, 'Lưu');
  if (ok) { tinhGan(); toast('Đã lưu dự án.', 'ok'); S.canHT = null; show(); }
}

async function ganHangLoat() {
  const ok = await modal('Gán phân loại hàng loạt', `
    <label>Dán danh sách mã dự án (mỗi dòng một mã, hoặc cách nhau bởi dấu phẩy / khoảng trắng – có thể copy cả cột trong Excel)
      <textarea name="ds" rows="8" required style="min-width:min(560px,80vw)"></textarea></label>
    <div class="grid2"><label>Gán vào cột<select name="f">${Object.entries(DM_COT).map(([f, t]) => `<option value="${f}">${t}</option>`).join('')}</select></label>
    <label>Giá trị (để trống = xóa phân loại)<input name="val" list="hl-val"><datalist id="hl-val">${[...new Set(Object.keys(DM_COT).flatMap(giaTri))].map(x => `<option value="${esc(x)}">`).join('')}</datalist></label></div>`,
  async fd => {
    const mas = [...new Set(String(fd.get('ds')).split(/[\s,;]+/).map(x => x.trim()).filter(Boolean))];
    const f = fd.get('f'), val = (fd.get('val') || '').trim() || null;
    const co = new Set(S.cdt.map(r => r.ma_da)), dung = mas.filter(m => co.has(m)), sai = mas.filter(m => !co.has(m));
    if (!dung.length) throw new Error('Không có mã nào trong danh mục.');
    const rec = { [f]: val, sua_tay: true, cap_nhat_luc: new Date().toISOString(), cap_nhat_boi: S.me.ho_ten };
    for (let i = 0; i < dung.length; i += 200) await q(sb.from('th_cdt').update(rec).in('ma_da', dung.slice(i, i + 200)));
    S.cdt.forEach(r => { if (dung.includes(r.ma_da)) Object.assign(r, rec); });
    toast(`Đã gán ${DM_COT[f]} = "${val ?? '(trống)'}" cho ${dung.length} dự án.${sai.length ? ` ${sai.length} mã không có trong danh mục: ${sai.slice(0, 10).join(', ')}${sai.length > 10 ? '…' : ''}` : ''}`, sai.length ? 'err' : 'ok');
  }, 'Gán');
  if (ok) show();
}

// Xuất đúng bố cục sheet CDT (A Mã … I CTMTQG) để có thể nạp lại
async function xuatDanhMuc(ds) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('CDT', { views: [{ state: 'frozen', ySplit: 1 }] });
  const hd = ['Mã Dự án', 'Tên Dự án', 'Đơn vị/ Chủ đầu tư', 'Đơn vị/ Chủ đầu tư2', 'KBNN giao dịch', 'Ghi chú', 'Đặc thù', 'Loại CT', 'CTMTQG giai đoạn 2021-2025', 'CTMTQG giai đoạn 2026-2030', 'Cập nhật trên web'];
  ws.addRow(hd);
  for (const r of ds) ws.addRow([r.ma_da, r.ten_da, r.cdt, r.cdt2, r.kbnn, r.them_tay ? 'Thêm trên web' : '', r.dac_thu, r.loai_ct, r.ctmt, r.ctmt_2630,
    r.sua_tay ? `${r.cap_nhat_boi || ''} ${r.cap_nhat_luc ? ngay(r.cap_nhat_luc) : ''}`.trim() : '']);
  [12, 60, 34, 34, 20, 14, 16, 18, 16, 16, 24].forEach((w, i) => ws.getColumn(i + 1).width = w);
  ws.getRow(1).font = { bold: true }; ws.getRow(1).alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
  ws.autoFilter = { from: 'A1', to: 'K1' };
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = `Danh muc du an CDT ${ddmmyyyy(new Date()).replace(/\//g, '.')}.xlsx`; a.click();
}

// ================================================================ TAB 2: LẬP BÁO CÁO
function kyTruocMacDinh(id) { return S.ky.find(k => k.bao_cao === id && k.chot)?.id ?? ''; }
function dongKyMacDinh(id) {
  const f = S.file[E.BAO_CAO[id].nguon];
  const den = parseDMY(/đến ngày\s*([\d/]+)/i.exec(f?.ky_in || '')?.[1]);
  if (!den) return S.mau[id].head.find(h => h[0] === BO_CUC[id].dongKy)?.[1] || '';
  if (E.BAO_CAO[id].loai === 'TUAN') { const tu = new Date(den); tu.setDate(tu.getDate() - 6); return `Từ ngày ${ddmmyyyy(tu)} Đến ngày ${ddmmyyyy(den)}`; }
  return `Đến ngày ${ddmmyyyy(den)}`;
}
const dongVBMacDinh = id => S.mau[id].head.find(h => h[0] === BO_CUC[id].dongVB)?.[1] || '';

async function viewBaoCao(v) {
  const id = S.bc, tuan = E.BAO_CAO[id].loai === 'TUAN';
  if (!(id in S.truoc)) S.truoc[id] = kyTruocMacDinh(id);
  if (!S.dongKy[id]) S.dongKy[id] = dongKyMacDinh(id);
  if (S.dongVB[id] === undefined) S.dongVB[id] = dongVBMacDinh(id);
  const kyOpts = S.ky.filter(k => k.bao_cao === id && k.chot);
  S.locKB ||= {};
  const kbs = dsKB(id);
  if (kbLoc(id) && !kbs.some(x => x.k === kbLoc(id))) S.locKB[id] = '';
  v.innerHTML = `
    <div class="card no-print">
      <div class="bar">
        <label>Báo cáo<select id="bc">${Object.entries(E.BAO_CAO).map(([k, b]) => `<option value="${k}" ${k === id ? 'selected' : ''}>${esc(b.ten)}</option>`).join('')}</select></label>
        <label>Lọc theo mã KBNN<select id="locKB"><option value="">Tất cả (toàn khu vực)</option>
          ${kbs.map(x => `<option value="${esc(x.k)}" ${x.k === kbLoc(id) ? 'selected' : ''}>${esc(x.k)} – ${esc(x.ten)}</option>`).join('')}</select></label>
        ${tuan && !kbLoc(id) ? `<label>Lũy kế đến tuần trước lấy từ<select id="truoc"><option value="">— Để trống —</option>
          ${kyOpts.map(k => `<option value="${k.id}" ${String(k.id) === String(S.truoc[id]) ? 'selected' : ''}>${esc(k.ten)} · ${esc(ngay(k.tao_luc))}</option>`).join('')}</select></label>
          ${canEdit() ? '<button class="btn small" id="nhapTruoc">Nhập lũy kế tuần trước từ file Excel…</button>' : ''}` : ''}
      </div>
      <div class="grid2">
        <label>Dòng thời gian báo cáo<input id="dk" value="${esc(S.dongKy[id])}"></label>
        <label>Dòng "Kèm theo văn bản số…"<input id="vb" value="${esc(S.dongVB[id])}"></label>
      </div>
      <div class="actions">
        ${coXuat() ? `<button class="btn primary" id="xuat">⬇ Xuất Excel</button>
        <button class="btn" onclick="window.print()">🖨 In</button>` : ''}
        ${canEdit() && !kbLoc(id) ? '<button class="btn ok" id="luu">💾 Lưu kỳ báo cáo…</button>' : ''}
        <button class="btn" id="ss">🔍 So sánh TT15 / TT85 / TT37</button>
        <span class="muted small">Đơn vị: triệu đồng. Ô tô màu cam có khoản "cộng thêm".</span>
      </div>
    </div>
    <div id="rp"><div class="loading">Đang tính…</div></div>`;
  v.querySelector('#bc').onchange = e => { S.bc = e.target.value; show(); };
  v.querySelector('#locKB').onchange = e => { S.locKB[id] = e.target.value; show(); };
  v.querySelector('#truoc')?.addEventListener('change', e => { S.truoc[id] = e.target.value; show(); });
  v.querySelector('#nhapTruoc')?.addEventListener('click', () => nhapTruocTuExcel(id));
  v.querySelector('#ss').onclick = () => viewSoSanh(v.querySelector('#rp'));
  v.querySelector('#dk').oninput = e => { S.dongKy[id] = e.target.value; const t = v.querySelector('.rpt-title .ky'); if (t) t.textContent = kyBC(id); };
  v.querySelector('#vb').oninput = e => { S.dongVB[id] = e.target.value; };
  try {
    const kq = await tinh(id, { loc: true });
    S.kq = { id, kq };
    const an = dongRong(id, kq);
    v.querySelector('#rp').innerHTML = renderBang(id, kq, { dc: dcLoc(id), coGhiChu: !kbLoc(id), an });
    ganGhiChu(v.querySelector('#rp'), S.mau[id]);
    const ghi = [];
    if (kbLoc(id)) ghi.push(`<div class="okbox">🔎 Đang lọc theo <b>${esc(nhanKB(id))}</b>: chỉ tính dự án giao dịch tại KBNN này${an.size ? `, ẩn ${an.size} dòng không có số liệu` : ''}. Khi lọc: ${tuan ? 'không áp dụng khoản "cộng thêm" (BC tuần không tách được theo KBNN); cột "Lũy kế đến tuần trước" và "Giá trị tăng thêm trong tuần" để trống (kỳ đã lưu là số toàn khu vực)' : `chỉ áp dụng khoản "cộng thêm" ghi ở dòng của KBNN ${esc(kbLoc(id))} (${dcLoc(id).length}/${dcCua(id).length} khoản)`}; không lưu kỳ.</div>`);
    if (tuan && !S.truoc[id] && !kbLoc(id)) ghi.push('<div class="warnbox">Chưa chọn <b>lũy kế đến tuần trước</b> nên cột "Lũy kế đến tuần trước liền kề" đang bằng 0 và "Giá trị tăng thêm trong tuần" đang bằng toàn bộ lũy kế. Hãy chọn kỳ đã chốt hoặc bấm <b>Nhập lũy kế tuần trước từ file Excel…</b></div>');
    try {
      const { f, dong } = await tinhDoiChieu(id);
      const conLech = dong.some(d => Math.abs(d.du) >= 1), khop = f?.tong && dong.every(d => Math.abs(d.f6 - d.f1) < 1);
      ghi.push(conLech ? '<div class="warnbox" style="border-color:var(--red)">✗ Đối chiếu còn chênh lệch chưa giải thích – xem <a href="#doichieu">Đối chiếu tổng số</a> ở cuối trang.</div>'
        : khop ? '<div class="okbox">✓ Đã đối chiếu: số báo cáo khớp dòng tổng của file hệ thống.</div>'
        : '<div class="okbox">✓ Đã đối chiếu: số báo cáo cân đối với chi tiết dự án. Có khoản chênh so với dòng tổng file hệ thống (đã giải thích) – xem <a href="#doichieu">Đối chiếu tổng số</a> ở cuối trang.</div>');
    } catch { }
    v.querySelector('#rp').insertAdjacentHTML('afterbegin', `<div class="no-print">${ghi.join('')}</div>`);
    v.querySelector('#rp').insertAdjacentHTML('beforeend', `<div class="card no-print" id="doichieu"><h2>Đối chiếu tổng số: file hệ thống ↔ ${esc(E.BAO_CAO[id].ten)}</h2>
      <div id="dcbox"><div class="muted">Đang đối chiếu…</div></div></div>`);
    renderDoiChieu(v.querySelector('#dcbox'), id);
    v.querySelector('#xuat')?.addEventListener('click', () => xuatExcel(id, kq, kbLoc(id) ? { dongKy: kyBC(id), an, tenFile: `${S.mau[id].sheet} - KBNN ${kbLoc(id)} - ${(S.dongKy[id] || '').replace(/[\\/:*?"<>|]/g, '-')}.xlsx` } : {}).catch(fail));
    v.querySelector('#luu')?.addEventListener('click', () => luuKy(id, kq));
  } catch (e) { fail(e); v.querySelector('#rp').innerHTML = `<div class="card">${esc(viErr(e))}</div>`; }
}
const dcCua = id => S.dc.filter(d => d.bao_cao === id && d.su_dung);
const anhChupCache = {};

// ---- Lọc báo cáo theo mã KBNN (khối KBNN nơi dự án giao dịch trong file hệ thống)
//   Khi lọc: chỉ tính dự án của KBNN đó; không áp dụng "cộng thêm" (không tách được theo KBNN);
//   BC tuần: cột lũy kế đến tuần trước / tăng thêm trong tuần để trống (kỳ đã lưu là số toàn khu vực)
const kbLoc = id => S.locKB?.[id] || '';
const nguonBC = id => { const k = kbLoc(id), r = nguonCua(id); return k ? r.filter(x => x.kb === k) : r; };
const COT_TUAN_TRUOC = ['H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'AC', 'AD', 'AE'];
function dsKB(id) {
  const l = E.BAO_CAO[id].nguon, ten = S.file?.[l]?.tong?.kb || {};
  const ma = [...new Set(nguonCua(id).map(r => r.kb).filter(Boolean))].sort();
  return ma.map(k => ({ k, ten: tenPhongKB(k, ten[k]?.ten) }));
}
function tenPhongKB(k, tenFile) {
  const p = DTE.KB_PHONG[k];
  if (p) return DTE.tenPhong(p);
  return (tenFile || '').replace(/^.*?KBNN\s*/i, '').trim() || 'KBNN ' + k;
}
const nhanKB = id => { const k = kbLoc(id); return k ? `KBNN ${k} – ${tenPhongKB(k, S.file?.[E.BAO_CAO[id].nguon]?.tong?.kb?.[k]?.ten)}` : ''; };
const kyBC = id => (S.dongKy[id] || '') + (kbLoc(id) ? ` (${nhanKB(id)})` : '');
// Khoản cộng thêm áp dụng khi lọc KBNN (chỉ BC tháng – mẫu có cột "Mã KBNN"):
//   - dòng có mã KBNN = KBNN đang lọc → áp dụng;
//   - dòng tổng của chủ đầu tư (không có mã KBNN) → áp dụng nếu dòng KBNN đang lọc của chủ đầu tư đó cũng có khoản cộng thêm cùng cột.
function dcLoc(id) {
  const k = kbLoc(id), ds = dcCua(id);
  if (!k) return ds;
  if (!laThang(id)) return [];
  const rows = S.mau[id].rows, co = new Set(ds.map(d => d.dong + '|' + d.cot));
  return ds.filter(d => {
    const r = rows[d.dong]; if (!r) return false;
    if (r.kbnn) return String(r.kbnn) === k;
    for (let j = d.dong + 1; j < rows.length && rows[j].kbnn && rows[j].ten === r.ten; j++)
      if (String(rows[j].kbnn) === k && co.has(j + '|' + d.cot)) return true;
    return false;
  });
}
// Dòng không có số liệu (khi lọc KBNN): mọi cột số bằng 0
function dongRong(id, kq) {
  const an = new Set(), K = E.KIEU[id], pct = new Set(K.pct);
  if (!kbLoc(id)) return an;
  kq.forEach((o, i) => { if (i && Object.entries(o || {}).every(([c, v]) => pct.has(c) || COT_TUAN_TRUOC.includes(c) || !v || Math.abs(v) < 0.0005)) an.add(i); });
  return an;
}
//   loc = true: áp dụng bộ lọc mã KBNN đang chọn ở tab Báo cáo
async function tinh(id, { boCT = false, loc = false } = {}) {
  const k = loc ? kbLoc(id) : '';
  const tr = S.truoc[id];
  let truoc = null;
  if (E.BAO_CAO[id].loai === 'TUAN' && tr && !k) {
    truoc = anhChupCache[tr] ||= (await q(sb.from('th_ky').select('anh_chup').eq('id', tr).single())).anh_chup;
  }
  const rows = k ? nguonBC(id) : nguonCua(id);
  const kq = E.tinhBaoCao(id, S.mau[id], rows, { dieuChinh: boCT ? [] : (k ? dcLoc(id) : dcCua(id)).map(d => ({ ...d, so_tien: Number(d.so_tien) })), truoc });
  if (k && E.BAO_CAO[id].loai === 'TUAN') for (const o of kq) for (const c of COT_TUAN_TRUOC) if (o) o[c] = null;
  return kq;
}

// Bảng HTML theo đúng tiêu đề cột của mẫu Excel
function renderBang(id, kq, { dc = [], coGhiChu = false, an = new Set() } = {}) {
  const mau = S.mau[id], bc = BO_CUC[id], cols = colLetters(bc.cuoi);
  const cells = new Map(mau.head.map(([a, v]) => [a, v]));
  const merges = mau.merges.map(m => { const [a, b] = m.split(':'); return { a: addr(a), b: addr(b) }; })
    .filter(m => m.a.r >= bc.dauBang);
  const covered = new Set(), span = new Map();
  for (const m of merges) {
    span.set(`${m.a.r}|${m.a.c}`, { rs: m.b.r - m.a.r + 1, cs: m.b.c - m.a.c + 1 });
    for (let r = m.a.r; r <= m.b.r; r++) for (let c = m.a.c; c <= m.b.c; c++) if (r !== m.a.r || c !== m.a.c) covered.add(`${r}|${c}`);
  }
  let head = '';
  for (let r = bc.dauBang; r < mau.first; r++) {
    head += '<tr>';
    cols.forEach((L, c) => {
      if (covered.has(`${r}|${c}`)) return;
      const sp = span.get(`${r}|${c}`);
      head += `<th class="${c === 1 ? 'nm' : ''}" ${sp ? `rowspan="${sp.rs}" colspan="${sp.cs}"` : ''}>${esc(cells.get(L + r) ?? '')}</th>`;
    });
    if (coGhiChu && r === bc.dauBang) head += `<th class="gc-col" rowspan="${mau.first - bc.dauBang}">Ghi chú</th>`;
    head += '</tr>';
  }
  const K = E.KIEU[id], pct = new Set(K.pct), dataCols = cols.slice(laThang(id) ? 3 : 2);
  const adj = new Map(); for (const d of dc) adj.set(d.dong + '|' + d.cot, (adj.get(d.dong + '|' + d.cot) || []).concat(d));
  const body = mau.rows.map((r, i) => {
    if (an.has(i)) return '';
    const o = kq[i] || {};
    const lv = i === 0 ? 'l0' : r.loai === 'nhom' ? (/^[IVX]+$/.test(r.stt) ? 'l1' : 'l2') : '';
    return `<tr class="${lv}"><td class="c">${esc(r.stt)}</td><td class="nm" title="${esc(r.ten)}">${esc(r.ten || (i === 0 ? '' : ''))}</td>
      ${laThang(id) ? `<td class="c">${esc(r.kbnn || '')}</td>` : ''}
      ${dataCols.map(c => {
        const val = o[c]; const a = adj.get(i + '|' + c);
        const t = pct.has(c) ? fmtPct(val) : ((c === 'F' || c === 'G') && !laThang(id) && !val ? '' : fmt(val));
        return `<td class="num ${a ? 'adj' : ''} ${val < -0.5 ? 'neg' : ''}" ${a ? `title="${esc(a.map(x => `Cộng thêm ${x.so_tien} – ${x.ghi_chu || ''}`).join('\n'))}"` : ''}>${t}</td>`;
      }).join('')}${coGhiChu ? `<td class="gc-col">${i === 0 ? '' : oGhiChu(id, i)}</td>` : ''}</tr>`;
  }).join('');
  const tong = kq[0] || {};
  const kpi = laThang(id)
    ? [['Kế hoạch vốn', tong.D], ['Giải ngân', tong.G], ['Tỷ lệ giải ngân', null, tong.P]]
    : [['Kế hoạch vốn', tong.C], ['Lũy kế giải ngân đến hết tuần', tong.Q], ['Tỷ lệ giải ngân', null, tong.Z], ...(tong.AC === null ? [] : [['Tăng thêm trong tuần', tong.AC]])];
  const ttl = mau.head.filter(([a]) => addr(a).r < bc.dauBang && addr(a).c === 0).map(([a, v]) => [a, v]);
  return `<div class="card">
    <div class="kpi">${kpi.map(([t, v, p]) => `<div><span>${t}</span><b>${p !== undefined ? fmtPct(p) : fmt(v)}</b></div>`).join('')}</div>
    <div class="rpt-title">${ttl.map(([a, v]) => a === bc.dongKy ? `<div class="ky">${esc(kyBC(id) || v)}</div>` : `<div class="${a === 'A1' || a === 'A2' ? 't1' : ''}">${esc(v)}</div>`).join('')}</div>
    <div class="tbl-wrap tall"><table class="tbl rpt"><thead>${head}</thead><tbody>${body}</tbody></table></div>
    ${mau.ghi_chu ? `<p class="small muted"><i>${esc(mau.ghi_chu)}</i></p>` : ''}</div>`;
}

async function luuKy(id, kq) {
  const tuan = E.BAO_CAO[id].loai === 'TUAN';
  await modal('Lưu kỳ báo cáo', `
    <label>Tên kỳ<input name="ten" required value="${esc(S.dongKy[id] || '')}"></label>
    ${tuan ? `<label style="flex-direction:row;gap:8px;align-items:center"><input type="checkbox" name="chot" checked style="width:auto">
      Chốt kỳ này (dùng làm "lũy kế đến tuần trước" cho tuần sau)</label>` : ''}
    <p class="small muted">Toàn bộ số liệu báo cáo được lưu lại để xem và xuất Excel về sau.</p>`,
  async fd => {
    const so = kq.map(o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === null ? null : Math.round(v * 1e6) / 1e6])));
    await q(sb.from('th_ky').insert({
      bao_cao: id, ten: fd.get('ten'), dong_tieu_de: S.dongKy[id], so_van_ban: S.dongVB[id],
      ky_truoc_id: S.truoc[id] || null, so_lieu: so, anh_chup: tuan ? E.anhChup(id, kq) : null,
      chot: tuan && fd.get('chot') === 'on', tao_boi: S.me.ho_ten,
    }));
    toast('Đã lưu kỳ báo cáo.', 'ok');
    await taiKy();
  }, 'Lưu');
}
async function taiKy() {
  S.ky = await q(sb.from('th_ky').select('id,bao_cao,ten,dong_tieu_de,so_van_ban,ky_truoc_id,chot,tao_boi,tao_luc').order('tao_luc', { ascending: false }));
}

// Nhập "lũy kế đến tuần trước" từ file Excel báo cáo đã lập
async function nhapTruocTuExcel(id) {
  await modal('Nhập lũy kế tuần trước từ file Excel', `
    <p class="small">Chọn file báo cáo tuần đã lập (đúng mẫu "${esc(S.mau[id].sheet)}").</p>
    <label>File Excel<input type="file" name="f" accept=".xlsx,.xls,.xlsm" required></label>
    <label>Sheet<select name="sh" required><option value="">— chọn file trước —</option></select></label>
    <label>Lấy số ở cột<select name="cot">
      <option value="Q">Q→Y: "Lũy kế đến hết tuần báo cáo" (file của tuần trước)</option>
      <option value="H">H→P: "Lũy kế đến tuần trước liền kề" (file của tuần này)</option></select></label>
    <label>Tên kỳ<input name="ten" required placeholder="vd: Tuần 26/10–01/11/2026"></label>`,
  async (fd, dlg) => {
    const { XLSX, wb } = dlg._xlsx || {};
    if (!wb) throw new Error('Chưa đọc được file.');
    const ws = wb.Sheets[fd.get('sh')];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true, blankrows: true });
    const src = fd.get('cot') === 'Q' ? 'QRSTUVWXY' : 'HIJKLMNOP';
    const mau = S.mau[id], first = mau.first;
    const tim = (ten, tu) => { for (let r = tu; r < rows.length; r++) if (norm(rows[r]?.[1]) === norm(ten)) return r; return -1; };
    let lech = 0, thieu = [], tu = first - 1;
    const anh = mau.rows.map((row, i) => {
      let r = first - 1 + i;
      if (norm(rows[r]?.[1]) !== norm(row.ten)) { lech++; r = tim(row.ten, tu); }
      if (r < 0) { thieu.push(row.ten); return null; }
      tu = r;
      return Object.fromEntries([...'QRSTUVWXY'].map((k, j) => [k, E.soTien(rows[r][E.colIdx(src[j])])]));
    });
    if (thieu.length > 5) throw new Error(`File không khớp mẫu: không tìm thấy ${thieu.length} dòng chủ đầu tư (vd: ${thieu.slice(0, 3).join('; ')}).`);
    const dk = rows[3]?.[0] || '';
    await q(sb.from('th_ky').insert({ bao_cao: id, ten: fd.get('ten'), dong_tieu_de: dk, so_lieu: [], anh_chup: anh, chot: true, tao_boi: S.me.ho_ten + ' (nhập từ Excel)' }));
    toast(`Đã nhập lũy kế tuần trước${thieu.length ? ` (thiếu ${thieu.length} dòng: ${thieu.join('; ')})` : ''}.`, thieu.length ? 'err' : 'ok');
    await taiKy(); S.truoc[id] = kyTruocMacDinh(id);
  }, 'Nhập');
  show();
}
document.addEventListener('change', async e => {
  const inp = e.target;
  if (!(inp instanceof HTMLInputElement) || inp.type !== 'file' || inp.name !== 'f' || !inp.closest('dialog')) return;
  const d = inp.closest('dialog'), sel = d.querySelector('[name=sh]');
  try {
    const XLSX = await loadXLSX();
    const wb = XLSX.read(await inp.files[0].arrayBuffer(), { type: 'array' });
    d._xlsx = { XLSX, wb };
    const goiY = wb.SheetNames.find(n => norm(n) === norm(S.mau[S.bc].sheet)) || wb.SheetNames.find(n => /tuan|tuần/i.test(n) && n.includes(S.bc.replace('TT', ''))) || wb.SheetNames[0];
    sel.innerHTML = wb.SheetNames.map(n => `<option ${n === goiY ? 'selected' : ''}>${esc(n)}</option>`).join('');
    const ten = d.querySelector('[name=ten]');
    const a4 = XLSX.utils.sheet_to_json(wb.Sheets[goiY], { header: 1, defval: null, blankrows: true })[3]?.[0];
    if (ten && !ten.value && a4) ten.value = String(a4);
  } catch (err) { fail(err); }
});

// ---------------------------------------------------------------- Xuất Excel
async function xuatExcel(id, kq, { dongKy, dongVB, tenFile, an = new Set() } = {}) {
  const ExcelJS = await loadExcelJS();
  const mau = S.mau[id], bc = BO_CUC[id], cols = colLetters(bc.cuoi), K = E.KIEU[id], pct = new Set(K.pct);
  const wbk = new ExcelJS.Workbook();
  const ws = wbk.addWorksheet(mau.sheet.slice(0, 31), {
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
    views: [{ state: 'frozen', xSplit: 2, ySplit: mau.first - 1 }],
  });
  cols.forEach((L, i) => { ws.getColumn(i + 1).width = mau.widths[L] || (i === 1 ? 32 : 11); });
  const thin = { style: 'thin', color: { argb: 'FF7F8C99' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const font = (o = {}) => ({ name: 'Times New Roman', size: 11, ...o });
  for (const [a, v] of mau.head) {
    const { r, c } = addr(a); const cell = ws.getCell(a);
    cell.value = a === bc.dongKy ? (dongKy ?? S.dongKy[id] ?? v) : a === bc.dongVB ? (dongVB ?? S.dongVB[id] ?? v) : v;
    if (r < bc.dauBang) {
      cell.font = font({ bold: r <= 3, italic: a === bc.dongVB || a === bc.dongKy, size: r <= 2 ? 13 : 11 });
      cell.alignment = { horizontal: c === 0 || a === bc.dongVB ? 'center' : 'right', vertical: 'middle', wrapText: false };
    }
  }
  for (let r = bc.dauBang; r < mau.first; r++) for (let c = 0; c < cols.length; c++) {
    const cell = ws.getCell(r, c + 1);
    cell.border = border; cell.font = font({ bold: true, size: 10 });
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF6' } };
  }
  for (const m of mau.merges) { try { ws.mergeCells(m); } catch { } }
  ws.getRow(bc.dauBang).height = 30;
  const dataCols = cols.slice(laThang(id) ? 3 : 2);
  mau.rows.forEach((row, i) => {
    const rn = mau.first + i, o = kq[i] || {};
    const bold = row.loai === 'nhom';
    const r = ws.getRow(rn);
    if (an.has(i)) r.hidden = true;     // lọc KBNN: ẩn dòng không có số liệu
    const stt = row.stt !== '' && !Number.isNaN(Number(row.stt)) && !row.stt.includes('.') ? Number(row.stt) : row.stt;
    r.getCell(1).value = stt; r.getCell(2).value = row.ten;
    if (laThang(id) && row.kbnn) r.getCell(3).value = Number(row.kbnn) || row.kbnn;
    dataCols.forEach(L => {
      const cell = r.getCell(E.colIdx(L) + 1);
      let v = o[L];
      if ((L === 'F' || L === 'G') && !laThang(id) && !v) v = null;
      if (v !== null && v !== undefined && Number.isFinite(v)) cell.value = pct.has(L) ? v : Math.round(v * 1e6) / 1e6;
      cell.numFmt = pct.has(L) ? '0.0%' : '#,##0;[Red]-#,##0;"-"';
    });
    for (let c = 1; c <= cols.length; c++) {
      const cell = r.getCell(c);
      cell.border = border; cell.font = font({ bold, size: 10 });
      cell.alignment = { vertical: 'middle', horizontal: c === 2 ? 'left' : c <= 3 && c !== 2 ? 'center' : 'right', wrapText: c === 2 };
      if (i === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CC' } };
      else if (bold && /^[IVX]+$/.test(row.stt)) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FB' } };
    }
  });
  if (mau.ghi_chu) { const c = ws.getCell(mau.first + mau.rows.length, 1); c.value = mau.ghi_chu; c.font = font({ italic: true, size: 10 }); }
  const buf = await wbk.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = tenFile || `${mau.sheet} - ${(dongKy ?? S.dongKy[id] ?? '').replace(/[\\/:*?"<>|]/g, '-')}.xlsx`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ================================================================ SO SÁNH BÁO CÁO TUẦN THEO CẶP NGUỒN (TT15 / TT85 / TT37)
const SS = { cot: 'Q', chiLech: true, sapXep: 'mau', boCT: false, nguong: 0.5, cap: 'TT15|TT85' };
const SS_CAP = { 'TT15|TT85': 'TT15 ↔ TT85', 'TT37|TT85': 'TT37 ↔ TT85', 'TT15|TT37': 'TT15 ↔ TT37' };
const capSS = () => SS.cap.split('|');
const khoaGhiChuSS = () => SS.cap === 'TT15|TT85' ? 'SS' : 'SS_' + SS.cap.replace('|', '_');
async function viewSoSanh(box) {
  box.innerHTML = '<div class="loading">Đang so sánh…</div>';
  try {
    const [A, B] = capSS(), KGC = khoaGhiChuSS();
    const chon = `<label style="min-width:0">So sánh<select id="ssCap">${Object.entries(SS_CAP).map(([k, t]) => `<option value="${k}" ${k === SS.cap ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
    const thieu = [A, B].filter(l => !nguonCua(l).length);
    if (thieu.length) {
      box.innerHTML = `<div class="card"><div class="actions" style="margin-top:0"><button class="btn" id="ssBack">← Quay lại báo cáo</button>${chon}</div>
        <p class="muted">Chưa có dữ liệu ${thieu.map(l => esc(NGUON_TEN[l])).join(', ')} – Phòng Nghiệp vụ 2 nạp ở mục <b>Dữ liệu đầu vào</b>.</p></div>`;
      box.querySelector('#ssBack').onclick = () => show();
      box.querySelector('#ssCap').onchange = e => { SS.cap = e.target.value; viewSoSanh(box); };
      return;
    }
    const [k15, k85] = await Promise.all([tinh(A, { boCT: SS.boCT }), tinh(B, { boCT: SS.boCT })]);
    const ss = E.soSanhTuan(S.mau.TT15, k15, k85);
    const CT = E.SS_CHI_TIEU, ten = Object.fromEntries(CT.map(c => [c.cot, c.ten]));
    const lechNho = n => Math.abs(n || 0) < SS.nguong;
    const f1 = n => (n === null || n === undefined) ? '' : (Math.abs(n) < 0.05 ? '-' : n.toLocaleString('vi-VN', { maximumFractionDigits: 1 }));
    const cls = n => lechNho(n) ? '' : (n > 0 ? 'duong' : 'am');
    const tong = ss[0];
    const k15ky = S.file[A]?.ky_in?.match(/đến ngày\s*([\d/]+)/i)?.[1], k85ky = S.file[B]?.ky_in?.match(/đến ngày\s*([\d/]+)/i)?.[1];
    let ds = ss.filter((r, i) => i > 0 && r.loai === 'ct' && (!SS.chiLech || CT.some(c => !lechNho(r.lech[c.cot]))));
    if (SS.sapXep === 'lech') ds = [...ds].sort((a, b) => Math.abs(b.lech[SS.cot]) - Math.abs(a.lech[SS.cot]));
    const soLech = ss.filter((r, i) => i > 0 && r.loai === 'ct' && CT.some(c => !lechNho(r.lech[c.cot]))).length;
    const ctCon = ['D', 'E', 'U', 'V', 'X', 'Y'];
    box.innerHTML = `<div class="card">
      <div class="actions" style="margin-top:0"><button class="btn" id="ssBack">← Quay lại báo cáo</button>
        ${chon}
        ${coXuat() ? '<button class="btn" id="ssXuat">⬇ Xuất Excel so sánh</button>' : ''}
        <b style="margin-left:8px;color:var(--navy)">So sánh Báo cáo tuần theo chủ đầu tư: ${A} ↔ ${B}</b></div>
      ${k15ky && k85ky && k15ky !== k85ky ? `<div class="warnbox">⚠ Hai file khác ngày: <b>${A} in đến ${esc(k15ky)}</b>, <b>${B} in đến ${esc(k85ky)}</b>. Một phần chênh lệch là do thời điểm số liệu. Nên tải 2 file cùng ngày để so sánh chính xác.</div>` : ''}
      <h3>Tổng cộng toàn tỉnh</h3>
      <div class="tbl-wrap"><table class="tbl ss"><thead><tr><th>Chỉ tiêu (triệu đồng)</th><th>Báo cáo ${A}</th><th>Báo cáo ${B}</th><th>Chênh lệch<br>${A} − ${B}</th><th>Tỷ lệ chênh</th></tr></thead>
      <tbody>${CT.map(c => `<tr class="${c.cot === SS.cot ? 'chon' : ''}" data-cot="${c.cot}" style="cursor:pointer" title="Bấm để so sánh theo chỉ tiêu này">
        <td>${c.cot} – ${esc(c.ten)}</td><td class="num">${f1(tong.tt15[c.cot])}</td><td class="num">${f1(tong.tt85[c.cot])}</td>
        <td class="num ${cls(tong.lech[c.cot])}"><b>${f1(tong.lech[c.cot])}</b></td>
        <td class="num">${tong.tt85[c.cot] ? fmtPct(tong.lech[c.cot] / tong.tt85[c.cot]) : ''}</td></tr>`).join('')}</tbody></table></div>
      <h3 style="margin-top:18px">Chi tiết theo chủ đầu tư <span class="muted small">– ${soLech}/${ss.filter(r => r.loai === 'ct').length - 0} dòng có chênh lệch</span></h3>
      <div class="bar">
        <label>Chỉ tiêu so sánh<select id="ssCot">${CT.map(c => `<option value="${c.cot}" ${c.cot === SS.cot ? 'selected' : ''}>${c.cot} – ${esc(c.ten)}</option>`).join('')}</select></label>
        <label>Sắp xếp<select id="ssSap"><option value="mau" ${SS.sapXep === 'mau' ? 'selected' : ''}>Theo thứ tự báo cáo</option><option value="lech" ${SS.sapXep === 'lech' ? 'selected' : ''}>Chênh lệch lớn nhất trước</option></select></label>
        <label style="flex-direction:row;align-items:center;gap:6px;min-width:0"><input type="checkbox" id="ssChi" ${SS.chiLech ? 'checked' : ''} style="width:auto"> Chỉ hiện dòng có chênh lệch</label>
        <label style="flex-direction:row;align-items:center;gap:6px;min-width:0"><input type="checkbox" id="ssBo" ${SS.boCT ? 'checked' : ''} style="width:auto"> Bỏ khoản cộng thêm khi so sánh</label>
      </div>
      <div class="tbl-wrap tall"><table class="tbl ss"><thead><tr><th>STT</th><th>Chủ đầu tư</th><th>${A}</th><th>${B}</th><th>Chênh lệch</th><th>Lệch ở các chỉ tiêu khác</th><th>Ghi chú</th><th></th></tr></thead>
      <tbody>${ds.map(r => `<tr><td class="c">${esc(r.stt)}</td><td>${esc(r.ten)}</td>
        <td class="num">${f1(r.tt15[SS.cot])}</td><td class="num">${f1(r.tt85[SS.cot])}</td><td class="num ${cls(r.lech[SS.cot])}"><b>${f1(r.lech[SS.cot])}</b></td>
        <td class="small">${ctCon.filter(c => c !== SS.cot && !lechNho(r.lech[c])).map(c => `<span class="chip ${cls(r.lech[c])}" title="${esc(ten[c])}">${esc(ten[c])}: ${f1(r.lech[c])}</span>`).join(' ')}</td>
        <td class="gc-col">${oGhiChu(KGC, r.i)}</td>
        <td class="c"><button class="btn small" data-da="${r.i}">Xem dự án</button></td></tr>`).join('') || '<tr><td colspan="8" class="empty">Không có chênh lệch.</td></tr>'}</tbody></table></div>
      <p class="small muted">Đơn vị: triệu đồng. Chênh lệch = ${A} − ${B}; xanh: ${A} lớn hơn, đỏ: ${B} lớn hơn. Bỏ qua chênh dưới ${SS.nguong} triệu (làm tròn).</p></div>`;
    const lai = () => viewSoSanh(box);
    box.querySelector('#ssBack').onclick = () => show();
    box.querySelector('#ssCot').onchange = e => { SS.cot = e.target.value; lai(); };
    box.querySelector('#ssSap').onchange = e => { SS.sapXep = e.target.value; lai(); };
    box.querySelector('#ssChi').onchange = e => { SS.chiLech = e.target.checked; lai(); };
    box.querySelector('#ssBo').onchange = e => { SS.boCT = e.target.checked; lai(); };
    box.querySelector('#ssCap').onchange = e => { SS.cap = e.target.value; lai(); };
    box.querySelectorAll('tr[data-cot]').forEach(tr => tr.onclick = () => { SS.cot = tr.dataset.cot; lai(); });
    box.querySelector('#ssXuat')?.addEventListener('click', () => xuatSoSanh(ss).catch(fail));
    ganGhiChu(box, S.mau[A]);
    box.querySelector('tbody:last-of-type') && box.querySelectorAll('[data-da]').forEach(b => b.onclick = () => xemDuAnLech(ss[+b.dataset.da]));
  } catch (e) { fail(e); box.innerHTML = `<div class="card">${esc(viErr(e))} <button class="btn" onclick="location.reload()">Tải lại</button></div>`; }
}

async function xemDuAnLech(r) {
  const CT = E.SS_CHI_TIEU, ten = Object.fromEntries(CT.map(c => [c.cot, c.ten]));
  const tenDA = new Map((S.cdt || []).map(x => [x.ma_da, x.ten_da]));
  const [A, B] = capSS();
  const tenNguon = new Map([...nguonCua(A), ...nguonCua(B)].filter(x => x.ten).map(x => [x.ma_da, x.ten]));
  const lechNho = n => Math.abs(n || 0) < SS.nguong;
  const f1 = n => Math.abs(n || 0) < 0.05 ? '-' : n.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
  const cls = n => lechNho(n) ? '' : (n > 0 ? 'duong' : 'am');
  let ds = E.duAnCuaCDT(r.ten, nguonCua(A), nguonCua(B), A, B);
  const tongLech = ds.reduce((a, d) => a + d.lech[SS.cot], 0);
  const coLech = ds.filter(d => CT.some(c => !lechNho(d.lech[c.cot])) || d.co15 !== d.co85).sort((a, b) => Math.abs(b.lech[SS.cot]) - Math.abs(a.lech[SS.cot]));
  const ct = id => SS.boCT ? [] : dcCua(id).filter(d => d.dong === r.i);
  const ct15 = ct(A), ct85 = ct(B);
  const ghiCT = [...ct15.map(d => `${A} cộng thêm ${d.so_tien} triệu vào cột ${d.cot}`), ...ct85.map(d => `${B} cộng thêm ${d.so_tien} triệu vào cột ${d.cot}`)];
  const conLai = r.lech[SS.cot] - tongLech;
  await modal(`Chênh lệch theo dự án – ${esc(r.ten)}`, `<div style="min-width:min(1100px,90vw)">
    <p>Chỉ tiêu <b>${esc(ten[SS.cot])}</b>: ${A} <b>${f1(r.tt15[SS.cot])}</b> · ${B} <b>${f1(r.tt85[SS.cot])}</b> · chênh <b class="${cls(r.lech[SS.cot])}">${f1(r.lech[SS.cot])}</b> triệu.
      ${ds.length} dự án, <b>${coLech.length}</b> dự án có chênh lệch.</p>
    ${ghiCT.length ? `<div class="warnbox">Khoản cộng thêm ở dòng này: ${ghiCT.map(esc).join('; ')}.${lechNho(conLai) ? '' : ` Phần chênh do cộng thêm (chỉ tiêu đang xem): <b>${f1(conLai)}</b> triệu.`}</div>` : ''}
    <div class="tbl-wrap" style="max-height:60vh;overflow:auto"><table class="tbl ss"><thead><tr><th>Mã DA</th><th>Tên dự án</th><th>Có trong</th><th>${A}</th><th>${B}</th><th>Chênh lệch</th><th>Lệch ở chỉ tiêu khác</th></tr></thead>
    <tbody>${coLech.map(d => `<tr><td>${esc(d.ma_da)}</td><td class="ten" title="${esc(tenDA.get(d.ma_da) || tenNguon.get(d.ma_da) || '')}">${esc(tenDA.get(d.ma_da) || tenNguon.get(d.ma_da) || '')}</td>
      <td class="c">${d.co15 && d.co85 ? 'Cả hai' : d.co15 ? `<span class="chip duong">Chỉ ${A}</span>` : `<span class="chip am">Chỉ ${B}</span>`}</td>
      <td class="num">${f1(d.tt15[SS.cot])}</td><td class="num">${f1(d.tt85[SS.cot])}</td><td class="num ${cls(d.lech[SS.cot])}"><b>${f1(d.lech[SS.cot])}</b></td>
      <td class="small">${['D', 'E', 'U', 'V', 'X', 'Y'].filter(c => c !== SS.cot && !lechNho(d.lech[c])).map(c => `<span class="chip ${cls(d.lech[c])}">${esc(ten[c])}: ${f1(d.lech[c])}</span>`).join(' ')}</td></tr>`).join('')
      || '<tr><td colspan="7" class="empty">Không có dự án nào chênh lệch' + (ghiCT.length ? ' – chênh lệch của dòng này do khoản cộng thêm.' : '.') + '</td></tr>'}</tbody></table></div>
    <p class="small muted">"Chỉ ${A}" / "Chỉ ${B}": dự án chỉ xuất hiện trong một file hệ thống.</p></div>`, null, 'Đóng');
}

async function xuatSoSanh(ss) {
  const ExcelJS = await loadExcelJS();
  const CT = E.SS_CHI_TIEU;
  const [A, B] = capSS();
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet(`So sanh ${A}-${B}`, { views: [{ state: 'frozen', xSplit: 2, ySplit: 2 }] });
  ws.addRow(['STT', 'Chủ đầu tư', ...CT.flatMap(c => [c.ten, '', '']), 'Ghi chú']);
  ws.addRow(['', '', ...CT.flatMap(() => [A, B, 'Chênh lệch'])]);
  CT.forEach((c, i) => ws.mergeCells(1, 3 + i * 3, 1, 5 + i * 3));
  for (const r of ss) {
    const row = ws.addRow([r.stt, r.ten, ...CT.flatMap(c => [r.tt15[c.cot] || 0, r.tt85[c.cot] || 0, r.lech[c.cot] || 0]), ghiChu(khoaGhiChuSS(), r.i)?.noi_dung || '']);
    if (r.loai === 'nhom') row.font = { bold: true };
    CT.forEach((c, i) => { const cell = row.getCell(5 + i * 3); if (Math.abs(r.lech[c.cot]) >= SS.nguong) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4E5' } }; });
  }
  ws.getColumn(2).width = 42; ws.getColumn(3 + CT.length * 3).width = 40;
  for (let c = 3; c <= 2 + CT.length * 3; c++) { ws.getColumn(c).width = 13; ws.getColumn(c).numFmt = '#,##0.0;[Red]-#,##0.0;"-"'; }
  [1, 2].forEach(n => { ws.getRow(n).font = { bold: true }; ws.getRow(n).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; });
  ws.getRow(1).height = 32;
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = `So sanh BC tuan ${A} - ${B} ${ddmmyyyy(new Date()).replace(/\//g, '.')}.xlsx`; a.click();
}

// ================================================================ ĐỐI CHIẾU THBC (TT15) ↔ B5-01
const B5S = { file: {}, kq: null, loc: 'lech', tim: '', ct: 'KD' };
const tinhB5 = () => { const f = B5S.file; B5S.kq = (f.TT15 && f.XA && f.TINH) ? B5.soSanhB501(f.TT15, f.XA, f.TINH, B5S.ct) : null; };
const B5_TEN = { TT15: '2461_TT15 hoặc Báo cáo TT37 (THBC – mẫu 01b/TTKHN)', XA: 'B5-01 Ngân sách xã/phường', TINH: 'B5-01 Ngân sách tỉnh' };
function viewB501(v) {
  const f = B5S.file;
  const o = loai => {
    const x = f[loai];
    return `<div class="src ${x ? 'ok' : 'no'}"><h3>${B5_TEN[loai]}</h3>
      ${x ? `<div><b>${fmtDong(x.ds.size)}</b> dự án</div><div class="st">File: ${esc(x.ten_file)}${x.ky ? `<br>Kỳ: ${esc(x.ky.tu)} – ${esc(x.ky.den)}` : ''}</div>` : '<div class="st">Chưa chọn file</div>'}</div>`;
  };
  const ky = ['TT15', 'XA', 'TINH'].map(l => f[l]?.ky?.den).filter(Boolean);
  const lechNgay = new Set(ky).size > 1;
  v.innerHTML = `<div class="card">
    <h2>Đối chiếu số liệu THBC và B5-01</h2>
    <p class="muted small">So sánh chi tiết đến từng dự án giữa file THBC (2461_TT15 / TT37) và B5-01 NS xã + B5-01 NS tỉnh. Đơn vị: triệu đồng.</p>
    <div class="bar"><label style="min-width:min(640px,100%)">Chỉ tiêu đối chiếu<select id="b5ct">
      <option value="KD" ${B5S.ct === 'KD' ? 'selected' : ''}>① "Kế hoạch vốn kéo dài năm trước chuyển sang" ↔ "Dư dự toán năm trước chuyển sang"</option>
      <option value="NAM" ${B5S.ct === 'NAM' ? 'selected' : ''}>② "Kế hoạch vốn giao trong năm" ↔ "Dự toán giao đầu năm" (cột M) + "Dự toán điều chỉnh (3)" (cột N)</option>
      <option value="GN" ${B5S.ct === 'GN' ? 'selected' : ''}>③ "Lũy kế vốn thanh toán – Tổng số" (cột I) ↔ "Lũy kế chi từ đầu năm – Tổng số" (cột O) − "Dư tạm ứng năm trước chuyển sang" (cột L)</option>
    </select></label></div>
    <div class="src-grid">${o('TT15')}${o('XA')}${o('TINH')}</div>
    <div class="actions"><label class="btn primary">📂 Chọn 3 file (có thể chọn cùng lúc)…<input type="file" id="b5f" accept=".xls,.xlsx" multiple hidden></label>
      <span class="muted small">Phần mềm tự nhận ra file nào là THBC (2461_TT15 hoặc TT37), B5-01 NS xã, B5-01 NS tỉnh. Số liệu chỉ xử lý trên máy bạn, không lưu lên máy chủ.</span></div>
    ${lechNgay ? `<div class="warnbox">⚠ Các file khác ngày số liệu (${[...new Set(ky)].map(esc).join(', ')}). Nên dùng cùng ngày để đối chiếu chính xác.</div>` : ''}
  </div><div id="b5kq"></div>`;
  v.querySelector('#b5f').addEventListener('change', async e => {
    const files = [...e.target.files]; e.target.value = '';
    try {
      const XLSX = await loadXLSX();
      for (const fl of files) {
        const wb = XLSX.read(await fl.arrayBuffer(), { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null, raw: true, blankrows: true });
        const loai = B5.nhanDang(rows);
        if (!loai || loai === 'B501') { toast(`Không nhận ra loại file: ${fl.name}`, 'err'); continue; }
        const x = loai === 'TT15' ? B5.docTT15(rows) : B5.docB501(rows, loai);
        x.ten_file = fl.name; B5S.file[loai] = x;
        toast(`Đã đọc ${B5_TEN[loai]}: ${fmtDong(x.ds.size)} dự án.`, 'ok');
      }
      tinhB5(); viewB501(v);
    } catch (err) { fail(err); }
  });
  v.querySelector('#b5ct').onchange = e => { B5S.ct = e.target.value; tinhB5(); viewB501(v); };
  if (B5S.kq) veKetQuaB501(v.querySelector('#b5kq'));
  else if (Object.keys(f).length) v.querySelector('#b5kq').innerHTML = `<div class="card"><p class="muted">Còn thiếu: ${['TT15', 'XA', 'TINH'].filter(l => !f[l]).map(l => B5_TEN[l]).join(', ')}.</p></div>`;
}
const f3 = n => (n === null || n === undefined) ? '' : (Math.abs(n) < 0.0005 ? '-' : n.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 3 }));
function veKetQuaB501(box) {
  const k = B5S.kq, t = k.tong, d = k.dongTong, CT = B5.CHI_TIEU[k.ct], kd = k.ct === 'KD';
  const cdt = new Map((S.cdt || []).map(x => [x.ma_da, x]));
  const cls = n => Math.abs(n) < B5.SAI_SO ? '' : (n > 0 ? 'duong' : 'am');
  let ds = k.rows.filter(r => B5S.loc === 'tat' || r.coLech);
  const q = norm(B5S.tim);
  if (q) ds = ds.filter(r => norm(r.ma_da).includes(q) || norm(r.ten).includes(q) || norm(cdt.get(r.ma_da)?.cdt).includes(q));
  ds.sort((a, b) => Math.abs(b.lech) - Math.abs(a.lech) || a.ma_da.localeCompare(b.ma_da));
  const nhom = { chiTT: k.rows.filter(r => r.coLech && r.tt15 && !r.b501).length, chiB5: k.rows.filter(r => r.coLech && !r.tt15 && r.b501).length,
    caHai: k.rows.filter(r => r.coLech && r.tt15 && r.b501).length };
  box.innerHTML = `<div class="card">
    <div class="actions" style="margin-top:0">${coXuat() ? `<button class="btn primary" id="b5xuat1">⬇ Xuất Excel – chỉ tiêu đang chọn</button>
      <button class="btn" id="b5xuat3">⬇ Xuất Excel cả 3 chỉ tiêu</button>` : '<span class="muted small">Tài khoản Phòng giao dịch xem được kết quả nhưng không xuất Excel.</span>'}</div>
    ${k.kbLoc ? `<div class="okbox">File THBC gồm nhiều KBNN: chỉ lấy số của khối KBNN <b>${esc(k.kbLoc)}</b> (đơn vị lập B5-01).</div>` : ''}
    ${['TT15', 'XA', 'TINH'].some(l => !B5S.file[l].co?.[k.ct]) ? `<div class="warnbox">⚠ Không tìm thấy cột cần đối chiếu trong file: ${['TT15', 'XA', 'TINH'].filter(l => !B5S.file[l].co?.[k.ct]).map(l => esc(B5_TEN[l])).join(', ')} – số của file đó tính bằng 0.</div>` : ''}
    <div class="${k.soLech ? 'warnbox' : 'okbox'}"><b>${esc(CT.ten)}:</b> ${k.soLech ? `Có <b>${k.soLech}</b> dự án chênh lệch, tổng chênh <b>${f3(t.lech)}</b> triệu đồng: ${nhom.caHai} dự án lệch số, ${nhom.chiTT} dự án chỉ có số trên THBC, ${nhom.chiB5} dự án chỉ có số trên B5-01.` : '✓ Số liệu THBC và B5-01 khớp đến từng dự án.'}</div>
    <div class="tbl-wrap"><table class="tbl ss"><thead><tr><th>Chỉ tiêu (triệu đồng)</th><th>THBC (TT15/TT37)<br>${esc(CT.tt)}</th><th>B5-01 NS xã<br>${esc(CT.b5)}</th><th>B5-01 NS tỉnh<br>${esc(CT.b5)}</th><th>Cộng B5-01</th><th>Chênh lệch<br>THBC − B5-01</th></tr></thead>
    <tbody><tr><td>Cộng chi tiết các dự án</td><td class="num">${f3(t.tt15)}</td><td class="num">${f3(t.xa)}</td><td class="num">${f3(t.tinh)}</td><td class="num">${f3(t.b501)}</td><td class="num ${cls(t.lech)}"><b>${f3(t.lech)}</b></td></tr>
    <tr class="muted"><td>Dòng tổng của file</td><td class="num">${f3(d.tt15)}</td><td class="num">${f3(d.xa)}</td><td class="num">${f3(d.tinh)}</td><td class="num">${f3((d.xa || 0) + (d.tinh || 0))}</td><td class="num">${f3((d.tt15 || 0) - (d.xa || 0) - (d.tinh || 0))}</td></tr></tbody></table></div>
    <h3 style="margin-top:18px">Chi tiết theo dự án</h3>
    <div class="bar">
      <label>Hiển thị<select id="b5loc"><option value="lech" ${B5S.loc === 'lech' ? 'selected' : ''}>Chỉ dự án chênh lệch (${k.soLech})</option><option value="tat" ${B5S.loc === 'tat' ? 'selected' : ''}>Tất cả dự án có số (${k.rows.length})</option></select></label>
      <label style="min-width:260px">Tìm mã / tên dự án / chủ đầu tư<input id="b5tim" value="${esc(B5S.tim)}"></label>
      ${coXuat() ? '<button class="btn" id="b5xuat" style="align-self:flex-end">⬇ Xuất Excel</button>' : ''}
    </div>
    <div class="tbl-wrap tall"><table class="tbl ss"><thead><tr><th>STT</th><th>Mã DA</th><th>Tên dự án</th><th>Chủ đầu tư</th><th>THBC<br>${esc(CT.ttNgan)}</th><th>B5-01<br>NS xã</th><th>B5-01<br>NS tỉnh</th><th>Cộng<br>B5-01</th><th>Chênh lệch</th>${kd ? '<th>Dư tạm ứng năm trước<br>(B5-01, tham khảo)</th>' : ''}<th>Nhận xét</th></tr></thead>
    <tbody>${ds.map((r, i) => `<tr><td class="c">${i + 1}</td><td>${esc(r.ma_da)}</td><td class="ten" title="${esc(r.ten)}">${esc(r.ten)}</td><td>${esc(cdt.get(r.ma_da)?.cdt || '')}</td>
      <td class="num">${f3(r.tt15)}</td><td class="num">${f3(r.xa)}</td><td class="num">${f3(r.tinh)}</td><td class="num">${f3(r.b501)}</td>
      <td class="num ${cls(r.lech)}"><b>${r.coLech ? f3(r.lech) : '-'}</b></td>${kd ? `<td class="num">${f3(r.tu)}</td>` : ''}<td class="small">${esc(r.ly_do)}</td></tr>`).join('') || '<tr><td colspan="11" class="empty">Không có dự án phù hợp.</td></tr>'}</tbody></table></div>
    <p class="small muted">Đơn vị: triệu đồng. Bỏ qua chênh dưới 0,001 triệu (làm tròn). Xanh: THBC lớn hơn; đỏ: B5-01 lớn hơn.</p></div>`;
  box.querySelector('#b5loc').onchange = e => { B5S.loc = e.target.value; veKetQuaB501(box); };
  let hen; box.querySelector('#b5tim').oninput = e => { B5S.tim = e.target.value; clearTimeout(hen); hen = setTimeout(() => { veKetQuaB501(box); const i = box.querySelector('#b5tim'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300); };
  for (const id of ['#b5xuat', '#b5xuat1']) { const bx = box.querySelector(id); if (bx) bx.onclick = () => xuatB501(ds).catch(fail); }
  box.querySelector('#b5xuat3')?.addEventListener('click', () => xuatB501(null).catch(fail));
}
// Xuất Excel đối chiếu THBC ↔ B5-01
//   ds = danh sách đang xem (chỉ tiêu đang chọn) | null = xuất cả 3 chỉ tiêu, mỗi chỉ tiêu một sheet (dự án chênh lệch)
const TEN_SHEET_B5 = { KD: 'Doi chieu KH keo dai', NAM: 'Doi chieu KH trong nam', GN: 'Doi chieu luy ke thanh toan' };
async function xuatB501(ds) {
  const ExcelJS = await loadExcelJS();
  const f = B5S.file, cdt = new Map((S.cdt || []).map(x => [x.ma_da, x]));
  const wb = new ExcelJS.Workbook();
  const ds3 = ds ? [[B5S.kq, ds]] : Object.keys(B5.CHI_TIEU).map(ct => {
    const k = B5.soSanhB501(f.TT15, f.XA, f.TINH, ct);
    return [k, k.rows.filter(r => r.coLech).sort((x, y) => Math.abs(y.lech) - Math.abs(x.lech) || x.ma_da.localeCompare(y.ma_da))];
  });
  if (!ds) {   // sheet tổng hợp 3 chỉ tiêu
    const w0 = wb.addWorksheet('Tong hop');
    w0.addRow(['ĐỐI CHIẾU SỐ LIỆU THBC VỚI B5-01 NS XÃ + B5-01 NS TỈNH']);
    w0.addRow([`Số liệu đến ngày: THBC ${f.TT15.ky?.den || ''}; B5-01 NS xã ${f.XA.ky?.den || ''}; B5-01 NS tỉnh ${f.TINH.ky?.den || ''}. Đơn vị: triệu đồng`]);
    w0.addRow([]);
    w0.addRow(['Chỉ tiêu', 'THBC', 'B5-01 NS xã', 'B5-01 NS tỉnh', 'Cộng B5-01', 'Chênh lệch (THBC − B5-01)', 'Số dự án chênh lệch']);
    for (const [k] of ds3) w0.addRow([B5.CHI_TIEU[k.ct].ten, k.tong.tt15, k.tong.xa, k.tong.tinh, k.tong.b501, k.tong.lech, k.soLech]);
    w0.getColumn(1).width = 80; for (let c = 2; c <= 6; c++) { w0.getColumn(c).width = 18; w0.getColumn(c).numFmt = '#,##0.000;[Red]-#,##0.000;"-"'; } w0.getColumn(7).width = 12;
    w0.getRow(1).font = { bold: true, size: 13 }; w0.getRow(4).font = { bold: true }; w0.getRow(4).alignment = { wrapText: true, vertical: 'middle' };
  }
  for (const [k, list] of ds3) {
    const CT = B5.CHI_TIEU[k.ct], kd = k.ct === 'KD';
    const ws = wb.addWorksheet(TEN_SHEET_B5[k.ct], { views: [{ state: 'frozen', ySplit: 6 }] });
    ws.addRow([`ĐỐI CHIẾU ${CT.tt.toUpperCase()} (THBC) VỚI ${CT.b5.toUpperCase()} (B5-01)`]);
    ws.addRow([`Số liệu đến ngày: THBC ${f.TT15.ky?.den || ''}; B5-01 NS xã ${f.XA.ky?.den || ''}; B5-01 NS tỉnh ${f.TINH.ky?.den || ''}. Đơn vị: triệu đồng${k.kbLoc ? `. File THBC: chỉ lấy khối KBNN ${k.kbLoc}` : ''}`]);
    ws.addRow([]);
    ws.addRow(['Tổng cộng', '', '', '', k.tong.tt15, k.tong.xa, k.tong.tinh, k.tong.b501, k.tong.lech, kd ? k.tong.tu : '', `${k.soLech} dự án chênh lệch`]);
    ws.addRow([]);
    ws.addRow(['STT', 'Mã DA', 'Tên dự án', 'Chủ đầu tư', `THBC – ${CT.tt}`, `B5-01 NS xã – ${CT.b5}`, `B5-01 NS tỉnh – ${CT.b5}`, 'Cộng B5-01', 'Chênh lệch (THBC − B5-01)', kd ? 'Dư tạm ứng năm trước chuyển sang (B5-01)' : '', 'Nhận xét']);
    list.forEach((r, i) => {
      const row = ws.addRow([i + 1, r.ma_da, r.ten, cdt.get(r.ma_da)?.cdt || '', r.tt15, r.xa, r.tinh, r.b501, r.lech, kd ? r.tu : '', r.ly_do]);
      if (r.coLech) row.getCell(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4E5' } };
    });
    [6, 11, 60, 34, 16, 16, 16, 16, 16, 16, 40].forEach((w, i) => ws.getColumn(i + 1).width = w);
    for (let c = 5; c <= 10; c++) ws.getColumn(c).numFmt = '#,##0.000;[Red]-#,##0.000;"-"';
    ws.getRow(1).font = { bold: true, size: 13 }; ws.getRow(4).font = { bold: true };
    ws.getRow(6).font = { bold: true }; ws.getRow(6).alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' }; ws.getRow(6).height = 48;
    ws.autoFilter = { from: 'A6', to: 'K6' };
  }
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = `${ds ? TEN_SHEET_B5[B5S.kq.ct] : 'Doi chieu 3 chi tieu'} THBC - B5-01 ${(f.TT15.ky?.den || ddmmyyyy(new Date())).replace(/\//g, '.')}.xlsx`; a.click();
}

// ================================================================ TAB 3: CỘNG THÊM
function viewCongThem(v) {
  const id = S.bc, mau = S.mau[id], cot = cotDC(id);
  const list = S.dc.filter(d => d.bao_cao === id);
  const tenDong = i => { const r = mau.rows[i]; return r ? `${r.stt} ${r.ten}${r.kbnn ? ' (KB ' + r.kbnn + ')' : ''}` : '?'; };
  v.innerHTML = `<div class="card">
    <h2>Khoản "cộng thêm" ngoài số liệu hệ thống</h2>
    <p class="muted small">Tương ứng các ô trong Excel có dạng <code>=SUMIFS(...)/1000000 + 10000</code>. Đơn vị: <b>triệu đồng</b>. Bỏ tích "Áp dụng" để tạm không cộng.</p>
    <div class="bar"><label>Báo cáo<select id="bc">${Object.entries(E.BAO_CAO).map(([k, b]) => `<option value="${k}" ${k === id ? 'selected' : ''}>${esc(b.ten)}</option>`).join('')}</select></label>
      ${canEdit() ? '<button class="btn primary" id="them">+ Thêm khoản cộng thêm</button>' : ''}</div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Dòng (chủ đầu tư)</th><th>Cột</th><th>Số tiền (triệu đồng)</th><th>Ghi chú</th><th>Áp dụng</th>${canEdit() ? '<th></th>' : ''}</tr></thead>
    <tbody>${list.length ? list.map(d => `<tr data-id="${d.id}"><td>${esc(tenDong(d.dong))}</td><td>${esc(d.cot)} – ${esc(cot[d.cot] || '')}</td>
      <td class="num">${esc(Number(d.so_tien).toLocaleString('vi-VN'))}</td><td>${esc(d.ghi_chu || '')}</td>
      <td class="c"><input type="checkbox" data-act="bat" ${d.su_dung ? 'checked' : ''} ${canEdit() ? '' : 'disabled'} style="width:auto"></td>
      ${canEdit() ? `<td class="c"><button class="btn small" data-act="sua">Sửa</button> <button class="btn small danger" data-act="xoa">Xóa</button></td>` : ''}</tr>`).join('')
      : `<tr><td colspan="6" class="empty">Chưa có khoản cộng thêm nào cho báo cáo này.</td></tr>`}</tbody></table></div></div>`;
  v.querySelector('#bc').onchange = e => { S.bc = e.target.value; show(); };
  const form = (d = {}) => modal(d.id ? 'Sửa khoản cộng thêm' : 'Thêm khoản cộng thêm', `
    <label>Dòng chủ đầu tư<select name="dong" required>${mau.rows.map((r, i) => r.loai === 'ct' ? `<option value="${i}" ${i === d.dong ? 'selected' : ''}>${esc(tenDong(i))}</option>` : '').join('')}</select></label>
    <label>Cột<select name="cot">${Object.entries(cot).map(([k, t]) => `<option value="${k}" ${k === d.cot ? 'selected' : ''}>${k} – ${esc(t)}</option>`).join('')}</select></label>
    <label>Số tiền (triệu đồng, số âm để trừ)<input name="so" required inputmode="decimal" value="${d.so_tien ?? ''}"></label>
    <label>Ghi chú (lý do)<input name="gc" value="${esc(d.ghi_chu || '')}"></label>`,
  async fd => {
    const so = Number(String(fd.get('so')).replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
    if (!Number.isFinite(so)) throw new Error('Số tiền không hợp lệ.');
    const dong = +fd.get('dong');
    const rec = { bao_cao: id, dong, ten_dong: tenDong(dong), cot: fd.get('cot'), so_tien: so, ghi_chu: fd.get('gc') || null, cap_nhat_luc: new Date().toISOString() };
    if (d.id) await q(sb.from('th_dieu_chinh').update(rec).eq('id', d.id)); else await q(sb.from('th_dieu_chinh').insert(rec));
    await taiDC(); show();
  }, 'Lưu');
  v.querySelector('#them')?.addEventListener('click', () => form());
  v.querySelector('tbody').addEventListener('click', async e => {
    const act = e.target.dataset.act; if (!act) return;
    const d = S.dc.find(x => x.id === +e.target.closest('tr').dataset.id);
    try {
      if (act === 'sua') form(d);
      if (act === 'xoa' && await modal('Xóa', `<p>Xóa khoản cộng thêm ${esc(d.so_tien)} ở dòng "${esc(tenDong(d.dong))}"?</p>`, null, 'Xóa')) { await q(sb.from('th_dieu_chinh').delete().eq('id', d.id)); await taiDC(); show(); }
      if (act === 'bat') { await q(sb.from('th_dieu_chinh').update({ su_dung: e.target.checked }).eq('id', d.id)); await taiDC(); toast('Đã cập nhật.', 'ok'); }
    } catch (err) { fail(err); show(); }
  });
}
async function taiDC() { S.dc = await q(sb.from('th_dieu_chinh').select('*').order('bao_cao').order('dong')); }

// ================================================================ TAB 4: KỲ ĐÃ LƯU
async function viewKy(v) {
  if (S.xem) return viewMotKy(v, S.xem);
  const id = S.bc;
  const list = S.ky.filter(k => k.bao_cao === id);
  v.innerHTML = `<div class="card"><h2>Kỳ báo cáo đã lưu</h2>
    <div class="bar"><label>Báo cáo<select id="bc">${Object.entries(E.BAO_CAO).map(([k, b]) => `<option value="${k}" ${k === id ? 'selected' : ''}>${esc(b.ten)}</option>`).join('')}</select></label></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tên kỳ</th><th>Dòng thời gian</th><th>Chốt (làm tuần trước)</th><th>Người lưu</th><th>Lúc</th><th></th></tr></thead>
    <tbody>${list.length ? list.map(k => `<tr data-id="${k.id}"><td>${esc(k.ten)}</td><td>${esc(k.dong_tieu_de || '')}</td>
      <td class="c">${E.BAO_CAO[id].loai === 'TUAN' ? `<input type="checkbox" data-act="chot" ${k.chot ? 'checked' : ''} ${canEdit() ? '' : 'disabled'} style="width:auto">` : ''}</td>
      <td>${esc(k.tao_boi || '')}</td><td>${esc(ngay(k.tao_luc))}</td>
      <td class="c"><button class="btn small" data-act="xem">Xem / Xuất Excel</button>${canEdit() ? ' <button class="btn small danger" data-act="xoa">Xóa</button>' : ''}</td></tr>`).join('')
      : '<tr><td colspan="6" class="empty">Chưa lưu kỳ nào.</td></tr>'}</tbody></table></div></div>`;
  v.querySelector('#bc').onchange = e => { S.bc = e.target.value; show(); };
  v.querySelector('tbody').addEventListener('click', async e => {
    const act = e.target.dataset.act; if (!act) return;
    const k = S.ky.find(x => x.id === +e.target.closest('tr').dataset.id);
    try {
      if (act === 'xem') { S.xem = k.id; show(); }
      if (act === 'chot') { await q(sb.from('th_ky').update({ chot: e.target.checked }).eq('id', k.id)); await taiKy(); delete S.truoc[id]; toast('Đã cập nhật.', 'ok'); }
      if (act === 'xoa' && await modal('Xóa kỳ', `<p>Xóa kỳ "${esc(k.ten)}"?</p>`, null, 'Xóa')) { await q(sb.from('th_ky').delete().eq('id', k.id)); await taiKy(); delete S.truoc[id]; show(); }
    } catch (err) { fail(err); show(); }
  });
}
async function viewMotKy(v, kyId) {
  v.innerHTML = '<div class="loading">Đang tải…</div>';
  try {
    const k = await q(sb.from('th_ky').select('*').eq('id', kyId).single());
    const coSo = Array.isArray(k.so_lieu) && k.so_lieu.length;
    const K = E.KIEU[k.bao_cao];
    const so = coSo ? k.so_lieu : (k.anh_chup || []).map(a => {
      const o = Object.fromEntries(K.base.map(c => [c, 0]));
      Object.assign(o, a || {}); K.derive(o); return o;
    });
    v.innerHTML = `<div class="card no-print"><div class="actions" style="margin-top:0">
      <button class="btn" id="back">← Danh sách kỳ</button><button class="btn primary" id="xuat">⬇ Xuất Excel</button>
      <button class="btn" onclick="window.print()">🖨 In</button>
      <span class="muted">${esc(E.BAO_CAO[k.bao_cao].ten)} · ${esc(k.ten)}${coSo ? '' : ' · (chỉ có số lũy kế Q–Y nhập từ Excel)'}</span></div></div><div id="rp"></div>`;
    const saveDK = S.dongKy[k.bao_cao]; S.dongKy[k.bao_cao] = k.dong_tieu_de || k.ten;
    v.querySelector('#rp').innerHTML = renderBang(k.bao_cao, so);
    S.dongKy[k.bao_cao] = saveDK;
    v.querySelector('#back').onclick = () => { S.xem = null; show(); };
    v.querySelector('#xuat').onclick = () => xuatExcel(k.bao_cao, so, { dongKy: k.dong_tieu_de || k.ten, dongVB: k.so_van_ban ?? undefined }).catch(fail);
  } catch (e) { fail(e); S.xem = null; }
}

boot();

// ================================================================ BIỂU ĐỐI CHIẾU THBC (Đối chiếu KPI / Đối chiếu 1953)
//   6 biểu: {KPI, 1953} × {TT15, TT85, TT37} + so sánh theo cặp nguồn cho từng mẫu
const DTS = { mau: 'KPI', nguon: 'TT15', cap: 'TT15|TT85', chiLech: true, cache: null, mauDT: null, donVi: 'TR' };
// Đơn vị hiển thị / xuất Excel: triệu đồng (3 số lẻ) hoặc đồng (số nguyên). Số tính toán luôn giữ theo triệu đồng.
const laDong = () => DTS.donVi === 'DONG';
const tenDV = () => laDong() ? 'đồng' : 'triệu đồng';
const fdt = n => (n === null || n === undefined) ? '' : laDong() ? (Math.abs(n) < 0.0005 ? '-' : Math.round(n * 1e6).toLocaleString('vi-VN')) : f3(n);
const DT_MAU = { KPI: 'Đối chiếu KPI', CV1953: 'Đối chiếu 1953' };
const DT_NGUON = { TT15: 'Số liệu theo TT15', TT85: 'Số liệu theo TT85', TT37: 'Số liệu theo TT37', SS: 'So sánh hai nguồn' };
const capDT = () => DTS.cap.split('|');
const DT_SAI_SO = 0.0005;            // triệu đồng (< 1.000 đ coi như khớp)
const dtCot = () => DTS.mau === 'KPI' ? DTE.COT_KPI : ['D'];
const dtCotSS = () => DTS.mau === 'KPI' ? ['D', 'G', 'J'] : ['D'];
const coLechDT = l => dtCot().some(c => Math.abs(l?.[c] || 0) >= DT_SAI_SO);
const kyDT = l => { const den = /đến ngày\s*([\d/]+)/i.exec(S.file?.[l]?.ky_in || '')?.[1]; return den ? `Lũy kế đến ngày ${den}` : ''; };

async function tinhDTCache() {
  DTS.mauDT ||= await (await fetch(new URL('./mau_dt.json', import.meta.url))).json();
  if (DTS.cache?.gan === S.gan) return DTS.cache;
  const kq = Object.fromEntries(LOAI_NGUON.map(l => [l, DTE.tinhDT(DTS.mauDT, l, nguonCua(l), S.cdt)]));
  return (DTS.cache = { gan: S.gan, kq });
}

async function viewDT(v) {
  const ss = DTS.nguon === 'SS';
  v.innerHTML = `<div class="card no-print">
      <h2>Biểu đối chiếu THBC</h2>
      <p class="muted small">Tổng hợp lũy kế giải ngân theo chủ đầu tư / đơn vị / xã, phường và KBNN nơi giao dịch (mẫu "Biểu đối chiếu THBC"), lấy từ chi tiết dự án của file hệ thống TT15, TT85 hoặc TT37 đã nạp ở mục Dữ liệu đầu vào. Đơn vị: ${tenDV()}.</p>
      <div class="bar">
        <label>Mẫu biểu<select id="dtMau">${Object.entries(DT_MAU).map(([k, t]) => `<option value="${k}" ${k === DTS.mau ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>Đơn vị<select id="dtDV"><option value="TR" ${laDong() ? '' : 'selected'}>Triệu đồng</option><option value="DONG" ${laDong() ? 'selected' : ''}>Đồng</option></select></label>
        <label>Số liệu<select id="dtNguon">${Object.entries(DT_NGUON).map(([k, t]) => `<option value="${k}" ${k === DTS.nguon ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        ${ss ? `<label>Cặp so sánh<select id="dtCap">${Object.entries(SS_CAP).map(([k, t]) => `<option value="${k}" ${k === DTS.cap ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label class="chk"><input type="checkbox" id="dtLech" ${DTS.chiLech ? 'checked' : ''}> Chỉ hiện dòng chênh lệch</label>` : ''}
      </div>
      <div class="actions">
        ${coXuat() ? `<button class="btn primary" id="dtXuat">⬇ Xuất Excel</button>${ss ? '' : '<button class="btn" onclick="window.print()">🖨 In</button>'}` : ''}
        <span class="muted small">${ss ? 'Bấm vào một dòng để xem chênh lệch đến từng dự án.' : 'Bấm vào một dòng chi tiết để xem danh sách dự án.'}</span>
      </div>
    </div>
    <div id="dtKq"><div class="loading">Đang tính…</div></div>`;
  v.querySelector('#dtMau').onchange = e => { DTS.mau = e.target.value; viewDT(v); };
  v.querySelector('#dtNguon').onchange = e => { DTS.nguon = e.target.value; viewDT(v); };
  v.querySelector('#dtDV').onchange = e => { DTS.donVi = e.target.value; viewDT(v); };
  v.querySelector('#dtLech')?.addEventListener('change', e => { DTS.chiLech = e.target.checked; viewDT(v); });
  v.querySelector('#dtCap')?.addEventListener('change', e => { DTS.cap = e.target.value; viewDT(v); });
  const box = v.querySelector('#dtKq');
  try {
    const can = ss ? capDT() : [DTS.nguon], thieu = can.filter(l => !S.nguon?.[l]?.length);
    if (thieu.length) { box.innerHTML = `<div class="card"><p class="muted">Chưa có số liệu ${thieu.map(l => esc(NGUON_TEN[l])).join(', ')}. Phòng Nghiệp vụ 2 nạp file ở mục <b>Dữ liệu đầu vào</b>.</p></div>`; return; }
    const { kq } = await tinhDTCache();
    if (ss) { const [A, B] = capDT(); kq.SS = DTE.soSanhDT(DTS.mauDT, kq[A], kq[B]); kq.LP = DTE.lechTheoPhong(kq[A], kq[B]); veSoSanhDT(box, kq); veLechPhongDT(box, kq); }
    else veBieuDT(box, kq[DTS.nguon]);
    v.querySelector('#dtXuat')?.addEventListener('click', () => xuatDT(kq).catch(fail));
  } catch (e) { fail(e); box.innerHTML = `<div class="card">${esc(viErr(e))}</div>`; }
}

// Tiêu đề bảng theo mẫu
function dauBangDT(them = '') {
  if (DTS.mau === 'KPI') return `<thead>
    <tr><th rowspan="3">STT</th><th rowspan="3" class="nm">Chủ đầu tư / đơn vị / xã, phường</th><th rowspan="3">KBNN nơi giao dịch</th>
      <th colspan="9">Tổng giải ngân lũy kế đến thời điểm báo cáo</th><th rowspan="3" class="gc-col">Ghi chú</th>${them}</tr>
    <tr><th colspan="3">Tổng cộng</th><th colspan="3">Giải ngân KHV kéo dài</th><th colspan="3">Giải ngân KHV năm 2026</th></tr>
    <tr>${['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].map(c => `<th>${DTE.TEN_COT[c]}</th>`).join('')}</tr>
    <tr class="so">${['A', 'B', 'C', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => `<th>${x}</th>`).join('')}</tr></thead>`;
  return `<thead><tr><th>STT</th><th class="nm">Chủ đầu tư / đơn vị / xã, phường</th><th>KBNN nơi giao dịch</th><th>Tổng giải ngân lũy kế</th><th class="gc-col">Ghi chú</th></tr>
    <tr class="so">${['A', 'B', 'C', 1, 2].map(x => `<th>${x}</th>`).join('')}</tr></thead>`;
}
const lopDT = r => r.kieu === 'tong' ? 'l0' : r.kieu === 'khoi' ? 'l1' : r.kieu === 'nhom' ? 'l2' : '';

function veBieuDT(box, k) {
  const mau = DTS.mauDT, cot = dtCot(), l = k.loai;
  const td = o => cot.map(c => `<td class="num">${fdt(o[c])}</td>`).join('');
  const f = S.file?.[l];
  const body = mau.rows.map((r, i) => {
    const o = k.dong[i];
    return `<tr class="${lopDT(r)} ${r.kieu === 'ct' ? 'click' : ''}" ${r.kieu === 'ct' ? `data-i="${i}"` : ''}><td class="c">${esc(r.a)}</td><td class="nm" title="${esc(r.b)}">${esc(r.b)}</td><td>${esc(r.c)}</td>${td(o)}<td class="gc-col"></td></tr>`;
  }).join('');
  const thua = k.thua.length ? `<tr class="l1"><td class="c">III</td><td class="nm">CHƯA KHỚP MẪU BIỂU</td><td></td>${td(k.khoiThua)}<td class="gc-col small">Cần bổ sung vào mẫu hoặc sửa danh mục dự án</td></tr>`
    + k.thua.map((t, j) => `<tr class="click" data-t="${j}"><td class="c">-</td><td class="nm" title="${esc(t.dv)}">${esc(t.dv)}</td><td>${esc(DTE.tenPhong(t.phong))}</td>${td(t)}<td class="gc-col small">${esc(t.ly_do)}</td></tr>`).join('') : '';
  box.innerHTML = `<div class="no-print">
      ${k.thua.length ? `<div class="warnbox">⚠ Có <b>${k.thua.length}</b> nhóm dự án (tổng <b>${fdt(k.khoiThua.D)}</b> ${tenDV()}) chưa khớp được vào dòng nào của mẫu biểu – xem mục <b>III. CHƯA KHỚP MẪU BIỂU</b> cuối bảng. Dòng TỔNG CỘNG vẫn bao gồm số này.</div>`
        : `<div class="okbox">✓ Toàn bộ số liệu giải ngân của ${fmtDong(k.soDuAn)} dòng dự án trong file ${l} đã khớp vào mẫu biểu. Tổng cộng = cộng chi tiết dự án của file.</div>`}
    </div>
    <div class="card rpt-card">
      <div class="rpt-org small"><b>KHO BẠC NHÀ NƯỚC</b><br><b>KHO BẠC NHÀ NƯỚC KHU VỰC VIII</b></div>
      <div class="rpt-title"><div class="t1">TỔNG HỢP KẾT QUẢ GIẢI NGÂN VỐN ĐẦU TƯ THEO CHỦ ĐẦU TƯ</div>
        <div class="ky">${esc(kyDT(l) || 'Kỳ báo cáo: …')}</div><div class="small muted">(${esc(DT_MAU[DTS.mau])} – số liệu theo ${l}${f?.ten_file ? ', file ' + esc(f.ten_file) : ''})</div></div>
      <div class="small" style="text-align:right">Đơn vị: ${tenDV()}</div>
      <div class="tbl-wrap"><table class="tbl rpt dt">${dauBangDT()}<tbody>${body}${thua}</tbody></table></div>
    </div>`;
  box.querySelector('tbody').addEventListener('click', e => {
    const tr = e.target.closest('tr.click'); if (!tr) return;
    const x = tr.dataset.i !== undefined ? { ten: mau.rows[+tr.dataset.i].b === 'Giao dịch tại' ? mau.rows[+tr.dataset.i].dv : mau.rows[+tr.dataset.i].b, c: mau.rows[+tr.dataset.i].c, duAn: k.dong[+tr.dataset.i].duAn }
      : { ten: k.thua[+tr.dataset.t].dv, c: DTE.tenPhong(k.thua[+tr.dataset.t].phong), duAn: k.thua[+tr.dataset.t].duAn };
    xemDuAnDT(x, l);
  });
}

async function xemDuAnDT(x, l) {
  const cot = DTS.mau === 'KPI' ? ['D', 'G', 'J'] : ['D'];
  const ds = [...x.duAn].sort((a, b) => b.v.D - a.v.D);
  const tenDA = new Map((S.cdt || []).map(d => [d.ma_da, d.ten_da]));
  await modal(`Dự án – ${esc(x.ten)} (${esc(x.c)}) – ${l}`, `<div style="min-width:min(1000px,90vw)">
    <p>${ds.length} dự án; tổng giải ngân lũy kế <b>${fdt(ds.reduce((s, d) => s + d.v.D, 0))}</b> ${tenDV()}.</p>
    <div class="tbl-wrap" style="max-height:60vh;overflow:auto"><table class="tbl ss"><thead><tr><th>Mã DA</th><th>Tên dự án</th><th>Chủ đầu tư (danh mục)</th>${cot.map(c => `<th>${DTE.TEN_COT_DAY[c]}</th>`).join('')}</tr></thead>
    <tbody>${ds.map(d => `<tr><td>${esc(d.ma_da)}</td><td class="ten" title="${esc(tenDA.get(d.ma_da) || d.ten)}">${esc(tenDA.get(d.ma_da) || d.ten)}</td><td class="small">${esc(d.dv)}</td>${cot.map(c => `<td class="num">${fdt(d.v[c])}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="6" class="empty">Không có dự án.</td></tr>'}</tbody></table></div></div>`, null, 'Đóng');
}

function veSoSanhDT(box, kq) {
  const mau = DTS.mauDT, s = kq.SS, cot = dtCotSS(), [A, B] = capDT();
  const ba = (a, b, lch) => cot.map(c => `<td class="num">${fdt(a?.[c])}</td><td class="num">${fdt(b?.[c])}</td><td class="num ${Math.abs(lch[c]) < DT_SAI_SO ? '' : lch[c] > 0 ? 'duong' : 'am'}"><b>${fdt(lch[c])}</b></td>`).join('');
  const leafLech = s.dong.filter((d, i) => mau.rows[i].kieu === 'ct' && coLechDT(d.lech)).length + s.thua.filter(t => coLechDT(t.lech)).length;
  const hien = (i) => !DTS.chiLech || coLechDT(s.dong[i].lech);
  const body = mau.rows.map((r, i) => hien(i) ? `<tr class="${lopDT(r)} ${r.kieu === 'ct' || r.kieu === 'nhom' ? 'click' : ''}" data-i="${i}"><td class="c">${esc(r.a)}</td><td class="nm" title="${esc(r.b === 'Giao dịch tại' ? r.dv : r.b)}">${esc(r.b)}</td><td>${esc(r.c)}</td>${ba(s.dong[i].tt15, s.dong[i].tt85, s.dong[i].lech)}</tr>` : '').join('');
  const thua = s.thua.length ? `<tr class="l1"><td class="c">III</td><td class="nm">CHƯA KHỚP MẪU BIỂU</td><td></td>${ba(s.khoi.tt15, s.khoi.tt85, s.khoi.lech)}</tr>`
    + s.thua.map((t, j) => !DTS.chiLech || coLechDT(t.lech) ? `<tr class="click" data-t="${j}"><td class="c">-</td><td class="nm" title="${esc(t.ly_do)}">${esc(t.dv)}</td><td>${esc(DTE.tenPhong(t.phong))}</td>${ba(t.tt15, t.tt85, t.lech)}</tr>` : '').join('') : '';
  const t0 = s.dong[0];
  box.innerHTML = `<div class="card">
      <h2>So sánh ${esc(DT_MAU[DTS.mau])}: ${A} ↔ ${B}</h2>
      <div class="kpi dt-kpi">${cot.map(c => `<div><span>${DTE.TEN_COT_DAY[c]}</span><b>${A} ${fdt(t0.tt15[c])}</b><b>${B} ${fdt(t0.tt85[c])}</b><b class="${Math.abs(t0.lech[c]) < DT_SAI_SO ? '' : t0.lech[c] > 0 ? 'duong' : 'am'}">Chênh ${fdt(t0.lech[c])}</b></div>`).join('')}
        <div><span>Dòng chi tiết có chênh lệch</span><b>${leafLech}</b></div></div>
      <p class="muted small">Chênh lệch = ${A} − ${B}. ${esc(kyDT(A))} (${A}) · ${esc(kyDT(B))} (${B}). Hai file khác ngày số liệu thì chênh lệch có cả phần phát sinh giữa hai ngày.</p>
      <div class="tbl-wrap"><table class="tbl rpt dt ss"><thead>
        <tr><th rowspan="2">STT</th><th rowspan="2" class="nm">Chủ đầu tư / đơn vị / xã, phường</th><th rowspan="2">KBNN nơi giao dịch</th>${cot.map(c => `<th colspan="3">${DTE.TEN_COT_DAY[c]}</th>`).join('')}</tr>
        <tr>${cot.map(() => `<th>${A}</th><th>${B}</th><th>Chênh lệch</th>`).join('')}</tr></thead>
        <tbody>${body}${thua}</tbody></table></div>
      ${DTS.chiLech && !leafLech ? `<p class="okbox">✓ Không có dòng nào chênh lệch giữa ${A} và ${B}.</p>` : ''}
    </div>`;
  box.querySelector('tbody').addEventListener('click', e => {
    const tr = e.target.closest('tr.click'); if (!tr) return;
    if (tr.dataset.t !== undefined) { const t = s.thua[+tr.dataset.t]; return xemLechDT(t.dv, DTE.tenPhong(t.phong), t.tt15?.duAn, t.tt85?.duAn, t.lech); }
    const i = +tr.dataset.i, r = mau.rows[i];
    // dòng nhóm: gộp dự án của các dòng con
    const la = []; const gom = j => { const x = mau.rows[j]; if (x.con) x.con.forEach(gom); else la.push(j); }; gom(i);
    xemLechDT(r.b === 'Giao dịch tại' ? r.dv : r.b, r.c || 'các nơi giao dịch', la.flatMap(j => kq[A].dong[j].duAn), la.flatMap(j => kq[B].dong[j].duAn), s.dong[i].lech);
  });
}

// ---- Chênh lệch theo phòng giao dịch và chi tiết từng dự án (chế độ so sánh)
const DTP = { phong: '*', tim: '', chiLech: true };
function veLechPhongDT(box, kq) {
  const [A, B] = capDT(), cot = dtCotSS(), L = kq.LP;
  const cls = n => Math.abs(n) < DT_SAI_SO ? '' : n > 0 ? 'duong' : 'am';
  const ba = (x, y, l) => cot.map(c => `<td class="num">${fdt(x[c])}</td><td class="num">${fdt(y[c])}</td><td class="num ${cls(l[c])}"><b>${fdt(l[c])}</b></td>`).join('');
  const dau = cot.map(c => `<th colspan="3">${DTE.TEN_COT_DAY[c]}</th>`).join(''), dau2 = cot.map(() => `<th>${A}</th><th>${B}</th><th>Chênh lệch</th>`).join('');
  const tong = L.phong.reduce((s, p) => { for (const c of cot) { s.a[c] = (s.a[c] || 0) + p.tt15[c]; s.b[c] = (s.b[c] || 0) + p.tt85[c]; s.l[c] = (s.l[c] || 0) + p.lech[c]; } s.n += p.soLech; s.m += p.soDA; return s; }, { a: {}, b: {}, l: {}, n: 0, m: 0 });
  const c1 = document.createElement('div'); c1.className = 'card';
  c1.innerHTML = `<h2>Chênh lệch theo phòng giao dịch: ${A} ↔ ${B}</h2>
    <p class="muted small">Phòng giao dịch theo khối KBNN nơi dự án giao dịch trong file hệ thống. Bấm vào một phòng để xem chi tiết dự án chênh lệch của phòng đó.</p>
    <div class="tbl-wrap"><table class="tbl rpt dt ss"><thead><tr><th rowspan="2">Phòng giao dịch</th><th rowspan="2">Dự án chênh lệch</th>${dau}</tr><tr>${dau2}</tr></thead>
    <tbody><tr class="l0"><td>Tổng cộng</td><td class="c">${tong.n} / ${tong.m}</td>${ba(tong.a, tong.b, tong.l)}</tr>
    ${L.phong.map(p => `<tr class="click ${p.soLech ? '' : 'muted'}" data-p="${esc(p.phong)}"><td>${esc(DTE.tenPhong(p.phong))}</td><td class="c">${p.soLech ? `<b>${p.soLech}</b>` : '0'} / ${p.soDA}</td>${ba(p.tt15, p.tt85, p.lech)}</tr>`).join('')}</tbody></table></div>`;
  const c2 = document.createElement('div'); c2.className = 'card'; c2.id = 'dtDA';
  box.append(c1, c2);
  c1.querySelector('tbody').addEventListener('click', e => { const tr = e.target.closest('tr[data-p]'); if (!tr) return; DTP.phong = tr.dataset.p; veDuAnLechDT(c2, kq); c2.scrollIntoView({ behavior: 'smooth' }); });
  veDuAnLechDT(c2, kq);
}
function veDuAnLechDT(c2, kq) {
  const [A, B] = capDT(), cot = dtCotSS(), L = kq.LP;
  const cls = n => Math.abs(n) < DT_SAI_SO ? '' : n > 0 ? 'duong' : 'am';
  const dm = new Map((S.cdt || []).map(d => [d.ma_da, d.ten_da]));
  const tenDA = { get: ma => (dm.get(ma) || L.duAn.find(d => d.ma_da === ma)?.ten || '').replace(new RegExp('^\\s*' + ma + '\\s*-\\s*'), '') };
  const coLech = d => DTE.COT_KPI.some(c => Math.abs(d.lech[c]) >= DT_SAI_SO);
  const q = DTP.tim.trim().toLowerCase();
  let ds = L.duAn.filter(d => (DTP.phong === '*' || d.phong === DTP.phong) && (!DTP.chiLech || coLech(d))
    && (!q || d.ma_da.toLowerCase().includes(q) || (tenDA.get(d.ma_da) || d.ten || '').toLowerCase().includes(q) || (d.dv || '').toLowerCase().includes(q)));
  ds.sort((x, y) => Math.abs(y.lech.D) - Math.abs(x.lech.D) || Math.abs(y.lech.G) - Math.abs(x.lech.G) || x.ma_da.localeCompare(y.ma_da));
  const tong = ds.reduce((s, d) => { s.a += d.tt15.D; s.b += d.tt85.D; s.l += d.lech.D; return s; }, { a: 0, b: 0, l: 0 });
  const GH = 1000, hien = ds.slice(0, GH);
  c2.innerHTML = `<h2>Chênh lệch chi tiết theo dự án: ${A} ↔ ${B}</h2>
    <div class="bar">
      <label>Phòng giao dịch<select id="dpPhong"><option value="*">Tất cả các phòng</option>${L.phong.map(p => `<option value="${esc(p.phong)}" ${p.phong === DTP.phong ? 'selected' : ''}>${esc(DTE.tenPhong(p.phong))} (${p.soLech} dự án lệch)</option>`).join('')}</select></label>
      <label style="min-width:260px">Tìm mã / tên dự án / chủ đầu tư<input id="dpTim" value="${esc(DTP.tim)}"></label>
      <label class="chk"><input type="checkbox" id="dpLech" ${DTP.chiLech ? 'checked' : ''}> Chỉ dự án chênh lệch</label>
    </div>
    <p class="small">${fmtDong(ds.length)} dự án · tổng giải ngân lũy kế: ${A} <b>${fdt(tong.a)}</b> · ${B} <b>${fdt(tong.b)}</b> · chênh <b class="${cls(tong.l)}">${fdt(tong.l)}</b> ${tenDV()}.${ds.length > GH ? ` Đang hiện ${GH} dự án chênh lớn nhất – xuất Excel để xem đủ.` : ''}</p>
    <div class="tbl-wrap tall"><table class="tbl ss dt"><thead><tr><th rowspan="2">STT</th><th rowspan="2">Mã DA</th><th rowspan="2">Tên dự án</th><th rowspan="2">Chủ đầu tư</th><th rowspan="2">Phòng giao dịch</th><th rowspan="2">Có trong</th>
      ${cot.map(c => `<th colspan="3">${DTE.TEN_COT_DAY[c]}</th>`).join('')}${DTS.mau === 'KPI' ? '<th rowspan="2">Chênh ở chỉ tiêu chi tiết</th>' : ''}</tr>
      <tr>${cot.map(() => `<th>${A}</th><th>${B}</th><th>Chênh lệch</th>`).join('')}</tr></thead>
    <tbody>${hien.map((d, i) => `<tr><td class="c">${i + 1}</td><td>${esc(d.ma_da)}</td><td class="ten" title="${esc(tenDA.get(d.ma_da) || d.ten)}">${esc(tenDA.get(d.ma_da) || d.ten)}</td>
      <td class="small">${esc(d.dv || '(chưa có trong danh mục)')}</td><td class="small">${esc(DTE.tenPhong(d.phong))}</td>
      <td class="c">${d.co15 && d.co85 ? 'Cả hai' : d.co15 ? `<span class="chip duong">Chỉ ${A}</span>` : `<span class="chip am">Chỉ ${B}</span>`}</td>
      ${cot.map(c => `<td class="num">${fdt(d.tt15[c])}</td><td class="num">${fdt(d.tt85[c])}</td><td class="num ${cls(d.lech[c])}"><b>${fdt(d.lech[c])}</b></td>`).join('')}
      ${DTS.mau === 'KPI' ? `<td class="small">${['H', 'I', 'K', 'L'].filter(c => Math.abs(d.lech[c]) >= DT_SAI_SO).map(c => `<span class="chip ${cls(d.lech[c])}">${DTE.TEN_COT_DAY[c]}: ${fdt(d.lech[c])}</span>`).join(' ')}</td>` : ''}</tr>`).join('')
      || `<tr><td colspan="${7 + cot.length * 3}" class="empty">Không có dự án phù hợp.</td></tr>`}</tbody></table></div>
    <p class="small muted">Chênh lệch = ${A} − ${B}; xanh: ${A} lớn hơn, đỏ: ${B} lớn hơn. "Chỉ ${A}" / "Chỉ ${B}": dự án có giải ngân ở một file (hoặc giao dịch ở phòng khác trong file kia). Sắp xếp: chênh lệch lớn nhất trước.</p>`;
  c2.querySelector('#dpPhong').onchange = e => { DTP.phong = e.target.value; veDuAnLechDT(c2, kq); };
  c2.querySelector('#dpLech').onchange = e => { DTP.chiLech = e.target.checked; veDuAnLechDT(c2, kq); };
  let hen; c2.querySelector('#dpTim').oninput = e => { DTP.tim = e.target.value; clearTimeout(hen); hen = setTimeout(() => { veDuAnLechDT(c2, kq); const i = c2.querySelector('#dpTim'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300); };
}

async function xemLechDT(ten, noi, ds15, ds85, lech) {
  const cot = DTS.mau === 'KPI' ? ['D', 'H', 'I', 'K', 'L'] : ['D'];
  const tenDA = new Map((S.cdt || []).map(d => [d.ma_da, d.ten_da]));
  const ds = DTE.ghepDuAn(ds15, ds85);
  const co = ds.filter(d => cot.some(c => Math.abs(d.lech[c]) >= DT_SAI_SO)).sort((a, b) => Math.abs(b.lech.D) - Math.abs(a.lech.D));
  const cls = n => Math.abs(n) < DT_SAI_SO ? '' : n > 0 ? 'duong' : 'am';
  const [A, B] = capDT();
  await modal(`Chênh lệch ${A} ↔ ${B} – ${esc(ten)} (${esc(noi)})`, `<div style="min-width:min(1150px,92vw)">
    <p>Tổng giải ngân lũy kế chênh <b class="${cls(lech.D)}">${fdt(lech.D)}</b> ${tenDV()}. ${ds.length} dự án, <b>${co.length}</b> dự án có chênh lệch.</p>
    <div class="tbl-wrap" style="max-height:60vh;overflow:auto"><table class="tbl ss"><thead><tr><th>Mã DA</th><th>Tên dự án</th><th>Có trong</th><th>${A} – tổng</th><th>${B} – tổng</th><th>Chênh lệch tổng</th>${DTS.mau === 'KPI' ? '<th>Chênh ở chỉ tiêu</th>' : ''}</tr></thead>
    <tbody>${co.map(d => `<tr><td>${esc(d.ma_da)}</td><td class="ten" title="${esc(tenDA.get(d.ma_da) || d.ten)}">${esc(tenDA.get(d.ma_da) || d.ten)}</td>
      <td class="c">${d.co15 && d.co85 ? 'Cả hai' : d.co15 ? `<span class="chip duong">Chỉ ${A}</span>` : `<span class="chip am">Chỉ ${B}</span>`}</td>
      <td class="num">${fdt(d.tt15.D)}</td><td class="num">${fdt(d.tt85.D)}</td><td class="num ${cls(d.lech.D)}"><b>${fdt(d.lech.D)}</b></td>
      ${DTS.mau === 'KPI' ? `<td class="small">${['H', 'I', 'K', 'L'].filter(c => Math.abs(d.lech[c]) >= DT_SAI_SO).map(c => `<span class="chip ${cls(d.lech[c])}">${DTE.TEN_COT_DAY[c]}: ${fdt(d.lech[c])}</span>`).join(' ')}</td>` : ''}</tr>`).join('')
      || `<tr><td colspan="7" class="empty">Không có dự án nào chênh lệch.</td></tr>`}</tbody></table></div>
    <p class="small muted">"Chỉ ${A}" / "Chỉ ${B}": dự án có giải ngân chỉ ở một file hệ thống. Chênh lệch = ${A} − ${B}.</p></div>`, null, 'Đóng');
}

// ---- Xuất Excel: biểu đang xem (giữ bố cục mẫu) hoặc bảng so sánh + danh sách dự án chênh lệch
async function xuatDT(kq) {
  const ExcelJS = await loadExcelJS();
  const mau = DTS.mauDT, wb = new ExcelJS.Workbook(), kpi = DTS.mau === 'KPI';
  const NF = laDong() ? '#,##0;[Red]-#,##0;"-"' : '#,##0.000;[Red]-#,##0.000;"-"';
  // bỏ sai số dấu phẩy động; đơn vị đồng → nhân 1.000.000, làm tròn đồng
  const lam = x => { const n = laDong() ? Math.round((Number(x) || 0) * 1e6) : Math.round((Number(x) || 0) * 1e6) / 1e6; return Math.abs(n) < 1e-6 ? 0 : n; };
  const vien = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  const kieuDong = (row, r, n) => { const b = r.kieu === 'tong' || r.kieu === 'khoi', nh = r.kieu === 'nhom';
    for (let c = 1; c <= n; c++) { const cell = row.getCell(c); cell.border = vien; if (b || nh) cell.font = { bold: true }; if (r.kieu === 'tong') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CC' } }; } };
  let tenFile;
  if (DTS.nguon !== 'SS') {
    const k = kq[DTS.nguon], cot = dtCot(), n = 4 + cot.length;
    const ws = wb.addWorksheet(DT_MAU[DTS.mau], { views: [{ state: 'frozen', xSplit: 3, ySplit: kpi ? 10 : 8 }], pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    ws.addRow(['KHO BẠC NHÀ NƯỚC']); ws.addRow(['KHO BẠC NHÀ NƯỚC KHU VỰC VIII']); ws.addRow([]);
    ws.addRow(['TỔNG HỢP KẾT QUẢ GIẢI NGÂN VỐN ĐẦU TƯ THEO CHỦ ĐẦU TƯ']); ws.mergeCells(4, 1, 4, n);
    ws.addRow([(kyDT(DTS.nguon) || 'KỲ BÁO CÁO: …') + ` (số liệu theo ${DTS.nguon})`]); ws.mergeCells(5, 1, 5, n);
    const r6 = ws.addRow([]); r6.getCell(n).value = `Đơn vị: ${tenDV()}`;
    [1, 2].forEach(i => ws.getRow(i).font = { bold: true }); [4, 5].forEach(i => { ws.getRow(i).font = { bold: true, size: i === 4 ? 13 : 11 }; ws.getRow(i).alignment = { horizontal: 'center' }; });
    let h0 = 7;
    if (kpi) {
      ws.addRow(['STT', 'Chủ đầu tư / đơn vị / xã, phường', 'KBNN nơi giao dịch', 'Tổng giải ngân lũy kế đến thời điểm báo cáo', '', '', '', '', '', '', '', '', 'Ghi chú']);
      ws.addRow(['', '', '', 'Tổng cộng', '', '', 'Giải ngân KHV kéo dài', '', '', 'Giải ngân KHV năm 2026', '', '', '']);
      ws.addRow(['', '', '', ...['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].map(c => DTE.TEN_COT[c]), '']);
      ws.addRow(['A', 'B', 'C', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      ws.mergeCells('D7:L7'); ws.mergeCells('A7:A9'); ws.mergeCells('B7:B9'); ws.mergeCells('C7:C9'); ws.mergeCells('M7:M9');
      ws.mergeCells('D8:F8'); ws.mergeCells('G8:I8'); ws.mergeCells('J8:L8');
    } else {
      ws.addRow(['STT', 'Chủ đầu tư / đơn vị / xã, phường', 'KBNN nơi giao dịch', 'Tổng giải ngân lũy kế', 'Ghi chú']);
      ws.addRow(['A', 'B', 'C', 1, 2]);
    }
    const hEnd = ws.rowCount;
    for (let r = h0; r <= hEnd; r++) { const row = ws.getRow(r); row.font = { bold: true }; row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; for (let c = 1; c <= n; c++) row.getCell(c).border = vien; }
    mau.rows.forEach((r, i) => { const row = ws.addRow([r.a, r.b, r.c, ...cot.map(c => lam(k.dong[i][c])), '']); kieuDong(row, r, n); });
    if (k.thua.length) {
      kieuDong(ws.addRow(['III', 'CHƯA KHỚP MẪU BIỂU', '', ...cot.map(c => lam(k.khoiThua[c])), 'Cần bổ sung vào mẫu hoặc sửa danh mục dự án']), { kieu: 'khoi' }, n);
      for (const t of k.thua) kieuDong(ws.addRow(['-', t.dv, DTE.tenPhong(t.phong), ...cot.map(c => lam(t[c])), t.ly_do]), { kieu: 'ct' }, n);
    }
    ws.getColumn(1).width = 7; ws.getColumn(2).width = 48; ws.getColumn(3).width = 20; ws.getColumn(n).width = 30;
    for (let c = 4; c < n; c++) { ws.getColumn(c).width = laDong() ? 20 : 15; ws.getColumn(c).numFmt = NF; }
    tenFile = `${DT_MAU[DTS.mau]} - ${DTS.nguon}${laDong() ? ' (dong)' : ''}`;
  } else {
    const s = kq.SS, cot = dtCotSS(), n = 3 + cot.length * 3, [A, B] = capDT();
    const ws = wb.addWorksheet(`So sanh ${A}-${B}`, { views: [{ state: 'frozen', xSplit: 3, ySplit: 2 }] });
    ws.addRow(['STT', 'Chủ đầu tư / đơn vị / xã, phường', 'KBNN nơi giao dịch', ...cot.flatMap(c => [DTE.TEN_COT_DAY[c], '', ''])]);
    ws.addRow(['', '', '', ...cot.flatMap(() => [A, B, 'Chênh lệch'])]);
    cot.forEach((c, i) => ws.mergeCells(1, 4 + i * 3, 1, 6 + i * 3)); ['A', 'B', 'C'].forEach(c => ws.mergeCells(`${c}1:${c}2`));
    [1, 2].forEach(r => { ws.getRow(r).font = { bold: true }; ws.getRow(r).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; for (let c = 1; c <= n; c++) ws.getRow(r).getCell(c).border = vien; });
    const ghi = (a, b, c, x, y, l, r) => { const row = ws.addRow([a, b, c, ...cot.flatMap(k => [lam(x?.[k]), lam(y?.[k]), lam(l[k])])]); kieuDong(row, r, n);
      cot.forEach((k, i) => { if (Math.abs(l[k]) >= DT_SAI_SO) row.getCell(6 + i * 3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4E5' } }; }); };
    mau.rows.forEach((r, i) => ghi(r.a, r.b, r.c, s.dong[i].tt15, s.dong[i].tt85, s.dong[i].lech, r));
    if (s.thua.length) { ghi('III', 'CHƯA KHỚP MẪU BIỂU', '', s.khoi.tt15, s.khoi.tt85, s.khoi.lech, { kieu: 'khoi' }); s.thua.forEach(t => ghi('-', t.dv, DTE.tenPhong(t.phong), t.tt15, t.tt85, t.lech, { kieu: 'ct' })); }
    ws.getColumn(1).width = 7; ws.getColumn(2).width = 48; ws.getColumn(3).width = 20;
    for (let c = 4; c <= n; c++) { ws.getColumn(c).width = laDong() ? 20 : 15; ws.getColumn(c).numFmt = NF; }
    // Sheet 2: theo phòng giao dịch; Sheet 3: dự án chênh lệch (dự án × phòng giao dịch)
    const L = kq.LP || DTE.lechTheoPhong(kq[A], kq[B]);
    const cotDA = kpi ? ['D', 'G', 'H', 'I', 'J', 'K', 'L'] : ['D'];
    const w1 = wb.addWorksheet('Theo phong giao dich', { views: [{ state: 'frozen', ySplit: 1 }] });
    w1.addRow(['Phòng giao dịch', 'Số dự án chênh lệch', 'Số dự án', ...cotDA.flatMap(c => [`${A} – ${DTE.TEN_COT_DAY[c]}`, `${B} – ${DTE.TEN_COT_DAY[c]}`, `Chênh – ${DTE.TEN_COT_DAY[c]}`])]);
    for (const p of L.phong) w1.addRow([DTE.tenPhong(p.phong), p.soLech, p.soDA, ...cotDA.flatMap(c => [lam(p.tt15[c]), lam(p.tt85[c]), lam(p.lech[c])])]);
    w1.getRow(1).font = { bold: true }; w1.getRow(1).alignment = { wrapText: true, vertical: 'middle' };
    w1.getColumn(1).width = 26; w1.getColumn(2).width = 12; w1.getColumn(3).width = 10;
    for (let c = 4; c < 4 + cotDA.length * 3; c++) { w1.getColumn(c).width = laDong() ? 20 : 15; w1.getColumn(c).numFmt = NF; }
    const w2 = wb.addWorksheet('Du an chenh lech', { views: [{ state: 'frozen', ySplit: 1 }] });
    w2.addRow(['Phòng giao dịch', 'Chủ đầu tư / đơn vị', 'Mã DA', 'Tên dự án', 'Có trong', ...cotDA.flatMap(c => [`${A} – ${DTE.TEN_COT_DAY[c]}`, `${B} – ${DTE.TEN_COT_DAY[c]}`, `Chênh – ${DTE.TEN_COT_DAY[c]}`])]);
    w2.getRow(1).font = { bold: true }; w2.getRow(1).alignment = { wrapText: true, vertical: 'middle' };
    const tenDA = new Map((S.cdt || []).map(d => [d.ma_da, d.ten_da]));
    const thuTu = p => p === 'NV2' ? 0 : p ? Number(p) : 999;
    const dsDA = L.duAn.filter(d => cotDA.some(c => Math.abs(d.lech[c]) >= DT_SAI_SO))
      .sort((x, y) => thuTu(x.phong) - thuTu(y.phong) || Math.abs(y.lech.D) - Math.abs(x.lech.D));
    for (const d of dsDA) w2.addRow([DTE.tenPhong(d.phong), d.dv || '', d.ma_da, tenDA.get(d.ma_da) || d.ten, d.co15 && d.co85 ? 'Cả hai' : d.co15 ? 'Chỉ ' + A : 'Chỉ ' + B, ...cotDA.flatMap(c => [lam(d.tt15[c]), lam(d.tt85[c]), lam(d.lech[c])])]);
    w2.getColumn(1).width = 20; w2.getColumn(2).width = 40; w2.getColumn(3).width = 10; w2.getColumn(4).width = 60; w2.getColumn(5).width = 10;
    for (let c = 6; c < 6 + cotDA.length * 3; c++) { w2.getColumn(c).width = laDong() ? 19 : 14; w2.getColumn(c).numFmt = NF; }
    w2.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 5 + cotDA.length * 3 } };
    tenFile = `So sanh ${DT_MAU[DTS.mau]} ${A} - ${B}${laDong() ? ' (dong)' : ''}`;
  }
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = `${tenFile} ${ddmmyyyy(new Date()).replace(/\//g, '.')}.xlsx`; a.click();
}

// ================================================================ BÁO CÁO DỰ ÁN TRỌNG ĐIỂM (Biểu 01)
//   Đầu vào: sheet TW, ĐP (01b/TTKHN). Mỗi lần nạp lưu thành một kỳ theo ngày số liệu (đối chiếu thứ 6 hằng tuần).
const TDS = { id: null, soSanh: undefined, dm: null, ky: [], cache: {}, dongVB: '' };
const THU = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
const thuCua = iso => { const d = new Date(iso + 'T00:00:00'); return Number.isNaN(+d) ? '' : THU[d.getDay()]; };
const tenKyTD = k => `Ngày ${TD.ngayVN(k.ngay)} (${thuCua(k.ngay)})`;
const fTD = n => (n === null || n === undefined || Number.isNaN(n)) ? '' : (Math.abs(n) < 0.5 ? '-' : nf0.format(Math.round(n)));
const pTD = n => (n === null || n === undefined || !Number.isFinite(n)) ? '' : Math.round(n * 100) + '%';

async function taiTD() {
  const [dm, ky] = await Promise.all([
    q(sb.from('th_td_dm').select('*').eq('id', 1).maybeSingle()),
    q(sb.from('th_td_ky').select('id,ngay,ten,ky_in,ten_file,tao_luc,tao_boi').order('ngay', { ascending: false })),
  ]);
  TDS.dm = dm; TDS.ky = ky || [];
  if (!TDS.ky.some(k => k.id === TDS.id)) { TDS.id = TDS.ky[0]?.id ?? null; TDS.soSanh = undefined; }
}
async function layKyTD(id) {
  return TDS.cache[id] ||= await q(sb.from('th_td_ky').select('*').eq('id', id).single());
}

async function viewTD(v) {
  v.innerHTML = '<div class="loading">Đang tải…</div>';
  try { await taiTD(); } catch (e) { fail(e); v.innerHTML = `<div class="card">${esc(viErr(e))}</div>`; return; }
  const sua = canEdit();
  if (!TDS.ky.length) {
    v.innerHTML = `<div class="card"><h2>Báo cáo dự án trọng điểm (Biểu 01)</h2>
      <p>Chưa có kỳ số liệu nào. ${sua ? 'Bấm <b>Nạp số liệu</b> và chọn file Excel có 2 sheet <b>TW</b>, <b>ĐP</b> (báo cáo 01b/TTKHN xuất từ hệ thống). Lần đầu, file cần có thêm sheet <b>Biểu 01</b> để lấy danh mục dự án trọng điểm và kế hoạch vốn.' : 'Phòng Nghiệp vụ 2 sẽ nạp số liệu hằng tuần.'}</p>
      ${sua ? '<div class="actions"><button class="btn primary" id="tdNap">📂 Nạp số liệu (sheet TW, ĐP)…</button></div>' : ''}</div>`;
    v.querySelector('#tdNap')?.addEventListener('click', () => napTD(v));
    return;
  }
  const k = await layKyTD(TDS.id);
  const truoc = TDS.ky.filter(x => x.ngay < k.ngay);
  if (TDS.soSanh === undefined) TDS.soSanh = truoc[0]?.id ?? '';     // mặc định: so với kỳ liền trước
  const dm = k.dm?.length ? k.dm : (TDS.dm?.dong || []);
  const kq = TD.tinhBieu(dm, k.so);
  const kp = TDS.soSanh ? await layKyTD(TDS.soSanh) : null;
  const kqp = kp ? TD.tinhBieu(dm, kp.so) : null;
  const [, mm, yy] = TD.ngayVN(k.ngay).split('/');
  if (!TDS.dongVB) TDS.dongVB = `(Kèm theo Công văn số                              /KBVIII-NV2 ngày                      /${mm}/${yy} của  Kho bạc Nhà nước khu vực VIII)`;
  v.innerHTML = `<div class="card no-print">
      <h2>Báo cáo dự án trọng điểm (Biểu 01)</h2>
      <div class="bar">
        <label>Kỳ số liệu<select id="tdKy">${TDS.ky.map(x => `<option value="${x.id}" ${x.id === k.id ? 'selected' : ''}>${esc(tenKyTD(x))}</option>`).join('')}</select></label>
        <label>Đối chiếu với kỳ<select id="tdSS"><option value="">— Không đối chiếu —</option>${truoc.map(x => `<option value="${x.id}" ${x.id === TDS.soSanh ? 'selected' : ''}>${esc(tenKyTD(x))}</option>`).join('')}</select></label>
        <label style="flex:1;min-width:320px">Dòng "Kèm theo Công văn số…"<input id="tdVB" value="${esc(TDS.dongVB)}"></label>
      </div>
      <div class="actions">
        ${sua ? '<button class="btn primary" id="tdNap">📂 Nạp số liệu tuần (sheet TW, ĐP)…</button><button class="btn" id="tdDM">📝 Danh mục & kế hoạch vốn…</button>' : ''}
        ${coXuat() ? '<button class="btn" id="tdXuat">⬇ Xuất Excel</button><button class="btn" onclick="window.print()">🖨 In</button>' : ''}
        ${sua ? '<button class="btn ghost" id="tdXoa">🗑 Xóa kỳ này</button>' : ''}
      </div>
      <p class="muted small">Số liệu ${esc(k.ky_in || '')} · file ${esc(k.ten_file || '')} · nạp ${esc(ngay(k.tao_luc))}${k.tao_boi ? ' · ' + esc(k.tao_boi) : ''}. Đơn vị: triệu đồng.
        Giải ngân lấy theo mã dự án: KHV kéo dài = cột J, KHV năm 2026 = cột M của sheet TW (NSTW) và ĐP (NSĐP). Mỗi lần nạp được lưu thành một kỳ để đối chiếu thứ 6 hằng tuần.</p>
      ${kq.thieu.length ? `<div class="warnbox">⚠ ${kq.thieu.length} mã dự án không có trong sheet TW và ĐP của kỳ này (giải ngân = 0): ${kq.thieu.map(i => `<b>${esc(dm[i].ma_da)}</b> ${esc(dm[i].ten.slice(0, 60))}`).join('; ')}.</div>` : ''}
    </div>
    <div id="tdBieu">${bangTD(dm, kq, k)}</div>
    ${kqp ? `<div id="tdDC">${bangDoiChieuTD(dm, kq, kqp, k, kp)}</div>` : ''}`;
  v.querySelector('#tdKy').onchange = e => { TDS.id = Number(e.target.value); TDS.soSanh = undefined; viewTD(v); };
  v.querySelector('#tdSS').onchange = e => { TDS.soSanh = e.target.value ? Number(e.target.value) : ''; viewTD(v); };
  v.querySelector('#tdVB').oninput = e => { TDS.dongVB = e.target.value; const t = v.querySelector('.td-vb'); if (t) t.textContent = e.target.value; };
  v.querySelector('#tdNap')?.addEventListener('click', () => napTD(v));
  v.querySelector('#tdDM')?.addEventListener('click', () => suaDMTD(v, k));
  v.querySelector('#tdXuat')?.addEventListener('click', () => xuatTD(dm, kq, k, kp ? { kqp, kp } : null).catch(fail));
  v.querySelector('#tdXoa')?.addEventListener('click', async () => {
    if (!await modal('Xóa kỳ', `<p>Xóa kỳ số liệu <b>${esc(tenKyTD(k))}</b>? Danh mục dự án vẫn giữ nguyên.</p>`, null, 'Xóa')) return;
    try { await q(sb.from('th_td_ky').delete().eq('id', k.id)); delete TDS.cache[k.id]; TDS.id = null; toast('Đã xóa kỳ.', 'ok'); viewTD(v); } catch (e) { fail(e); }
  });
}

function bangTD(dm, kq, k) {
  const cot = TD.COT;
  const o = (x, b = false) => cot.map(c => `<td class="num${TD.PCT.has(c) ? ' c' : ''}">${b ? '<b>' : ''}${TD.PCT.has(c) ? pTD(x[c]) : fTD(x[c])}${b ? '</b>' : ''}</td>`).join('');
  const body = dm.map((d, i) => {
    const lv = d.kieu === 'cdt' ? 'l1' : d.kieu === 'nda' ? 'l2' : '';
    return `<tr class="${lv}"><td class="c">${esc(kq.stt[i])}</td><td class="nm td-ten" title="${esc(d.ten)}">${esc(d.ten)}</td><td class="c">${esc(d.ma_da || '')}</td>
      <td class="small">${esc(d.dia_diem || '')}</td>${o(kq.dong[i], lv !== '')}<td class="small">${esc(d.ghi_chu || '')}</td></tr>`;
  }).join('');
  return `<div class="card"><div class="kpi">
      <div><span>Tổng kế hoạch vốn</span><b>${fTD(kq.tong.E)}</b></div><div><span>Tổng giải ngân</span><b>${fTD(kq.tong.L)}</b></div>
      <div><span>Tỷ lệ giải ngân</span><b>${pTD(kq.tong.S)}</b></div><div><span>Vốn còn lại chưa giải ngân</span><b>${fTD(kq.tong.V)}</b></div></div>
    <div class="rpt-title"><div class="t1">BÁO CÁO TÌNH HÌNH, TIẾN ĐỘ THỰC HIỆN GIẢI NGÂN CÁC DỰ ÁN TRỌNG ĐIỂM TRÊN ĐỊA BÀN TỈNH TUYÊN QUANG NĂM ${esc(k.ngay.slice(0, 4))}</div>
      <div class="t1">ĐẾN NGÀY ${esc(TD.ngayVN(k.ngay))}</div><div class="td-vb small"><i>${esc(TDS.dongVB)}</i></div></div>
    <div class="small" style="text-align:right">Đơn vị tính: Triệu đồng</div>
    <div class="tbl-wrap tall"><table class="tbl rpt td"><thead>
      <tr><th rowspan="5">STT</th><th rowspan="5" class="nm">TÊN CÔNG TRÌNH, DỰ ÁN, CHỦ ĐẦU TƯ</th><th rowspan="5">Mã QHNS</th><th rowspan="5">Địa điểm mở tài khoản</th>
        <th rowspan="5">Tổng số kế hoạch vốn</th><th colspan="6">Tổng kế hoạch vốn</th><th rowspan="5">Tổng số giải ngân</th><th colspan="6">Giải ngân kế hoạch vốn</th>
        <th rowspan="5">Tỷ lệ đạt so với tổng số KHV</th><th rowspan="5">Tỷ lệ đạt so với KHV kéo dài</th><th rowspan="5">Tỷ lệ đạt so với KHV năm ${esc(k.ngay.slice(0, 4))}</th>
        <th rowspan="5">Số vốn còn lại chưa giải ngân</th><th rowspan="5" class="gc-col">Ghi chú</th></tr>
      <tr><th rowspan="4">Tổng số KHV được phép kéo dài sang năm ${esc(k.ngay.slice(0, 4))}</th><th colspan="2" rowspan="2">KHV được phép kéo dài</th><th rowspan="4">Tổng số KHV năm ${esc(k.ngay.slice(0, 4))}</th><th colspan="2" rowspan="2">KHV năm ${esc(k.ngay.slice(0, 4))}</th>
        <th rowspan="4">Tổng số giải ngân KHV kéo dài</th><th colspan="2" rowspan="2">KHV được phép kéo dài</th><th rowspan="4">Tổng giải ngân KHV năm ${esc(k.ngay.slice(0, 4))}</th><th colspan="2" rowspan="2">KHV năm ${esc(k.ngay.slice(0, 4))}</th></tr>
      <tr></tr>
      <tr><th rowspan="2">NSTW</th><th rowspan="2">NSĐP</th><th rowspan="2">NSTW</th><th rowspan="2">NSĐP</th><th rowspan="2">NSTW</th><th rowspan="2">NSĐP</th><th rowspan="2">NSTW</th><th rowspan="2">NSĐP</th></tr>
      <tr></tr>
      <tr class="so">${['1', '2', '3', '4', '5=6+9', '6=7+8', '7', '8', '9=10+11', '10', '11', '12=13+16', '13=14+15', '14', '15', '16=17+18', '17', '18', '19=12/5', '20=13/6', '21=16/9', '22=5-12', '23'].map(x => `<th>${x}</th>`).join('')}</tr></thead>
    <tbody><tr class="l0"><td></td><td class="nm">TỔNG SỐ</td><td></td><td></td>${o(kq.tong, true)}<td></td></tr>${body}</tbody></table></div></div>`;
}

// Đối chiếu giải ngân với kỳ trước (tăng thêm trong khoảng giữa 2 kỳ)
function bangDoiChieuTD(dm, kq, kqp, k, kp) {
  const cls = n => Math.abs(n) < 0.5 ? '' : n > 0 ? 'duong' : 'am';
  const ba = (a, b) => `<td class="num">${fTD(b)}</td><td class="num">${fTD(a)}</td><td class="num ${cls(a - b)}"><b>${fTD(a - b)}</b></td>`;
  const dong = (x, y) => `${ba(x.L, y.L)}${ba(x.M, y.M)}${ba(x.P, y.P)}<td class="c">${pTD(y.S)}</td><td class="c">${pTD(x.S)}</td>`;
  const da = dm.map((d, i) => ({ d, i })).filter(({ d }) => d.kieu === 'da' || d.kieu === 'dac');
  const khongTang = da.filter(({ i }) => Math.abs(kq.dong[i].L - kqp.dong[i].L) < 0.5);
  const tang = kq.tong.L - kqp.tong.L;
  return `<div class="card"><h2>Đối chiếu với kỳ ${esc(tenKyTD(kp))}</h2>
    <div class="kpi"><div><span>Giải ngân kỳ trước</span><b>${fTD(kqp.tong.L)}</b></div><div><span>Giải ngân kỳ này</span><b>${fTD(kq.tong.L)}</b></div>
      <div><span>Tăng thêm giữa 2 kỳ</span><b class="${cls(tang)}">${fTD(tang)}</b></div><div><span>Tỷ lệ giải ngân</span><b>${pTD(kqp.tong.S)} → ${pTD(kq.tong.S)}</b></div>
      <div><span>Dự án chưa tăng giải ngân</span><b>${khongTang.length} / ${da.length}</b></div></div>
    <p class="muted small">So sánh giải ngân theo cùng danh mục và kế hoạch vốn của kỳ ${esc(TD.ngayVN(k.ngay))}. Đơn vị: triệu đồng.</p>
    <div class="tbl-wrap tall"><table class="tbl rpt td ss"><thead>
      <tr><th rowspan="2">STT</th><th rowspan="2" class="nm">Dự án / chủ đầu tư</th><th rowspan="2">Mã DA</th>
        <th colspan="3">Tổng số giải ngân</th><th colspan="3">Giải ngân KHV kéo dài</th><th colspan="3">Giải ngân KHV năm ${esc(k.ngay.slice(0, 4))}</th><th colspan="2">Tỷ lệ so với tổng KHV</th></tr>
      <tr>${[0, 1, 2].map(() => `<th>${esc(TD.ngayVN(kp.ngay))}</th><th>${esc(TD.ngayVN(k.ngay))}</th><th>Tăng thêm</th>`).join('')}<th>${esc(TD.ngayVN(kp.ngay))}</th><th>${esc(TD.ngayVN(k.ngay))}</th></tr></thead>
    <tbody><tr class="l0"><td></td><td class="nm">TỔNG SỐ</td><td></td>${dong(kq.tong, kqp.tong)}</tr>
      ${dm.map((d, i) => `<tr class="${d.kieu === 'cdt' ? 'l1' : d.kieu === 'nda' ? 'l2' : ''}"><td class="c">${esc(kq.stt[i])}</td><td class="nm td-ten" title="${esc(d.ten)}">${esc(d.ten)}</td><td class="c">${esc(d.ma_da || '')}</td>${dong(kq.dong[i], kqp.dong[i])}</tr>`).join('')}
    </tbody></table></div>
    ${khongTang.length ? `<p class="small"><b>Dự án chưa tăng giải ngân giữa 2 kỳ:</b> ${khongTang.map(({ d, i }) => `${esc(kq.stt[i])}. ${esc(d.ten.slice(0, 70))}${d.ten.length > 70 ? '…' : ''} (${esc(d.ma_da)})`).join('; ')}.</p>` : ''}</div>`;
}

// ---- Nạp số liệu tuần: file có sheet TW, ĐP (và có thể có sheet Biểu 01)
async function napTD(v) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xlsx,.xls,.xlsm'; inp.multiple = true;
  inp.onchange = async () => {
    if (!inp.files.length) return;
    try {
      const XLSX = await loadXLSX();
      const gap = {}; const ten = [];
      for (const fl of inp.files) {
        ten.push(fl.name);
        const wb = XLSX.read(await fl.arrayBuffer(), { type: 'array' });
        for (const n of wb.SheetNames) {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: null, raw: true, blankrows: true });
          const l = TD.nhanDang(n, rows);
          if (l && !gap[l]) gap[l] = { n, rows, file: fl.name };
        }
      }
      if (!gap.TW || !gap.DP) throw new Error(`Không tìm thấy ${[!gap.TW && 'sheet TW', !gap.DP && 'sheet ĐP'].filter(Boolean).join(' và ')} (báo cáo 01b/TTKHN) trong file đã chọn.`);
      const tw = TD.docNguonTD(gap.TW.rows), dp = TD.docNguonTD(gap.DP.rows);
      const ngayTW = TD.ngayTuKy(tw.ky?.text), ngayDP = TD.ngayTuKy(dp.ky?.text);
      const dmMoi = gap.BIEU ? TD.docBieu01(gap.BIEU.rows) : null;
      const dmCu = TDS.dm?.dong || [];
      if (!dmMoi && !dmCu.length) throw new Error('Chưa có danh mục dự án trọng điểm: lần đầu cần chọn file có thêm sheet "Biểu 01".');
      const ngayMoi = ngayTW || ngayDP || new Date().toISOString().slice(0, 10);
      const daCo = TDS.ky.find(x => x.ngay === ngayMoi);
      const ok = await modal('Nạp số liệu dự án trọng điểm', `<div style="min-width:min(640px,90vw)">
        <p>File: <b>${ten.map(esc).join(', ')}</b></p>
        <ul>
          <li>Sheet <b>${esc(gap.TW.n)}</b> (NSTW): ${fmtDong(tw.soDong)} dòng dự án, ${esc(tw.ky?.text || 'không rõ ngày')}</li>
          <li>Sheet <b>${esc(gap.DP.n)}</b> (NSĐP): ${fmtDong(dp.soDong)} dòng dự án, ${esc(dp.ky?.text || 'không rõ ngày')}</li>
          ${gap.BIEU ? `<li>Sheet <b>${esc(gap.BIEU.n)}</b>: ${dmMoi.filter(d => d.ma_da).length} dự án trọng điểm</li>` : ''}
        </ul>
        ${ngayTW && ngayDP && ngayTW !== ngayDP ? `<div class="warnbox">⚠ Hai sheet khác ngày số liệu: TW đến ${esc(TD.ngayVN(ngayTW))}, ĐP đến ${esc(TD.ngayVN(ngayDP))}.</div>` : ''}
        <label>Lưu thành kỳ số liệu ngày<input type="date" name="ngay" required value="${esc(ngayMoi)}"></label>
        ${daCo ? `<div class="warnbox">Đã có kỳ ngày ${esc(TD.ngayVN(ngayMoi))} – số liệu của kỳ này sẽ được <b>thay bằng file mới</b>.</div>` : ''}
        ${dmMoi ? `<label class="chk"><input type="checkbox" name="capDM" ${dmCu.length ? '' : 'checked disabled'} checked> Cập nhật danh mục dự án và kế hoạch vốn theo sheet "${esc(gap.BIEU.n)}"</label>` : `<p class="muted small">Dùng danh mục và kế hoạch vốn hiện có (${dmCu.filter(d => d.ma_da).length} dự án).</p>`}
      </div>`, async fd => {
        const ngayLuu = fd.get('ngay');
        const capDM = dmMoi && (!dmCu.length || fd.get('capDM'));
        const dm = capDM ? dmMoi : dmCu;
        if (capDM) await q(sb.from('th_td_dm').upsert({ id: 1, dong: dmMoi, cap_nhat_luc: new Date().toISOString(), cap_nhat_boi: S.me?.ho_ten || null }));
        const rec = { ngay: ngayLuu, ten: 'Ngày ' + TD.ngayVN(ngayLuu), ky_in: tw.ky?.text || dp.ky?.text || '', ten_file: ten.join(', '), dm,
          so: TD.goiSo(tw, dp), tong: { tw: tw.tong, dp: dp.tong }, tao_luc: new Date().toISOString(), tao_boi: S.me?.ho_ten || null };
        const [luu] = await q(sb.from('th_td_ky').upsert(rec, { onConflict: 'ngay' }).select('id'));
        TDS.cache = {}; TDS.id = luu?.id ?? null; TDS.soSanh = undefined;
      }, 'Lưu kỳ');
      if (ok) { toast('Đã lưu kỳ số liệu dự án trọng điểm.', 'ok'); viewTD(v); }
    } catch (e) { fail(e); }
  };
  inp.click();
}

// ---- Sửa danh mục dự án trọng điểm và kế hoạch vốn
async function suaDMTD(v, k) {
  let ds = structuredClone(k.dm?.length ? k.dm : (TDS.dm?.dong || []));
  const d = document.createElement('dialog'); d.className = 'modal wide';
  const ve = () => {
    const { stt } = TD.cauTruc(ds);
    d.querySelector('tbody').innerHTML = ds.map((x, i) => {
      const nhom = x.kieu === 'cdt' || x.kieu === 'nda';
      return `<tr data-i="${i}" class="${x.kieu === 'cdt' ? 'l1' : x.kieu === 'nda' ? 'l2' : ''}">
        <td class="c">${esc(stt[i])}</td>
        <td><select data-f="kieu">${Object.entries(TD.KIEU).map(([a, t]) => `<option value="${a}" ${a === x.kieu ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
        <td><textarea data-f="ten" rows="2">${esc(x.ten || '')}</textarea></td>
        <td><input data-f="ma_da" value="${esc(x.ma_da || '')}" ${nhom ? 'disabled' : ''} style="width:90px"></td>
        <td><input data-f="dia_diem" value="${esc(x.dia_diem || '')}" ${nhom ? 'disabled' : ''}></td>
        ${['g', 'h', 'j', 'k'].map(c => `<td><input data-f="${c}" type="number" step="any" value="${nhom ? '' : (x[c] ?? 0)}" ${nhom ? 'disabled' : ''} style="width:110px"></td>`).join('')}
        <td><input data-f="ghi_chu" value="${esc(x.ghi_chu || '')}"></td>
        <td class="nowrap"><button type="button" class="btn small" data-a="len" title="Chuyển lên">↑</button><button type="button" class="btn small" data-a="xuong" title="Chuyển xuống">↓</button><button type="button" class="btn small" data-a="them" title="Thêm dòng bên dưới">＋</button><button type="button" class="btn small ghost" data-a="xoa" title="Xóa dòng">✕</button></td></tr>`;
    }).join('');
  };
  d.innerHTML = `<form method="dialog"><h3>Danh mục dự án trọng điểm và kế hoạch vốn</h3>
    <p class="muted small">Kế hoạch vốn đơn vị triệu đồng: G, H = KHV được phép kéo dài (NSTW, NSĐP); J, K = KHV năm (NSTW, NSĐP). Số thứ tự tự đánh theo loại dòng. Dự án phải có mã để lấy số giải ngân từ sheet TW, ĐP.</p>
    <div class="tbl-wrap" style="max-height:62vh;overflow:auto"><table class="tbl td-dm"><thead><tr><th>STT</th><th>Loại dòng</th><th>Tên công trình, dự án, chủ đầu tư</th><th>Mã DA</th><th>Địa điểm mở TK</th>
      <th>G – Kéo dài NSTW</th><th>H – Kéo dài NSĐP</th><th>J – Năm NSTW</th><th>K – Năm NSĐP</th><th>Ghi chú</th><th></th></tr></thead><tbody></tbody></table></div>
    <label class="chk"><input type="checkbox" name="apKy" checked> Áp dụng luôn cho kỳ đang xem (${esc(tenKyTD(k))}); bỏ tích nếu chỉ dùng từ kỳ nạp sau</label>
    <div class="actions"><button type="button" class="btn" id="dmThem">＋ Thêm dòng cuối</button><span style="flex:1"></span>
      <button class="btn ghost" value="cancel" formnovalidate>Hủy</button><button class="btn primary" value="ok">Lưu danh mục</button></div></form>`;
  document.body.append(d); ve(); d.showModal();
  d.addEventListener('close', () => d.remove());
  d.querySelector('tbody').addEventListener('input', e => {
    const tr = e.target.closest('tr'), f = e.target.dataset.f; if (!tr || !f) return;
    const x = ds[+tr.dataset.i];
    x[f] = ['g', 'h', 'j', 'k'].includes(f) ? (Number(e.target.value) || 0) : e.target.value;
    if (f === 'kieu') { if (x.kieu === 'cdt' || x.kieu === 'nda') { delete x.ma_da; } ve(); }
  });
  d.querySelector('tbody').addEventListener('click', e => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const i = +b.closest('tr').dataset.i, a = b.dataset.a;
    if (a === 'len' && i > 0) [ds[i - 1], ds[i]] = [ds[i], ds[i - 1]];
    if (a === 'xuong' && i < ds.length - 1) [ds[i + 1], ds[i]] = [ds[i], ds[i + 1]];
    if (a === 'them') ds.splice(i + 1, 0, { kieu: ds[i].kieu === 'cdt' ? 'da' : ds[i].kieu === 'nda' ? 'dac' : ds[i].kieu, ten: '', ma_da: '', dia_diem: ds[i].dia_diem || '', g: 0, h: 0, j: 0, k: 0, ghi_chu: '' });
    if (a === 'xoa') ds.splice(i, 1);
    ve();
  });
  d.querySelector('#dmThem').onclick = () => { ds.push({ kieu: 'da', ten: '', ma_da: '', dia_diem: '', g: 0, h: 0, j: 0, k: 0, ghi_chu: '' }); ve(); d.querySelector('.tbl-wrap').scrollTop = 1e9; };
  d.querySelector('form').addEventListener('submit', async e => {
    if (e.submitter?.value !== 'ok') return;
    e.preventDefault();
    try {
      ds = ds.filter(x => (x.ten || '').trim());
      const loi = ds.filter(x => (x.kieu === 'da' || x.kieu === 'dac') && !String(x.ma_da || '').trim());
      if (loi.length && !await modal('Thiếu mã dự án', `<p>${loi.length} dự án chưa có mã nên sẽ không có số giải ngân. Vẫn lưu?</p>`, null, 'Vẫn lưu')) return;
      for (const x of ds) { x.ten = x.ten.trim(); if (x.ma_da) x.ma_da = String(x.ma_da).replace(/\s+/g, ''); }
      await q(sb.from('th_td_dm').upsert({ id: 1, dong: ds, cap_nhat_luc: new Date().toISOString(), cap_nhat_boi: S.me?.ho_ten || null }));
      if (new FormData(e.target).get('apKy')) { await q(sb.from('th_td_ky').update({ dm: ds }).eq('id', k.id)); delete TDS.cache[k.id]; }
      d.close(); toast('Đã lưu danh mục dự án trọng điểm.', 'ok'); viewTD(v);
    } catch (err) { fail(err); }
  });
}

// ---- Xuất Excel: Biểu 01 theo mẫu (+ sheet đối chiếu với kỳ trước nếu đang chọn)
async function xuatTD(dm, kq, k, dc) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Biểu 01', { pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
    views: [{ state: 'frozen', xSplit: 2, ySplit: 13 }] });
  const nam = k.ngay.slice(0, 4);
  const W = { A: 11.3, B: 57.8, C: 14.4, D: 25, E: 19.6, F: 18, G: 18, H: 16.4, I: 18, J: 16.4, K: 16.4, L: 16.4, M: 16.4, N: 16.4, O: 16.4, P: 16.4, Q: 16.4, R: 16.4, S: 16.4, T: 16.4, U: 16.4, V: 17.1, W: 15.9 };
  Object.entries(W).forEach(([c, w]) => ws.getColumn(c).width = w);
  const font = (o = {}) => ({ name: 'Times New Roman', size: 14, ...o });
  const vien = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  const NF = '_(* #,##0_);_(* \\(#,##0\\);_(* "-"??_);_(@_)';
  ws.getCell('A1').value = 'KHO BẠC NHÀ NƯỚC'; ws.getCell('A2').value = 'KHO BẠC NHÀ NƯỚC KHU VỰC VIII';
  ws.mergeCells('A1:C1'); ws.mergeCells('A2:C2');
  ['A1', 'A2'].forEach(a => { ws.getCell(a).font = font({ bold: a === 'A2' }); ws.getCell(a).alignment = { horizontal: 'center' }; });
  ws.getCell('A4').value = `BÁO CÁO TÌNH HÌNH, TIẾN ĐỘ THỰC HIỆN GIẢI NGÂN CÁC DỰ ÁN TRỌNG ĐIỂM TRÊN ĐỊA BÀN TỈNH TUYÊN QUANG NĂM ${nam}\n ĐẾN NGÀY ${TD.ngayVN(k.ngay)}`;
  ws.mergeCells('A4:W4'); ws.getCell('A4').font = font({ size: 18, bold: true }); ws.getCell('A4').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; ws.getRow(4).height = 54.6;
  ws.getCell('A5').value = TDS.dongVB; ws.mergeCells('A5:W5'); ws.getCell('A5').font = font({ italic: true }); ws.getCell('A5').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; ws.getRow(5).height = 36.75;
  ws.getCell('V6').value = 'đơn vị tính: Triệu đồng'; ws.mergeCells('V6:W6'); ws.getCell('V6').font = font({ italic: true }); ws.getCell('V6').alignment = { horizontal: 'center' };
  const H = {
    A7: 'STT', B7: 'TÊN CÔNG TRÌNH, DỰ ÁN, CHỦ ĐẦU TƯ', C7: 'Mã QHNS', D7: 'Địa điểm mở tài khoản', E7: 'Tổng số kế hoạch vốn', F7: 'Tổng kế hoạch vốn', L7: 'Tổng số giải ngân', M7: 'Giải ngân kế hoạch vốn',
    S7: 'Tỷ lệ thực hiện đạt so với tổng số kế hoạch vốn', T7: 'Tỷ lệ thực hiện đạt so với KHV kéo dài', U7: `Tỷ lệ thực hiện đạt so với KHV năm ${nam}`, V7: 'Số vốn còn lại chưa giải ngân', W7: 'Ghi chú',
    F8: `Tổng số kế hoạch vốn được phép kéo dài sang năm ${nam}`, G8: `Kế hoạch vốn được phép kéo dài sang năm ${nam}`, I8: `Tổng số kế hoạch vốn năm ${nam}`, J8: `Kế hoạch vốn năm ${nam}`,
    M8: `Tổng số giải ngân kế hoạch vốn được phép kéo dài sang năm ${nam}`, N8: `Kế hoạch vốn được phép kéo dài sang năm ${nam}`, P8: `Tổng giải ngân kế hoạch vốn năm ${nam}`, Q8: `Kế hoạch vốn năm ${nam}`,
    G10: 'NSTW', H10: 'NSĐP', J10: 'NSTW', K10: 'NSĐP', N10: 'NSTW', O10: 'NSĐP', Q10: 'NSTW', R10: 'NSĐP',
  };
  Object.entries(H).forEach(([a, t]) => ws.getCell(a).value = t);
  ['A7:A11', 'B7:B11', 'C7:C11', 'D7:D11', 'E7:E11', 'F7:K7', 'L7:L11', 'M7:R7', 'S7:S11', 'T7:T11', 'U7:U11', 'V7:V11', 'W7:W11', 'F8:F11', 'G8:H9', 'I8:I11', 'J8:K9',
    'M8:M11', 'N8:O9', 'P8:P11', 'Q8:R9', 'G10:G11', 'H10:H11', 'J10:J11', 'K10:K11', 'N10:N11', 'O10:O11', 'Q10:Q11', 'R10:R11'].forEach(m => ws.mergeCells(m));
  ['1', '2', '3', '4', '5=6+9', '6=7+8', 7, 8, '9=10+11', 10, 11, '12=13+16', '13=14+15', 14, 15, '16=17+18', 17, 18, '19=12/5', '20=13/6', '21=16/9', '22=5-12', 23].forEach((x, i) => ws.getRow(12).getCell(i + 1).value = x);
  [[7, 32.25], [8, 23.25], [9, 17.4], [10, 17.4], [11, 63.75], [12, 23.25]].forEach(([r, h]) => ws.getRow(r).height = h);
  for (let r = 7; r <= 12; r++) for (let c = 1; c <= 23; c++) {
    const cell = ws.getRow(r).getCell(c); cell.border = vien;
    cell.font = font({ bold: r < 12, italic: r === 10 || r === 12 }); cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }
  const ghi = (rn, stt, ten, ma, dd, x, gc, kieu) => {
    const row = ws.getRow(rn);
    row.getCell(1).value = /^\d+$/.test(stt) ? Number(stt) : stt; row.getCell(2).value = ten; row.getCell(3).value = ma ? (/^\d+$/.test(ma) ? Number(ma) : ma) : null; row.getCell(4).value = dd || null;
    TD.COT.forEach(c => {
      const cell = row.getCell(E.colIdx(c) + 1), val = x[c];
      if (TD.PCT.has(c)) { if (val !== null && Number.isFinite(val)) cell.value = val; cell.numFmt = '0%'; }
      else { cell.value = Math.round((val || 0) * 1e6) / 1e6; cell.numFmt = NF; }
    });
    row.getCell(23).value = gc || null;
    const dam = kieu === 'tong' || kieu === 'cdt' || kieu === 'nda';
    for (let c = 1; c <= 23; c++) {
      const cell = row.getCell(c); cell.border = vien; cell.font = font({ bold: dam });
      cell.alignment = { horizontal: c === 2 ? (dam ? 'left' : 'justify') : 'center', vertical: 'middle', wrapText: true };
      if (kieu === 'cdt') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
    }
    row.height = kieu === 'tong' || kieu === 'cdt' ? 30.75 : Math.max(36, Math.ceil(String(ten).length / 52) * 19);
  };
  ghi(13, '', 'TỔNG SỐ', '', '', kq.tong, '', 'tong');
  dm.forEach((d, i) => ghi(14 + i, kq.stt[i], d.ten, d.ma_da, d.dia_diem, kq.dong[i], d.ghi_chu, d.kieu));
  if (dc) {
    const { kqp, kp } = dc;
    const w2 = wb.addWorksheet(`Doi chieu ${TD.ngayVN(kp.ngay).replace(/\//g, '.')}`, { views: [{ state: 'frozen', xSplit: 3, ySplit: 2 }] });
    const n1 = TD.ngayVN(kp.ngay), n2 = TD.ngayVN(k.ngay);
    w2.addRow(['STT', 'Dự án / chủ đầu tư', 'Mã DA', 'Tổng số giải ngân', '', '', 'Giải ngân KHV kéo dài', '', '', `Giải ngân KHV năm ${nam}`, '', '', 'Tỷ lệ so với tổng KHV', '']);
    w2.addRow(['', '', '', n1, n2, 'Tăng thêm', n1, n2, 'Tăng thêm', n1, n2, 'Tăng thêm', n1, n2]);
    ['A1:A2', 'B1:B2', 'C1:C2', 'D1:F1', 'G1:I1', 'J1:L1', 'M1:N1'].forEach(m => w2.mergeCells(m));
    const g2 = (stt, ten, ma, x, y, dam) => {
      const r = w2.addRow([stt, ten, ma ? Number(ma) || ma : '', y.L, x.L, x.L - y.L, y.M, x.M, x.M - y.M, y.P, x.P, x.P - y.P, y.S ?? null, x.S ?? null]);
      if (dam) r.font = { bold: true };
    };
    g2('', 'TỔNG SỐ', '', kq.tong, kqp.tong, true);
    dm.forEach((d, i) => g2(kq.stt[i], d.ten, d.ma_da, kq.dong[i], kqp.dong[i], d.kieu === 'cdt' || d.kieu === 'nda'));
    [1, 2].forEach(r => { w2.getRow(r).font = { bold: true }; w2.getRow(r).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; });
    w2.getColumn(1).width = 7; w2.getColumn(2).width = 60; w2.getColumn(3).width = 11;
    for (let c = 4; c <= 12; c++) { w2.getColumn(c).width = 15; w2.getColumn(c).numFmt = '#,##0;[Red]-#,##0;"-"'; }
    for (const c of [13, 14]) { w2.getColumn(c).width = 11; w2.getColumn(c).numFmt = '0%'; }
  }
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = `Bieu 01 - DA trong diem ${TD.ngayVN(k.ngay).replace(/\//g, '.')}.xlsx`; a.click();
}
