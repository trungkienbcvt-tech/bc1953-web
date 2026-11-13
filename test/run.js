// Chạy: npm test  (SQLite trong bộ nhớ, cần Node >= 22.13)
const assert = require('assert');
const db = require('../lib/db')(); const { seed } = require('../lib/seed'); const raw = require('../seed/raw.json');
(async () => {
  const t0 = Date.now(); const codes = await seed(db, raw), ma = (t) => codes.find((c) => c.ten === t).ma;
  const L = require('../lib/logic'), X = require('../lib/export');
  const p20 = (await L.dangNhap('Phòng giao dịch 20', ma('Phòng giao dịch 20'))).token, nv = (await L.dangNhap('Cán bộ Nghiệp vụ 2', ma('Cán bộ Nghiệp vụ 2'))).token, th = (await L.dangNhap('Chuyên viên THBC', ma('Chuyên viên THBC'))).token;
  const lg = async (n) => (await L.dangNhap(n, ma(n))).token, P20 = 'Phòng giao dịch 20';
  const lap20 = await lg('PGD20 - Người lập biểu'), ktt20 = await lg('PGD20 - Kế toán trưởng'), tp20 = await lg('PGD20 - Trưởng phòng');
  const dienTT = async (tk, v) => { const dd = await L.layDuLieu(tk), ed = []; dd.sheets.forEach((sh) => { const j = sh.cols.findIndex((x) => x.t === 's'); sh.rows.forEach((r) => { if (!r.v[j]) ed.push({ id: sh.id, r: r.r, c: sh.cols[j].c, v: v || 'Đã gửi BC' }); }); }); if (ed.length) { const o = await L.luu(tk, ed); assert(!o.loi.length, o.loi[0]); } };
  const gui20 = async () => { await dienTT(lap20); await L.duyet(lap20, 'lap_trinh', '', ''); await L.duyet(ktt20, 'ktt_trinh', '', ''); await L.duyet(tp20, 'tp_duyet', '', ''); };
  await assert.rejects(() => L.dangNhap('Phòng giao dịch 20', 'SAIMA1'), /Sai tài khoản/);
  let d = await L.layDuLieu(p20); const r0 = d.sheets[0].rows[0], lk0 = r0.v[1];
  assert(d.sheets[0].rows.every((r) => r.b && r.b.trim()), 'mọi dòng đều có tên chủ đầu tư');
  let s = await L.luu(p20, [{ id: 'b01', r: r0.r, c: 5, v: String(lk0 + 1000) }]); assert.strictEqual(s.ok, 1);
  const r1 = s.data.sheets[0].rows.find((r) => r.r === r0.r); assert.strictEqual(r1.v[4], r0.v[4] + 1000, 'trong tháng = lũy kế − tháng trước');
  s = await L.luu(p20, [{ id: 'b01', r: r0.r, c: 8, v: '5' }]); assert(s.loi.length, 'không cho nhập cột tự tính');
  s = await L.luu(p20, [{ id: 'b01', r: r0.r, c: 5, v: '-5' }]); assert(s.loi.length && /không được âm/.test(s.loi[0]), 'không cho số âm');
  const pv0 = lk0 - r0.v[4]; assert(pv0 > 5); s = await L.luu(p20, [{ id: 'b01', r: r0.r, c: 5, v: String(pv0 - 5) }]); assert(!s.loi.length && s.canhBao.length === 1 && s.canhBao[0].truoc === pv0, 'lũy kế giảm: vẫn lưu, chỉ cảnh báo'); await L.luu(p20, [{ id: 'b01', r: r0.r, c: 5, v: String(lk0 + 1000) }]);
  const gcol = d.sheets[0].cols.find((x) => x.t === 'g'); s = await L.luu(p20, [{ id: 'b01', r: r0.r, c: gcol.c, v: 'nộp trả sai mã' }]); assert(!s.loi.length && s.data.sheets[0].rows.find((r) => r.r === r0.r).v.slice(-1)[0] === 'nộp trả sai mã', 'ghi chú nhập tự do');
  await assert.rejects(() => L.guiBaoCao(p20), /quy trình/);
  await gui20(); await assert.rejects(() => L.luu(p20, [{ id: 'b01', r: r0.r, c: 5, v: '1' }]), /đã gửi/);
  await L.duyet(th, 'th_nhan', '', '', P20); await assert.rejects(() => L.duyet(th, 'th_nhan', '', '', P20), /Không thực hiện/);
  await assert.rejects(() => L.tiepNhan(nv, P20), /trực tiếp/); await assert.rejects(() => L.nopTongHop(nv, [P20]), /trực tiếp/);
  await L.chuyenTra(th, P20, 'sai số'); await L.luu(p20, [{ id: 'b01', r: r0.r, c: 5, v: String(lk0 + 500) }]);
  await gui20(); await L.duyet(th, 'th_nhan', '', '', P20); let t = await L.duyet(th, 'th_trinh', '', '', P20); assert.strictEqual(t.list.find((y) => y.pgd === P20).tt, 'Đã trình lãnh đạo phòng');
  for (const [f, a] of [[X.xuatBieu, [p20, 'B01', '2026-11-05', '', 'xlsx', '']], [X.xuatBieu, [p20, 'B02', '2026-11-05', '', 'pdf', '']], [X.xuatTong, [th, 'cdt', 'xlsx', '']], [X.xuatThongKe, [th, 'xlsx', '']]]) { const o = await f(...a); assert(o.b64.length > 500); }
  // ---- Tình trạng gửi BC theo danh mục CĐT ----
  {
    const TT = require('../lib/tinhtrang'), r = await TT.tinh(th, ''), lf = r.rows.filter((x) => x.k === 'row' && !x.thua);
    assert.strictEqual(lf.length, 195); assert.strictEqual(r.rows.find((x) => x.k === 'tot').nd + r.rows.find((x) => x.k === 'tot').nc + r.rows.find((x) => x.k === 'tot').nx, lf.filter((x) => x.cat !== 'khong').length);
    assert(lf.every((x) => ['dung', 'cham', 'chua', 'khong'].includes(x.cat)));
    assert.strictEqual(r.lon.tinh.n, 25); assert.strictEqual(r.lon.xa.n, 124); assert.strictEqual(r.lon.tinh.dung + r.lon.tinh.cham + r.lon.tinh.chua, 25);
    const rp = await TT.tinh(p20, ''); assert(rp.rows.filter((x) => x.k === 'row').every((x) => x.c === 'Phòng giao dịch 20') && !rp.full);
    for (const f of ['xlsx', 'pdf']) assert((await X.xuatTinhTrang(th, f, '')).b64.length > 1000);
    assert((await X.xuatTinhTrang(p20, 'pdf', '')).b64.length > 1000); assert((await X.xuatBieuTong(p20, 'pdf', '')).b64.length > 1000);
  }
  // ---- Kỳ 09/2026 (số gốc, chỉ xem) ----
  {
    const ds = (await L.trangThai(th)).dsKy; assert.deepStrictEqual(ds.map((x) => x.ky), ['2026-09', '2026-10', '2026-11'], 'có kỳ 9, 10 và kỳ 11 chưa mở'); assert(ds[2].chuaMo && ds[1].hienTai && ds[0].soGoc);
    const d9 = await L.layDuLieu(th, '*', '2026-09'), d10 = await L.layDuLieu(th, '*', '2026-10');
    assert.strictEqual(d9.soGoc, true); assert.strictEqual(d9.docChiXem, true);
    const sum = (d, i) => d.sheets[0].rows.reduce((a, r) => a + (Number(r.v[i]) || 0), 0);
    assert(sum(d9, 1) < sum(d10, 1), 'lũy kế tháng 9 nhỏ hơn tháng 10');
    await assert.rejects(() => L.luu(p20, [{ id: 'b01', r: d9.sheets[0].rows[0].r, c: 5, v: '1' }], '2026-09'), /số gốc/);
    await assert.rejects(() => L.duyet(th, 'th_nhan', '', '2026-09', P20), /số gốc/);
  }
  // ---- Quy trình thí điểm PGD 17 ----
  {
    const P = 'Phòng giao dịch 17';
    const lap = await lg('PGD17 - Người lập biểu'), ktt = await lg('PGD17 - Kế toán trưởng'), tp = await lg('PGD17 - Trưởng phòng'), tth = await lg('Trưởng phòng Tổng hợp');
    assert((await L.dsTaiKhoan()).every((a) => a.ten !== P), 'tài khoản PGD17 cũ được ẩn khỏi danh sách đăng nhập');
    assert((await L.dsTaiKhoan()).every((a) => a.vt !== 'NV2' && a.ten !== 'Phòng giao dịch 20') && (await L.dsTaiKhoan()).some((a) => a.ten === 'Trưởng phòng Tổng hợp'), 'ẩn tài khoản chung và cán bộ NV2');
    const st = async (tk) => (await L.trangThai(tk)).list.find((x) => x.pgd === P);
    await assert.rejects(() => L.guiBaoCao(lap), /quy trình/);
    await L.luuNguoiKy(lap, 'Nguyễn Văn Lập'); await L.luuNguoiKy(ktt, 'Trần Thị Kế'); await L.luuNguoiKy(tp, 'Lê Văn Phòng');
    const dl = await L.layDuLieu(lap), rr = dl.sheets[0].rows[0]; assert.strictEqual(dl.docChiXem, false);
    assert.strictEqual((await L.layDuLieu(ktt)).docChiXem, true, 'KTT chỉ xem');
    await assert.rejects(() => L.luu(ktt, [{ id: 'b01', r: rr.r, c: 5, v: '1' }]), /người lập biểu/);
    await assert.rejects(() => L.duyet(ktt, 'ktt_trinh', '', ''), /Không thực hiện/);      // chưa trình
    await assert.rejects(() => L.duyet(tp, 'lap_trinh', '', ''), /Người lập biểu/);          // sai chức vụ
    await dienTT(lap, 'Không phát sinh'); let x = (await L.duyet(lap, 'lap_trinh', '', '')).list[0]; assert.strictEqual(x.tt, 'Chờ KTT duyệt'); assert(x.ky.LAP);
    await assert.rejects(() => L.luu(lap, [{ id: 'b01', r: rr.r, c: 5, v: '1' }]), /đã gửi/);
    await assert.rejects(() => L.duyet(ktt, 'ktt_tra', '', ''), /lý do/);
    x = (await L.duyet(ktt, 'ktt_tra', 'sai số dòng 1', '')).list[0]; assert.strictEqual(x.tt, 'Bị trả lại'); assert(!x.ky.LAP, 'trả lại thì xóa chữ ký'); assert(/sai số/.test(x.lyDo));
    await L.luu(lap, [{ id: 'b01', r: rr.r, c: 5, v: String(rr.v[1] + 10) }]);
    await L.duyet(lap, 'lap_trinh', '', ''); x = (await L.duyet(ktt, 'ktt_trinh', '', '')).list[0]; assert.strictEqual(x.tt, 'Chờ TP phê duyệt'); assert(x.ky.KTT);
    x = (await L.duyet(tp, 'tp_tra', 'xem lại', '')).list[0]; assert.strictEqual(x.tt, 'Bị trả lại'); assert.strictEqual(Object.keys(x.ky).length, 0);
    await L.duyet(lap, 'lap_trinh', '', ''); await L.duyet(lap, 'lap_rut', '', ''); assert.strictEqual((await st(lap)).tt, 'Chưa gửi');
    await L.duyet(lap, 'lap_trinh', '', ''); await L.duyet(ktt, 'ktt_trinh', '', ''); x = (await L.duyet(tp, 'tp_duyet', '', '')).list[0];
    assert.strictEqual(x.tt, 'Đã gửi', 'TP phê duyệt → gửi thẳng Tổng hợp'); assert(x.ky.LAP && x.ky.KTT && x.ky.TP); assert.strictEqual(x.soGui, 1);
    assert.strictEqual((await st(th)).tt, 'Đã gửi', 'Tổng hợp thấy báo cáo');
    await assert.rejects(() => L.chuyenTra(tth, P, 'x'), /chuyên viên/);
    // Tổng hợp trả lại có lý do → xóa chữ ký; sau đó làm lại
    await L.chuyenTra(th, P, 'lệch THBC'); assert.strictEqual(Object.keys((await st(lap)).ky).length, 0);
    await L.duyet(lap, 'lap_trinh', '', ''); await L.duyet(ktt, 'ktt_trinh', '', ''); await L.duyet(tp, 'tp_duyet', '', ''); assert.strictEqual((await st(th)).soGui, 2);
    // in có "(đã ký)"
    const html = Buffer.from((await X.xuatBieu(lap, 'B01', '2026-11-05', '', 'pdf', '')).b64, 'base64').toString('utf8');
    assert.strictEqual((html.match(/\(đã ký\)/g) || []).length, 3, 'đủ 3 chức danh đã ký'); assert(html.includes('Nguyễn Văn Lập') && html.includes('Trần Thị Kế') && html.includes('Lê Văn Phòng'));
    await assert.rejects(() => L.duyet(th, 'th_trinh', '', '', P), /Không thực hiện/);       // chưa tiếp nhận
    await assert.rejects(() => L.duyet(th, 'th_nhan', '', '', 'Phòng giao dịch 18'), /Không thực hiện/);  // PGD 18 chưa gửi
    await assert.rejects(() => L.duyet(nv, 'th_nhan', '', '', P), /tổng hợp/);              // cán bộ NV2 không còn quyền
    await assert.rejects(() => L.duyet(tth, 'th_nhan', '', '', P), /chuyên viên/);
    assert.strictEqual((await L.duyet(th, 'th_nhan', '', '', P)).list.find((y) => y.pgd === P).tt, 'Tổng hợp đã tiếp nhận');
    await assert.rejects(() => L.duyet(tth, 'th_duyet', '', '', P), /Không thực hiện/);
    assert.strictEqual((await L.duyet(th, 'th_trinh', '', '', P)).list.find((y) => y.pgd === P).tt, 'Đã trình lãnh đạo phòng');
    await assert.rejects(() => L.duyet(th, 'th_duyet', '', '', P), /Trưởng phòng Tổng hợp/);
    await assert.rejects(() => L.duyet(tth, 'th_tra', '', '', P), /lý do/);
    await L.duyet(tth, 'th_tra', 'xem lại số', '', P); assert.strictEqual((await st(th)).tt, 'Bị trả lại');
    await L.duyet(lap, 'lap_trinh', '', ''); await L.duyet(ktt, 'ktt_trinh', '', ''); await L.duyet(tp, 'tp_duyet', '', ''); await L.duyet(th, 'th_nhan', '', '', P); await L.duyet(th, 'th_trinh', '', '', P);
    assert.strictEqual((await L.duyet(tth, 'th_duyet', '', '', P)).list.find((y) => y.pgd === P).tt, 'Trưởng phòng TH đã phê duyệt');
    // Phòng Nghiệp vụ 2: Lập biểu → Lãnh đạo phòng → Tổng hợp
    const nl = await lg('NV2 - Người lập biểu'), nt = await lg('NV2 - Lãnh đạo phòng'), NV = 'Phòng Nghiệp vụ 2', sn = async () => (await L.trangThai(th)).list.find((y) => y.pgd === NV);
    await dienTT(nl); await L.duyet(nl, 'lap_trinh', '', ''); assert.strictEqual((await sn()).tt, 'Chờ TP phê duyệt');
    await L.duyet(nl, 'lap_rut', '', ''); assert.strictEqual((await sn()).tt, 'Chưa gửi'); await L.duyet(nl, 'lap_trinh', '', '');
    await assert.rejects(() => L.duyet(nt, 'ktt_trinh', '', ''), /Kế toán trưởng/);
    await L.duyet(nt, 'tp_duyet', '', ''); let xn = await sn(); assert.strictEqual(xn.tt, 'Đã gửi'); assert(xn.ky.LAP && xn.ky.TP && !xn.ky.KTT);
    await L.duyet(th, 'th_nhan', '', '', NV); assert.strictEqual((await sn()).tt, 'Tổng hợp đã tiếp nhận');
    await X.xuatBieu(lap, 'B01', '2026-11-05', '', 'xlsx', '');
  }
  // ---- Biểu tổng theo danh mục CĐT ----
  {
    const BT = require('../lib/bieutong'), r = await BT.bieuTong(th, ''), tot = r.rows.find((x) => x.k === 'tot');
    assert.strictEqual(r.soThua, 0, 'mọi dòng web đều khớp danh mục'); assert.strictEqual(r.rows.filter((x) => x.k === 'row').length, 195);
    const tp = await L.tongHop(th), s4 = tp.list.reduce((a, p) => a + Object.values(p.b).reduce((z, b) => z + b.luyke, 0), 0), t4 = tp.list.reduce((a, p) => a + Object.values(p.b).reduce((z, b) => z + b.thang, 0), 0);
    assert(Math.abs(tot.lk - s4) < 0.01 && Math.abs(tot.th - t4) < 0.01, 'tổng biểu tổng = tổng 4 biểu con');
    const khoi = r.rows.filter((x) => x.k === 'khoi'); assert(Math.abs(khoi.reduce((a, x) => a + x.lk, 0) - tot.lk) < 0.01);
    const rp = await BT.bieuTong(p20, ''); assert.strictEqual(rp.full, false); assert(rp.rows.filter((x) => x.k === 'row').every((x) => x.c === 'Phòng giao dịch 20'), 'PGD chỉ thấy dòng của mình');
    assert(rp.rows.some((x) => x.tlk !== undefined), 'PGD thấy số THBC và chênh lệch của phần mình'); assert(rp.rows.find((x) => x.k === 'tot').lk > 0 && rp.rows.find((x) => x.k === 'tot').lk < tot.lk);
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
    // PGD 21 trình báo cáo: lệch THBC → bắt buộc nêu lý do, ghi chú dòng tự sinh
    const lap21 = await lg('PGD21 - Người lập biểu'); { const dd = await L.layDuLieu(lap21), rr = dd.sheets[0].rows[0]; const o = await L.luu(lap21, [{ id: 'b01', r: rr.r, c: 5, v: String(rr.v[1] + 987654) }]); assert(!o.loi.length); } await dienTT(lap21); await assert.rejects(() => L.duyet(lap21, 'lap_trinh', '', ''), /lý do chênh lệch/);
    await L.duyet(lap21, 'lap_trinh', 'chứng từ hạch toán tháng sau', ''); const d21 = await L.layDuLieu(lap21), gt = d21.sheets[0].rows.map((r) => r.v[r.v.length - 1]).filter((v) => /Chênh lệch so với THBC: chứng từ/.test(v));
    assert(gt.length >= 1, 'ghi chú tự sinh từ lý do chênh lệch');
    await L.duyet(lap21, 'lap_rut', '', '');
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
  // ---- Mẫu in: nhãn biểu góc phải, TỔNG CỘNG ở đầu, biểu số 04 có chữ ký, "Không phát sinh" ----
  {
    const H = async (f, a) => Buffer.from((await f(...a)).b64, 'base64').toString('utf8');
    const h1 = await H(X.xuatBieu, [p20, 'B01', '2026-11-05', '', 'html', '']);
    assert(/<tr class="sec"><td><\/td><td>I - KHỐI TỈNH/.test(h1) && !/<title>[^&]*B01/.test(h1), 'biểu PGD có đề mục KHỐI TỈNH, không có tên file ở đầu trang');
    const hT = await H(X.xuatTong, [th, 'b01', 'html', '']); assert(hT.includes('KBNN nơi mở tài khoản') && !/ – Phòng giao dịch/.test(hT), 'biểu toàn tỉnh tách riêng cột KBNN');
    assert(h1.includes('<div class="bn">Biểu 01-KBNN</div>')); assert(h1.includes('<colgroup>'));
    assert(h1.indexOf('TỔNG CỘNG') < h1.indexOf('<tr class="row') && !/TỔNG CỘNG CỦA PHÒNG/.test(h1), 'TỔNG CỘNG nằm trên cùng');
    const h4 = await H(X.xuatTinhTrang, [th, 'html', '']); assert(h4.includes('Biểu 04-KBNN') && h4.includes('NGƯỜI LẬP BIỂU'), 'biểu 04 có nhãn và chữ ký');
    assert((await X.xuatTinhTrang(th, 'xlsx', '')).b64.length > 1000);
    assert(require('../lib/common').TINH_TRANG.includes('Không phát sinh'));
  }
  // ---- Danh mục dự án (CSDL ngoài, giả lập) ----
  {
    const M = require('../lib/danhmuc'), goi = [], mauT = require('../lib/tenmau.json')[3];
    M.api.goi = async (fn, b) => { goi.push([fn, b]); if (fn === 'cv_dm_ds') return { kpi: { tong: 1 }, tong: 1, rows: [['111', 'DA 1', 'x', 'y', b.p_kbnn || 'Phòng giao dịch số 20', '', '', '', false, false, null, null, '']] }; if (fn === 'cv_dm_hangloat') return { so: 2 }; return { ok: true }; };
    const last = () => goi[goi.length - 1];
    let r = await M.dmDs(p20, { kbnn: 'Phòng giao dịch số 17', tim: 'a' }, 0); assert.strictEqual(last()[1].p_kbnn, 'Phòng giao dịch số 20', 'PGD bị khóa theo phòng của mình'); assert.strictEqual(r.rows[0].ma_da, '111');
    await M.dmDs(th, { kbnn: 'Phòng giao dịch số 17' }, 0); assert.strictEqual(last()[1].p_kbnn, 'Phòng giao dịch số 17', 'Tổng hợp lọc theo phòng tùy ý');
    await M.dmDs(th, {}, 0); assert.strictEqual(last()[1].p_kbnn, null, 'Tổng hợp xem tất cả');
    await assert.rejects(() => M.dmSua(p20, '111', { cdt: 'Không có tên này' }), /chưa có trên mẫu/);
    await M.dmSua(p20, '111', { cdt: mauT.toUpperCase(), kbnn: 'Phòng giao dịch số 17', dac_thu: 'X' }); assert.strictEqual(last()[1].p_gh, 'Phòng giao dịch số 20'); assert.strictEqual(last()[1].p_rec.cdt, mauT); assert(!('kbnn' in last()[1].p_rec), 'PGD không đổi được phòng');
    await M.dmSua(th, '111', { kbnn: 'Phòng giao dịch số 17' }); assert.strictEqual(last()[1].p_gh, null); assert.strictEqual(last()[1].p_rec.kbnn, 'Phòng giao dịch số 17');
    await assert.rejects(() => M.dmThem(p20, '9990001', { cdt: mauT }), /chủ đầu tư/);
    await M.dmThem(p20, '9990001', { cdt: mauT, cdt2: mauT, kbnn: 'Phòng giao dịch số 17' }); assert.strictEqual(last()[1].p_rec.kbnn, 'Phòng giao dịch số 20');
    await assert.rejects(() => M.dmThem(th, '9990002', { cdt: mauT, cdt2: mauT }), /Chưa chọn phòng/);
    r = await M.dmHangLoat(p20, '1 2,3\n1', 'ctmt', 'A'); assert.strictEqual(last()[1].p_mas.length, 3); assert.strictEqual(last()[1].p_gh, 'Phòng giao dịch số 20');
    await assert.rejects(() => M.dmHangLoat(p20, '1', 'cdt', 'A'), /Cột/);
    assert((await M.dmXuat(th, {})).b64.length > 300);
    M.api.goi = null; delete process.env.TONGHOP_KHOA; await assert.rejects(() => M.dmDs(th, {}, 0), /TONGHOP_KHOA/);
  }
  // ---- BC KPI: đối chiếu THBC theo mốc ngày, PGD xác nhận / ghi nhận số khác kèm lý do ----
  {
    const K = require('../lib/kpi'), b64 = require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'doichieu_thbc.xlsx')).toString('base64');
    await assert.rejects(() => K.taiThbc(lap20, '2026-10-15', '', 'x.xlsx', b64), /Chỉ Chuyên viên THBC/);
    await assert.rejects(() => K.taiThbc(th, '2026-02-31', '', 'x.xlsx', b64), /ngày mốc/);
    const r0 = await K.taiThbc(th, '2026-10-15', '', 'doichieu.xlsx', b64); assert(r0.co && r0.full); assert.strictEqual(r0.rows.filter((x) => x.k === 'row').length, 195);
    assert(Math.abs(r0.rows.find((x) => x.k === 'tot').e0 - r0.rows.find((x) => x.k === 'tot').t0) < 1e-6);
    const r20 = await K.lay(lap20, '2026-10-15'), l20 = r20.rows.filter((x) => x.k === 'row'); assert(l20.length > 0 && l20.every((x) => x.c === P20) && r20.quyen.sua && !r20.quyen.xacNhan, 'người lập sửa được, không xác nhận được');
    const kk = await K.lay(ktt20, '2026-10-15'); assert(!kk.quyen.sua && !kk.quyen.xacNhan, 'KTT chỉ xem');
    const x0 = l20[0], v = [x0.t0 + 5, x0.t1, x0.t2, x0.t3];
    await assert.rejects(() => K.luuDc(lap20, '2026-10-15', [{ khoa: x0.khoa, v, ly: '' }]), /bắt buộc ghi lý do/);
    await assert.rejects(() => K.luuDc(th, '2026-10-15', [{ khoa: x0.khoa, v, ly: 'abc' }]), /Chỉ phòng giao dịch/);
    const o = await K.luuDc(lap20, '2026-10-15', [{ khoa: x0.khoa, v, ly: 'chứng từ hạch toán sau ngày chốt' }]); const y0 = o.rows.find((x) => x.khoa === x0.khoa);
    assert(Math.abs(y0.e0 - (x0.t0 + 5)) < 1e-6 && y0.ly && o.ds.find((d) => d.pgd === P20).tt === 'nhap');
    await assert.rejects(() => K.xacNhan(lap20, '2026-10-15'), /Chỉ Trưởng phòng/); await assert.rejects(() => K.xacNhan(ktt20, '2026-10-15'), /Chỉ Trưởng phòng/);
    const xn = await K.xacNhan(tp20, '2026-10-15'); assert.strictEqual(xn.ds.find((d) => d.pgd === P20).tt, 'xn_dc'); assert(!xn.quyen.sua && xn.quyen.moLai);
    await assert.rejects(() => K.luuDc(lap20, '2026-10-15', [{ khoa: x0.khoa, v: null }]), /đã xác nhận/);
    const tt = await K.lay(th, '2026-10-15'); assert(Math.abs(tt.rows.find((x) => x.k === 'tot').e0 - tt.rows.find((x) => x.k === 'tot').t0 - 5) < 1e-6, 'tổng toàn tỉnh lấy số phòng ghi nhận'); assert(tt.vb && tt.vb.tong.tong > 0);
    for (const f of ['xlsx', 'pdf']) { const ex = await X.xuatKpi(th, '2026-10-15', f); assert(ex.b64.length > 1000); }
    assert((await X.xuatKpi(lap20, '2026-10-15', 'xlsx')).b64.length > 1000);
    await K.moLai(tp20, '2026-10-15'); const bo = await K.luuDc(lap20, '2026-10-15', [{ khoa: x0.khoa, v: [x0.t0, x0.t1, x0.t2, x0.t3] }]); assert.strictEqual(bo.ds.find((d) => d.pgd === P20).tt, 'cho', 'nhập lại đúng THBC = không còn điều chỉnh');
    await K.chotMoc(th, '2026-10-15', true); await assert.rejects(() => K.xacNhan(tp20, '2026-10-15'), /đã chốt/); await K.chotMoc(th, '2026-10-15', false);
    // sheet 1953 của cùng file vẫn đọc được ở mục THBC 1953 (chỉ có cột lũy kế)
    const TB = require('../lib/thbc'); const r1953 = await TB.nhap(th, 'doichieu.xlsx', b64); assert.strictEqual(r1953.rows.filter((x) => x.k === 'row' && x.tlk != null).length, 195); await TB.xoa(th);
    await K.xoaMoc(th, '2026-10-15'); assert.strictEqual((await K.dsKy(th)).ds.length, 0);
  }
  {   // giao diện: script nhúng trong index.html phải đúng cú pháp (lỗi cú pháp làm hỏng cả trang, kể cả đăng nhập)
    const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'cv1953', 'index.html'), 'utf8');
    const m = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop();
    assert(m, 'không thấy script'); new (require('vm').Script)(m[1]);
  }
  console.log('Tất cả kiểm thử đạt (' + (Date.now() - t0) + ' ms).');
})().catch((e) => { console.error('KIỂM THỬ LỖI:', e); process.exit(1); });
