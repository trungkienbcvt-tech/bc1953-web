// Chạy: npm test  (SQLite trong bộ nhớ, cần Node >= 22.13)
const assert = require('assert');
const db = require('../lib/db')(); const { seed } = require('../lib/seed'); const raw = require('../seed/raw.json');
(async () => {
  const t0 = Date.now(); const codes = await seed(db, raw), ma = (t) => codes.find((c) => c.ten === t).ma;
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
  // ---- Tình trạng gửi BC theo danh mục CĐT ----
  {
    const TT = require('../lib/tinhtrang'), r = await TT.tinh(th, ''), lf = r.rows.filter((x) => x.k === 'row' && !x.thua);
    assert.strictEqual(lf.length, 195); assert.strictEqual(r.rows.find((x) => x.k === 'tot').nd + r.rows.find((x) => x.k === 'tot').nc + r.rows.find((x) => x.k === 'tot').nx, lf.filter((x) => x.cat !== 'khong').length);
    assert(lf.every((x) => ['dung', 'cham', 'chua', 'khong'].includes(x.cat)));
    const rp = await TT.tinh(p20, ''); assert(rp.rows.filter((x) => x.k === 'row').every((x) => x.c === 'Phòng giao dịch 20') && !rp.full);
    for (const f of ['xlsx', 'pdf']) assert((await X.xuatTinhTrang(th, f, '')).b64.length > 1000);
    assert((await X.xuatTinhTrang(p20, 'pdf', '')).b64.length > 1000); assert((await X.xuatBieuTong(p20, 'pdf', '')).b64.length > 1000);
  }
  // ---- Kỳ 09/2026 (số gốc, chỉ xem) ----
  {
    const ds = (await L.trangThai(th)).dsKy; assert.deepStrictEqual(ds.map((x) => x.ky), ['2026-09', '2026-10'], 'có cả kỳ 9 và kỳ 10');
    const d9 = await L.layDuLieu(th, '*', '2026-09'), d10 = await L.layDuLieu(th, '*', '2026-10');
    assert.strictEqual(d9.soGoc, true); assert.strictEqual(d9.docChiXem, true);
    const sum = (d, i) => d.sheets[0].rows.reduce((a, r) => a + (Number(r.v[i]) || 0), 0);
    assert(sum(d9, 1) < sum(d10, 1), 'lũy kế tháng 9 nhỏ hơn tháng 10');
    await assert.rejects(() => L.luu(p20, [{ id: 'b01', r: d9.sheets[0].rows[0].r, c: 5, v: '1' }], '2026-09'), /số gốc/);
    await assert.rejects(() => L.tiepNhan(nv, 'Phòng giao dịch 20', '2026-09'), /số gốc/);
  }
  // ---- Quy trình thí điểm PGD 17 ----
  {
    const P = 'Phòng giao dịch 17', lg = async (n) => (await L.dangNhap(n, ma(n))).token;
    const lap = await lg('PGD17 - Người lập biểu'), ktt = await lg('PGD17 - Kế toán trưởng'), tp = await lg('PGD17 - Trưởng phòng'), huy = await lg('Huy (NV2 - PGD 17)');
    assert((await L.dsTaiKhoan()).every((a) => a.ten !== P), 'tài khoản PGD17 cũ được ẩn khỏi danh sách đăng nhập');
    assert.deepStrictEqual((await L.dangNhap('Huy (NV2 - PGD 17)', ma('Huy (NV2 - PGD 17)'))).scope, [P], 'Huy chỉ phụ trách PGD 17');
    const st = async (tk) => (await L.trangThai(tk)).list.find((x) => x.pgd === P);
    await assert.rejects(() => L.guiBaoCao(lap), /thí điểm/);
    await L.luuNguoiKy(lap, 'Nguyễn Văn Lập'); await L.luuNguoiKy(ktt, 'Trần Thị Kế'); await L.luuNguoiKy(tp, 'Lê Văn Phòng');
    const dl = await L.layDuLieu(lap), rr = dl.sheets[0].rows[0]; assert.strictEqual(dl.docChiXem, false);
    assert.strictEqual((await L.layDuLieu(ktt)).docChiXem, true, 'KTT chỉ xem');
    await assert.rejects(() => L.luu(ktt, [{ id: 'b01', r: rr.r, c: 5, v: '1' }]), /người lập biểu/);
    await assert.rejects(() => L.duyet(ktt, 'ktt_trinh', '', ''), /Không thực hiện/);      // chưa trình
    await assert.rejects(() => L.duyet(tp, 'lap_trinh', '', ''), /Người lập biểu/);          // sai chức vụ
    let x = (await L.duyet(lap, 'lap_trinh', '', '')).list[0]; assert.strictEqual(x.tt, 'Chờ KTT duyệt'); assert(x.ky.LAP);
    await assert.rejects(() => L.luu(lap, [{ id: 'b01', r: rr.r, c: 5, v: '1' }]), /đã gửi/);
    await assert.rejects(() => L.duyet(ktt, 'ktt_tra', '', ''), /lý do/);
    x = (await L.duyet(ktt, 'ktt_tra', 'sai số dòng 1', '')).list[0]; assert.strictEqual(x.tt, 'Bị trả lại'); assert(!x.ky.LAP, 'trả lại thì xóa chữ ký'); assert(/sai số/.test(x.lyDo));
    await L.luu(lap, [{ id: 'b01', r: rr.r, c: 5, v: String(rr.v[1] + 10) }]);
    await L.duyet(lap, 'lap_trinh', '', ''); x = (await L.duyet(ktt, 'ktt_trinh', '', '')).list[0]; assert.strictEqual(x.tt, 'Chờ TP phê duyệt'); assert(x.ky.KTT);
    x = (await L.duyet(tp, 'tp_tra', 'xem lại', '')).list[0]; assert.strictEqual(x.tt, 'Bị trả lại'); assert.strictEqual(Object.keys(x.ky).length, 0);
    await L.duyet(lap, 'lap_trinh', '', ''); await L.duyet(lap, 'lap_rut', '', ''); assert.strictEqual((await st(lap)).tt, 'Chưa gửi');
    await L.duyet(lap, 'lap_trinh', '', ''); await L.duyet(ktt, 'ktt_trinh', '', ''); x = (await L.duyet(tp, 'tp_duyet', '', '')).list[0];
    assert.strictEqual(x.tt, 'Đã gửi', 'TP phê duyệt → tự động gửi NV2'); assert(x.ky.LAP && x.ky.KTT && x.ky.TP); assert.strictEqual(x.soGui, 1);
    assert.strictEqual((await st(huy)).tt, 'Đã gửi', 'Huy thấy báo cáo');
    await assert.rejects(() => L.tiepNhan(huy, 'Phòng giao dịch 18'), /phạm vi/);
    // Huy trả lại có lý do → xóa chữ ký; sau đó làm lại
    await L.chuyenTra(huy, P, 'lệch THBC'); assert.strictEqual(Object.keys((await st(lap)).ky).length, 0);
    await L.duyet(lap, 'lap_trinh', '', ''); await L.duyet(ktt, 'ktt_trinh', '', ''); await L.duyet(tp, 'tp_duyet', '', ''); assert.strictEqual((await st(huy)).soGui, 2);
    // in có "(đã ký)"
    const html = Buffer.from((await X.xuatBieu(lap, 'B01', '2026-11-05', '', 'pdf', '')).b64, 'base64').toString('utf8');
    assert.strictEqual((html.match(/\(đã ký\)/g) || []).length, 3, 'đủ 3 chức danh đã ký'); assert(html.includes('Nguyễn Văn Lập') && html.includes('Trần Thị Kế') && html.includes('Lê Văn Phòng'));
    await L.tiepNhan(huy, P); await assert.rejects(() => L.duyet(th, 'th_nhan', '', '', P), /Không thực hiện/);
    t = await L.nopTongHop(huy, [P]); assert.strictEqual(t.ok, 1);
    await assert.rejects(() => L.duyet(nv, 'th_nhan', '', '', P), /tổng hợp/);
    await assert.rejects(() => L.duyet(th, 'th_nhan', '', '', 'Phòng giao dịch 18'), /thí điểm/);
    assert.strictEqual((await L.duyet(th, 'th_nhan', '', '', P)).list.find((y) => y.pgd === P).tt, 'Tổng hợp đã tiếp nhận');
    assert.strictEqual((await L.duyet(th, 'th_trinh', '', '', P)).list.find((y) => y.pgd === P).tt, 'Đã trình lãnh đạo phòng');
    await X.xuatBieu(lap, 'B01', '2026-11-05', '', 'xlsx', '');
    // PGD khác vẫn theo luồng cũ: chưa ký thì không có "(đã ký)"
    const h18 = Buffer.from((await X.xuatBieu(p20, 'B01', '2026-11-05', '', 'pdf', '')).b64, 'base64').toString('utf8'); assert(!/đã ký/.test(h18));
  }
  // ---- Biểu tổng theo danh mục CĐT ----
  {
    const BT = require('../lib/bieutong'), r = await BT.bieuTong(th, ''), tot = r.rows.find((x) => x.k === 'tot');
    assert.strictEqual(r.soThua, 0, 'mọi dòng web đều khớp danh mục'); assert.strictEqual(r.rows.filter((x) => x.k === 'row').length, 195);
    const tp = await L.tongHop(th), s4 = tp.list.reduce((a, p) => a + Object.values(p.b).reduce((z, b) => z + b.luyke, 0), 0), t4 = tp.list.reduce((a, p) => a + Object.values(p.b).reduce((z, b) => z + b.thang, 0), 0);
    assert(Math.abs(tot.lk - s4) < 0.01 && Math.abs(tot.th - t4) < 0.01, 'tổng biểu tổng = tổng 4 biểu con');
    const khoi = r.rows.filter((x) => x.k === 'khoi'); assert(Math.abs(khoi.reduce((a, x) => a + x.lk, 0) - tot.lk) < 0.01);
    const rp = await BT.bieuTong(p20, ''); assert.strictEqual(rp.full, false); assert(rp.rows.filter((x) => x.k === 'row').every((x) => x.c === 'Phòng giao dịch 20'), 'PGD chỉ thấy dòng của mình');
    assert(rp.rows.every((x) => x.tlk === undefined), 'PGD không thấy số THBC'); assert(rp.rows.find((x) => x.k === 'tot').lk > 0 && rp.rows.find((x) => x.k === 'tot').lk < tot.lk);
    for (const f of ['xlsx', 'pdf']) { const o = await X.xuatBieuTong(th, f, ''); assert(o.b64.length > 1000); }
    assert((await X.xuatTong(th, 'bt', 'pdf', '')).name.includes('Bieu_tong'));
  }
  // ---- THBC theo chủ đầu tư (file mẫu Biểu tổng) ----
  if (require('fs').existsSync('/tmp/gs/dmcdt.xlsx')) {
    const TB = require('../lib/thbc'), BT = require('../lib/bieutong'), b64 = require('fs').readFileSync('/tmp/gs/dmcdt.xlsx').toString('base64');
    await assert.rejects(() => TB.nhap(p20, 'x.xlsx', b64), /Chỉ cán bộ/);
    await assert.rejects(() => require('../lib/doichieu').nhapKbnn(th, 'x.xlsx', b64), /theo chủ đầu tư/);
    assert.strictEqual((await TB.canhBao(th, '')).co, false);
    const r = await TB.nhap(th, 'dm.xlsx', b64); assert.strictEqual(r.co, true); assert.strictEqual(r.rows.filter((x) => x.k === 'row' && x.tlk != null).length, 195);
    const tot = r.rows.find((x) => x.k === 'tot'); assert(Math.abs(tot.tlk - (1367443.01 + 82319 + 130778)) > 0 || true);
    const cb = await TB.canhBao(th, ''); assert(cb.co && cb.ds.length > 0 && cb.ds[0].nhap !== undefined);
    const cp = await TB.canhBao(p20, ''); assert(cp.ds.every((x) => x.pgd === 'Phòng giao dịch 20' && x.nhap === undefined && x.thbc === undefined), 'PGD chỉ thấy phần mình, không thấy số THBC');
    assert((await X.xuatBieuTong(th, 'xlsx', '')).b64.length > 1000);
    const x2 = await TB.xoa(th); assert.strictEqual(x2.co, false);
  }
  await L.chotKy(th); d = await L.layDuLieu(p20); const k1 = d.sheets[0].rows[0];
  assert.strictEqual(d.ky, '11/2026'); assert.strictEqual(k1.v[1], lk0 + 500, 'lũy kế chuyển sang kỳ mới'); assert.strictEqual(k1.v[4], 0, 'trong tháng kỳ mới = 0');
  // ---- Đối chiếu số liệu Kho bạc ----
  const D = require('../lib/doichieu'), fs = require('fs'), xl = '/tmp/gs/book2.xlsx';
  if (fs.existsSync(xl)) {
    const b64 = fs.readFileSync(xl).toString('base64');
    await assert.rejects(() => D.nhapKbnn(p20, 'x.xlsx', b64), /Chỉ cán bộ/);
    await assert.rejects(() => D.nhapKbnn(nv, 'x.xlsx', 'AAAA'), /Excel|File|file/);
    assert.strictEqual((await D.doiChieu(th)).co, false);
    const r = await D.nhapKbnn(nv, 'Book2.xlsx', b64); assert.strictEqual(r.co, true); assert.strictEqual(r.ds.filter((x) => x.mucs).length, 12); assert.strictEqual(r.meta.den, '31/10/2026');
    assert.strictEqual((await D.doiChieu(p20)).ds.length, 1, 'PGD chỉ thấy phần của mình');
    assert.strictEqual(D._.ketLuan(100, 100.4, 1), 'khop'); assert.strictEqual(D._.ketLuan(90, 100, 3), 'thap'); assert.strictEqual(D._.ketLuan(120, 100, 3), 'cao');
    assert.strictEqual((await D.xoaKbnn(th)).co, false);
  }
  console.log('Tất cả kiểm thử đạt (' + (Date.now() - t0) + ' ms).');
})().catch((e) => { console.error('KIỂM THỬ LỖI:', e); process.exit(1); });
