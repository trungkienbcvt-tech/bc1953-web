// Chạy: npm test  (SQLite trong bộ nhớ, cần Node >= 22.13)
const assert = require('assert');
const db = require('../lib/db')(); const { seed } = require('../lib/seed'); const raw = require('../seed/raw.json');
(async () => {
  const codes = await seed(db, raw), ma = (t) => codes.find((c) => c.ten === t).ma;
  const L = require('../lib/logic'), X = require('../lib/export');
  const p20 = (await L.dangNhap('Phòng giao dịch 20', ma('Phòng giao dịch 20'))).token, nv = (await L.dangNhap('Cán bộ Nghiệp vụ 2', ma('Cán bộ Nghiệp vụ 2'))).token, th = (await L.dangNhap('Tổng hợp toàn tỉnh', ma('Tổng hợp toàn tỉnh'))).token;
  await assert.rejects(() => L.dangNhap('Phòng giao dịch 20', 'SAIMA1'), /Sai tài khoản/);
  let d = await L.layDuLieu(p20); const r0 = d.sheets[0].rows[0], lk0 = r0.v[1];
  assert(d.sheets[0].rows.every((r) => r.b && r.b.trim()), 'mọi dòng đều có tên chủ đầu tư');
  let s = await L.luu(p20, [{ id: 'b01', r: r0.r, c: 5, v: String(lk0 + 1000) }]); assert.strictEqual(s.ok, 1);
  const r1 = s.data.sheets[0].rows.find((r) => r.r === r0.r); assert.strictEqual(r1.v[4], r0.v[4] + 1000, 'trong tháng = lũy kế − tháng trước');
  s = await L.luu(p20, [{ id: 'b01', r: r0.r, c: 8, v: '5' }]); assert(s.loi.length, 'không cho nhập cột tự tính');
  await L.guiBaoCao(p20); await assert.rejects(() => L.luu(p20, [{ id: 'b01', r: r0.r, c: 5, v: '1' }]), /đã gửi/);
  await L.tiepNhan(nv, 'Phòng giao dịch 20'); await assert.rejects(() => L.tiepNhan(nv, 'Phòng giao dịch 20'), /Chỉ tiếp nhận/);
  await L.chuyenTra(nv, 'Phòng giao dịch 20', 'sai số'); await L.luu(p20, [{ id: 'b01', r: r0.r, c: 5, v: String(lk0 + 500) }]);
  await L.guiBaoCao(p20); await L.tiepNhan(nv, 'Phòng giao dịch 20'); let t = await L.nopTongHop(nv, ['Phòng giao dịch 20']); assert.strictEqual(t.ok, 1);
  for (const [f, a] of [[X.xuatBieu, [p20, 'B01', '2026-11-05', '', 'xlsx', '']], [X.xuatBieu, [p20, 'B02', '2026-11-05', '', 'pdf', '']], [X.xuatTong, [th, 'cdt', 'xlsx', '']], [X.xuatThongKe, [th, 'xlsx', '']]]) { const o = await f(...a); assert(o.b64.length > 500); }
  await L.chotKy(th); d = await L.layDuLieu(p20); const k1 = d.sheets[0].rows[0];
  assert.strictEqual(d.ky, '11/2026'); assert.strictEqual(k1.v[1], lk0 + 500, 'lũy kế chuyển sang kỳ mới'); assert.strictEqual(k1.v[4], 0, 'trong tháng kỳ mới = 0');
  console.log('Tất cả kiểm thử đạt.');
})().catch((e) => { console.error('KIỂM THỬ LỖI:', e); process.exit(1); });
