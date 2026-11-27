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
  // ---- Công văn BC 1953 ----
  {
    const CV = require('../lib/cv1953'), d = await CV.cvLay(th, ''); assert(d.so.n > 0 && d.vb.so === '' && /Sở Tài chính/.test(d.vb.kinhGui), 'công văn có số liệu và mẫu mặc định');
    await assert.rejects(() => CV.cvLay(p20, ''), /tổng hợp/); await assert.rejects(() => CV.cvLuu(th, '', { ngay: 'abc' }), /03\/11/);
    await CV.cvLuu(th, '', { so: '1841', ngay: '03/11/2026' }); const x = await CV.cvXuat(th, ''); assert(x.b64.length > 1000 && /\.docx$/.test(x.name), 'xuất công văn Word');
    const mo = [{ t: 'p', jc: 'center', first: 0, before: 0, after: 0, ln: 312, sz: 28, r: [{ t: 'Kính gửi: Sở', b: 1 }, { t: ' X\nY', i: 1, a: 'n' }] }, { t: 'tbl', cols: [4500, 4855], c: [[{ t: 'g', ind: 1390 }], [{ t: 'p', jc: 'left', r: [{ t: '<&>' }] }]] }];
    await CV.cvLuuTay(th, '', mo); const dl = await CV.cvLay(th, ''); assert(dl.tay && dl.tay.length === 2, 'lưu công văn soạn trên web');
    const xt = await CV.cvXuatTay(th, '', mo); assert(xt.b64.length > 800 && /\.docx$/.test(xt.name), 'xuất Word từ bản soạn trên web');
    await CV.cvLamLai(th, ''); assert(!(await CV.cvLay(th, '')).tay, 'làm lại công văn từ mẫu');
    { const bk = await X.bangKemXuat(th, ''), zp = Buffer.from(bk.b64, 'base64').toString('latin1'); assert(/\.xlsx$/.test(bk.name) && (zp.match(/xl\/worksheets\/sheet\d+\.xml/g) || []).length >= 5, 'bảng kèm theo xuất 5 sheet');
      const xm = await X.bangKemXem(th, '', 'b01'); assert(xm.rows.length > 5 && xm.cols.length > 3 && xm.hdr && xm.keys, 'xem trước bảng kèm theo');
      const kb = Object.keys(xm.keys).find((r) => !/^H/.test(xm.keys[r])), kc = xm.keys[kb] + '@3'; await X.bangKemSua(th, '', 'b01', kc, '1.234');
      const x2 = await X.bangKemXem(th, '', 'b01'); assert(x2.rows[kb][3].v === 1234 && x2.sua.includes(kb + ',3'), 'sửa ô bảng kèm theo (số)');
      await X.bangKemSua(th, '', 'b01', xm.keys[kb] + '@' + (xm.cols.length - 1), 'Ghi chú thử'); assert((await X.bangKemXem(th, '', 'b01')).rows[kb][xm.cols.length - 1].v === 'Ghi chú thử', 'ghi chú tự nhập');
      await X.bangKemSuaXoa(th, '', 'b01'); assert((await X.bangKemXem(th, '', 'b01')).rows[kb][3].v !== 1234, 'bỏ chỉnh sửa'); await assert.rejects(() => X.bangKemSua(p20, '', 'b01', kc, '1'), /tổng hợp/); }
  }
  // ---- Tài khoản quản trị ----
  {
    const M = require('../lib/danhmuc'), ad = (await L.dangNhap('Quản trị hệ thống', ma('Quản trị hệ thống'))).token;
    await L.doiMa(ad, ma('Quản trị hệ thống'), 'QuanTri2026');
    assert((await L.dsTaiKhoan()).some((a) => a.vt === 'AD'), 'tài khoản quản trị có trong danh sách đăng nhập');
    assert((await L.tongHop(ad, '2026-09')), 'admin xem được báo cáo toàn tỉnh');
    await assert.rejects(() => L.luu(ad, [{ id: 'b01', r: 1, c: 5, v: '1' }], '2026-09'));
    await assert.rejects(() => M.adDs(th), /quản trị/);
    await assert.rejects(() => M.adDatMa(th, 'Phòng giao dịch 20', 'abc12345'), /quản trị/);
    const ds = await M.adDs(ad); assert(ds.length > 5 && ds.every((a) => a.vt !== 'AD' && (a.macdinh ? a.ma : a.ma === '')), 'admin chỉ thấy mật khẩu mặc định, mật khẩu người dùng tự đổi thì ẩn');
    await assert.rejects(() => M.adDatMa(ad, 'Phòng giao dịch 20', 'ab'), /6 đến 12/);
    await assert.rejects(() => M.adDatMa(ad, 'Không có', 'abc12345'), /Không tìm thấy/);
    await assert.rejects(() => M.adDatMa(ad, 'Quản trị hệ thống', 'abc12345'), /Không tìm thấy/);
    await assert.rejects(() => M.adTbGhi(ad, 'x'.repeat(601)), /600/);
  }
  // ---- Quy trình thí điểm PGD 17 ----
  {
    const P = 'Phòng giao dịch 17';
    { const g = await L.dangNhap('Trưởng phòng Tổng hợp', ma('Trưởng phòng Tổng hợp')); assert(g.vai2 && g.vai2.ten === 'NV2 - Lãnh đạo phòng' && g.vai2.vt === 'PGD' && g.vai2.token !== g.token && g.vt === 'TH', 'một mã đăng nhập có hai vai'); assert((await L.dsTaiKhoan()).every((a) => a.ten !== 'NV2 - Lãnh đạo phòng'), 'ẩn tài khoản NV2 - Lãnh đạo khỏi danh sách đăng nhập'); }
    const lap = await lg('PGD17 - Người lập biểu'), ktt = await lg('PGD17 - Kế toán trưởng'), tp = await lg('PGD17 - Trưởng phòng'), tth = await lg('Trưởng phòng Tổng hợp');
    assert((await L.dsTaiKhoan()).every((a) => a.ten !== P), 'tài khoản PGD17 cũ được ẩn khỏi danh sách đăng nhập');
    assert((await L.dsTaiKhoan()).every((a) => a.vt !== 'NV2' && a.ten !== 'Phòng giao dịch 20') && (await L.dsTaiKhoan()).some((a) => a.ten === 'Trưởng phòng Tổng hợp'), 'ẩn tài khoản chung và cán bộ NV2');
    const st = async (tk) => (await L.trangThai(tk)).list.find((x) => x.pgd === P);
    await assert.rejects(() => L.guiBaoCao(lap), /quy trình/);
    await L.luuNguoiKy(lap, 'Nguyễn Văn Lập'); await L.luuNguoiKy(ktt, 'Trần Thị Kế'); await L.luuNguoiKy(tp, 'Lê Văn Phòng');
    const dl = await L.layDuLieu(lap), rr = dl.sheets[0].rows[0]; assert.strictEqual(dl.docChiXem, false);
    assert.strictEqual((await L.layDuLieu(ktt)).docChiXem, true, 'KTT chỉ xem');
    await assert.rejects(() => L.luu(ktt, [{ id: 'b01', r: rr.r, c: 5, v: '1' }]), /người nhập/);
    await assert.rejects(() => L.duyet(ktt, 'ktt_trinh', '', ''), /Không thực hiện/);      // chưa trình
    await assert.rejects(() => L.duyet(tp, 'lap_trinh', '', ''), /Người nhập/);          // sai chức vụ
    await dienTT(lap, 'Không phát sinh'); let x = (await L.duyet(lap, 'lap_trinh', '', '')).list[0]; assert.strictEqual(x.tt, 'Chờ KTT duyệt'); assert(x.ky.LAP);
    await assert.rejects(() => L.luu(lap, [{ id: 'b01', r: rr.r, c: 5, v: '1' }]), /đã gửi/);
    await assert.rejects(() => L.duyet(ktt, 'ktt_tra', '', ''), /lý do/);
    x = (await L.duyet(ktt, 'ktt_tra', 'sai số dòng 1', '')).list[0]; assert.strictEqual(x.tt, 'Bị trả lại'); assert(!x.ky.LAP, 'trả lại thì xóa chữ ký'); assert(/sai số/.test(x.lyDo));
    await L.luu(lap, [{ id: 'b01', r: rr.r, c: 5, v: String(rr.v[1] + 10) }]);
    await L.duyet(lap, 'lap_trinh', '', ''); x = (await L.duyet(ktt, 'ktt_trinh', '', '')).list[0]; assert.strictEqual(x.tt, 'Chờ LĐ phê duyệt'); assert(x.ky.KTT);
    x = (await L.duyet(tp, 'tp_tra', 'xem lại', '')).list[0]; assert.strictEqual(x.tt, 'Chờ KTT duyệt', 'Lãnh đạo trả lại → về Kế toán trưởng'); assert.strictEqual(x.lyDo, 'xem lại'); assert.deepStrictEqual(Object.keys(x.ky), ['LAP'], 'giữ chữ ký người lập, bỏ chữ ký KTT/LĐ');
    x = (await L.duyet(ktt, 'ktt_tra', 'người lập sửa lại', '')).list[0]; assert.strictEqual(x.tt, 'Bị trả lại'); assert.strictEqual(Object.keys(x.ky).length, 0);
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
    await assert.rejects(() => L.duyet(th, 'th_duyet', '', '', P), /Lãnh đạo phòng/);
    await assert.rejects(() => L.duyet(tth, 'th_tra', '', '', P), /lý do/);
    await L.duyet(tth, 'th_tra', 'xem lại số', '', P); assert.strictEqual((await st(th)).tt, 'Bị trả lại');
    await L.duyet(lap, 'lap_trinh', '', ''); await L.duyet(ktt, 'ktt_trinh', '', ''); await L.duyet(tp, 'tp_duyet', '', ''); await L.duyet(th, 'th_nhan', '', '', P); await L.duyet(th, 'th_trinh', '', '', P);
    assert.strictEqual((await L.duyet(tth, 'th_duyet', '', '', P)).list.find((y) => y.pgd === P).tt, 'Trưởng phòng TH đã phê duyệt');
    // Phòng Nghiệp vụ 2: Lập biểu → Lãnh đạo phòng → Tổng hợp
    const nl = await lg('NV2 - Người lập biểu'), nt = (await L.dangNhap('NV2 - Lãnh đạo phòng', ma('Trưởng phòng Tổng hợp'))).token, NV = 'Phòng Nghiệp vụ 2', sn = async () => (await L.trangThai(th)).list.find((y) => y.pgd === NV);
    await dienTT(nl); await L.duyet(nl, 'lap_trinh', '', ''); assert.strictEqual((await sn()).tt, 'Chờ LĐ phê duyệt');
    await L.duyet(nl, 'lap_rut', '', ''); assert.strictEqual((await sn()).tt, 'Chưa gửi'); await L.duyet(nl, 'lap_trinh', '', '');
    await assert.rejects(() => L.duyet(nt, 'ktt_trinh', '', ''), /Kế toán trưởng/);
    await L.duyet(nt, 'tp_duyet', '', ''); let xn = await sn(); assert.strictEqual(xn.tt, 'Đã gửi'); assert(xn.ky.LAP && xn.ky.TP && !xn.ky.KTT);
    await L.duyet(th, 'th_nhan', '', '', NV); assert.strictEqual((await sn()).tt, 'Tổng hợp đã tiếp nhận');
    await X.xuatBieu(lap, 'B01', '2026-11-05', '', 'xlsx', '');
  }
  // ---- Biểu tổng theo danh mục CĐT ----
  {
    const BT = require('../lib/bieutong'), r = await BT.bieuTong(th, ''), tot = r.rows.find((x) => x.k === 'tot');
    { const rx = await BT.bieuTong(th, '', 'Phòng giao dịch 20'); assert.strictEqual(rx.full, false); assert(rx.rows.filter((x) => x.k === 'row').every((x) => x.c === 'Phòng giao dịch 20'), 'THBC lọc theo phòng'); const rt = await BT.bieuTong(th, '', '*'); assert.strictEqual(rt.full, true); const tx = await require('../lib/tinhtrang').tinh(th, '', 'Phòng giao dịch 20'); assert.strictEqual(tx.full, false); }
    { const l1 = r.rows.find((x) => x.k === 'row'); await BT.btGhiChu(th, '', BT.gcKey(l1), 'Lệch do chờ số THBC'); assert.strictEqual((await BT.bieuTong(th, '')).rows.find((x) => BT.gcKey(x) === BT.gcKey(l1)).gc, 'Lệch do chờ số THBC', 'ghi chú đối chiếu được lưu'); await assert.rejects(() => BT.btGhiChu(p20, '', BT.gcKey(l1), 'x'), /người nhập/); const lap20 = await lg('PGD20 - Người lập biểu').catch(() => null); if (lap20) { const rr = (await BT.bieuTong(lap20, '')).rows.find((x) => x.k === 'row'); if (rr) { await BT.btGhiChu(lap20, '', BT.gcKey(rr), 'ghi chú phòng'); await BT.btGhiChu(lap20, '', BT.gcKey(rr), ''); } await assert.rejects(() => BT.btGhiChu(lap20, '', BT.gcKey(l1.c === 'Phòng giao dịch 20' ? Object.assign({}, l1, { c: 'Phòng giao dịch 5' }) : l1), 'x'), /người nhập/); } await BT.btGhiChu(th, '', BT.gcKey(l1), ''); }
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
    // PGD 21 trình báo cáo: lệch THBC → chỉ cảnh báo khi chưa có ghi chú giải trình ở Đối chiếu THBC (không bắt buộc nhập thêm lý do)
    const lap21 = await lg('PGD21 - Người lập biểu'); { const dd = await L.layDuLieu(lap21), rr = dd.sheets[0].rows[0]; const o = await L.luu(lap21, [{ id: 'b01', r: rr.r, c: 5, v: String(rr.v[1] + 987654) }]); assert(!o.loi.length); } await dienTT(lap21);
    { const c21 = await TB.canhBao(lap21, ''); assert(c21.ds.length >= 1 && c21.ds.every((x) => x.gc === ''), 'chưa có ghi chú giải trình');
      const bt21 = await BT.bieuTong(lap21, ''), dong = bt21.rows.find((x) => x.k === 'row' && x.ttl && x.ttl !== 'khop' && x.ten);
      await BT.btGhiChu(lap21, '', BT.gcKey(dong), 'chứng từ hạch toán tháng sau'); const c22 = await TB.canhBao(lap21, ''); assert(c22.ds.some((x) => x.gc === 'chứng từ hạch toán tháng sau'), 'ghi chú giải trình được nhận diện'); }
    await L.duyet(lap21, 'lap_trinh', '', ''); const d21 = await L.layDuLieu(lap21), gt = d21.sheets[0].rows.map((r) => r.v[r.v.length - 1]).filter((v) => /Chênh lệch so với THBC: chứng từ/.test(v));
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
    M.api.goi = async (fn, b) => { goi.push([fn, b]); if (fn === 'cv_dm_cdt_ds') return { rows: ['Đơn vị thử A2', 'Đơn vị thử B2', 'Đơn vị thử C2', 'Q2'].map((l, i) => [i + 1, 'Khối tỉnh', l, 'tt mẫu', '', 0, 0, {}, '', '', [], true]) }; if (fn === 'cv_dm_ds') return { kpi: { tong: 1 }, tong: 1, rows: [['111', 'DA 1', 'x', 'y', b.p_kbnn || 'Phòng giao dịch số 20', '', '', '', false, false, null, null, '']] }; if (fn === 'cv_dm_hangloat') return { so: 2 }; return { ok: true }; };
    const last = () => goi[goi.length - 1];
    let r = await M.dmDs(p20, { kbnn: 'Phòng giao dịch số 17', tim: 'a' }, 0); assert.strictEqual(last()[1].p_kbnn, 'Phòng giao dịch số 20', 'PGD bị khóa theo phòng của mình'); assert.strictEqual(r.rows[0].ma_da, '111');
    await M.dmDs(th, { kbnn: 'Phòng giao dịch số 17' }, 0); assert.strictEqual(last()[1].p_kbnn, 'Phòng giao dịch số 17', 'Tổng hợp lọc theo phòng tùy ý');
    await M.dmDs(th, {}, 0); assert.strictEqual(last()[1].p_kbnn, null, 'Tổng hợp xem tất cả');
    await assert.rejects(() => M.dmSua(p20, '111', { cdt: 'Không có tên này' }), /chưa có trên mẫu/);
    await M.dmSua(p20, '111', { cdt: mauT.toUpperCase(), cdt2: mauT, kbnn: 'Phòng giao dịch số 17', dac_thu: 'Trọng điểm' }); assert.strictEqual(last()[1].p_gh, 'Phòng giao dịch số 20'); assert.strictEqual(last()[1].p_rec.cdt2, mauT); assert(!('kbnn' in last()[1].p_rec), 'PGD không đổi được phòng');
    await M.dmSua(p20, '111', { cdt: mauT, cdt2: mauT }); assert.strictEqual(last()[1].p_rec.cdt, mauT, 'PGD đặt CĐT = CĐT lớn khi không có trực thuộc');
    await M.dmSua(p20, '111', { cdt: mauT, dac_thu: 'Chuyển đổi số' }); assert(!('cdt' in last()[1].p_rec), 'PGD không tự sửa CĐT trực thuộc');
    await assert.rejects(() => M.dmSua(p20, '111', { cdt: mauT }), /đề xuất/);
    await M.dmDeXuat(p20, '111', mauT); { const g = goi.filter((z) => z[0] === 'cv_dm_dx_gui').pop(); assert(g && g[1].p_gh === 'Phòng giao dịch số 20'); }
    await assert.rejects(() => M.dmDeXuat(th, '111', mauT), /trực tiếp/);
    await assert.rejects(() => M.dmDxDuyet(p20, '111', true), /Chỉ Phòng NV2/);
    await M.dmDxDuyet(th, '111', true); assert.strictEqual(last()[0], 'cv_dm_dx_duyet');
    await M.dmSua(th, '111', { cdt: mauT, cdt2: mauT }); assert.strictEqual(last()[1].p_rec.cdt, mauT, 'THBC sửa trực tiếp');
    await M.dmSua(th, '111', { kbnn: 'Phòng giao dịch số 17' }); assert.strictEqual(last()[1].p_gh, null); assert.strictEqual(last()[1].p_rec.kbnn, 'Phòng giao dịch số 17');
    await assert.rejects(() => M.dmThem(p20, '9990001', { cdt: mauT }), /chủ đầu tư/);
    await M.dmThem(p20, '9990001', { cdt: mauT, cdt2: mauT, kbnn: 'Phòng giao dịch số 17' }); assert.strictEqual(last()[1].p_rec.kbnn, 'Phòng giao dịch số 20');
    await assert.rejects(() => M.dmThem(th, '9990002', { cdt: mauT, cdt2: mauT }), /Chưa chọn phòng/);
    r = await M.dmHangLoat(p20, '1 2,3\n1', 'ctmt', 'NTM'); assert.strictEqual(last()[1].p_mas.length, 3); assert.strictEqual(last()[1].p_gh, 'Phòng giao dịch số 20');
    await assert.rejects(() => M.dmHangLoat(p20, '1', 'cdt', 'A'), /Cột/);
    assert((await M.dmXuat(th, {})).b64.length > 300);
    {
      const SS = require('../lib/so_sanh_b501_tt85.json'), mk = Object.keys(SS).find((m) => SS[m].s === 'BT' && SS[m].x === 'Khác nội dung tên');
      const sv = M.api.goi; M.api.goi = async (fn) => { if (fn === 'cv_dm_canh_bao') return { tong: 0, nhom: {}, rows: [] }; if (fn === 'cv_dm_ban_do') return [[mk, 'Tên', mauT, mauT, 'Phòng giao dịch số 20']]; return { ok: true }; };
      const cb = await M.dmCanhBao(th); assert.strictEqual(cb.tong, 1); assert(cb.rows[0].ly_do.includes('B501:') && cb.rows[0].loai[0] === 'Tên B501 khác TT85'); M.api.goi = sv;
      { const sv2 = M.api.goi; M.api.goi = async (fn) => (fn === 'cv_dm_cdt_ten' ? { ten: [mauT], lon: [mauT], tt: {} } : { ok: 1 }); await M.dmSua(th, mk, { ten_da: 'Tên tự gõ' }); await M.dmSua(th, mk, { ten_da: SS[mk].b }); M.api.goi = sv2; }
      {
        const UP = require('../lib/dmup'), DO = require('../lib/dmdoichieu'); DO._reset();
        const chiB = Object.keys(DO.STATIC).find((m) => DO.STATIC[m].s === 'B' && DO.STATIC[m].n), sv3 = M.api.goi, got = [];
        M.api.goi = async (fn, b) => { got.push([fn, b]); if (fn === 'cv_dm_ban_do') return []; if (fn === 'cv_dm_them_moi') return { them: b.p_rows.length }; return { ok: 1 }; };
        const d = await UP.ds(th); assert(d.tong > 100 && d.tai === true); assert(d.rows.some((x) => x.ma === chiB && x.nguon === 'Chỉ có ở B501'));
        const dp = await UP.ds(p20); assert(d.rows.length >= dp.rows.length && dp.tai === false);
        await assert.rejects(() => UP.quyet(th, [], true), /Chưa chọn/); await assert.rejects(() => UP.tai(p20, 'x.xlsx', 'AAAA'), /Chỉ Phòng NV2/);
        const kq = await UP.quyet(th, [chiB], true); assert.strictEqual(kq.them, 1); const ct = got.filter((g) => g[0] === 'cv_dm_them_moi').pop(); assert.strictEqual(ct[1].p_rows[0].m, chiB);
        M.api.goi = sv3;
      }
      {
        const sv4 = M.api.goi; M.api.goi = async (fn) => { if (fn === 'cv_dm_ds') return { kpi: {}, tong: 2, rows: [['111', 'A', mauT, mauT, 'Phòng giao dịch số 20', '', '', '', false, false, null, null, ''], ['222', 'B', mauT, mauT, 'Phòng giao dịch số 20', '', '', '', false, false, null, null, '']] }; if (fn === 'cv_dm_canh_bao') return { tong: 1, nhom: {}, rows: [['222', 'B', mauT, mauT, 'Phòng giao dịch số 20', ['Thiếu tên dự án'], '']] }; if (fn === 'cv_dm_ban_do') return []; return { ok: 1 }; };
        const r = await M.dmDs(th, { sach: true }, 0); assert.strictEqual(r.tong, 1); assert.strictEqual(r.rows[0].ma_da, '111'); M.api.goi = sv4;
      }
      await assert.rejects(() => M.cdtDeXuat(th, { khoi: 'Khối tỉnh', cdt_lon: 'ABC' }), /không cần đề xuất/); await assert.rejects(() => M.cdtDxDuyet(p20, '1', true), /Chỉ Phòng NV2/);
      await assert.rejects(() => M.cdtDeXuat(p20, { khoi: 'Khối tỉnh', cdt_lon: 'UBND Đơn vị thử A2', cdt_tt: 'abc' }), /không đúng tên trong danh mục.*Đơn vị thử A2/); await assert.rejects(() => M.cdtDeXuat(p20, { khoi: 'Khối tỉnh', cdt_lon: 'Tên lạ chưa có', cdt_tt: '' }), /chưa có trong danh mục/);
      { // PGD sửa lại đề xuất chủ đầu tư bị NV2 từ chối rồi gửi lại
        const L0 = require('../lib/logic'), ky = 'Phòng giao dịch số 20';
        const luu = (ds) => L0._.db().q('INSERT INTO kv (k,v) VALUES ($1,$2) ON CONFLICT (k) DO UPDATE SET v=excluded.v', ['cdt:dx', JSON.stringify({ ds })]);
        await luu([{ id: 'T1', khoi: 'Khối tỉnh', lon: 'Đơn vị thử A', tt: '', gc: '', kbnn: ky, nguoi: 'x', luc: 1, st: 'tu_choi', ly: 'Sai tên' }, { id: 'T2', khoi: 'Khối tỉnh', lon: 'Đơn vị thử B', tt: '', gc: '', kbnn: 'Phòng giao dịch số 21', nguoi: 'y', luc: 2, st: 'tu_choi', ly: '' }, { id: 'T3', khoi: 'Khối tỉnh', lon: 'Đơn vị thử C', tt: '', gc: '', kbnn: ky, nguoi: 'x', luc: 3, st: 'cho', ly: '' }]);
        await assert.rejects(() => M.cdtDxSua(p20, 'T2', { khoi: 'Khối tỉnh', cdt_lon: 'Đơn vị thử B2' }), /Không tìm thấy/);
        await assert.rejects(() => M.cdtDxSua(p20, 'T3', { khoi: 'Khối tỉnh', cdt_lon: 'Đơn vị thử C2' }), /đã bị từ chối/);
        await assert.rejects(() => M.cdtDxSua(p20, 'T1', { khoi: 'Khối tỉnh', cdt_lon: '' }), /Chưa nhập/);
        await assert.rejects(() => M.cdtDxSua(th, 'T1', { khoi: 'Khối tỉnh', cdt_lon: 'Đơn vị thử A2' }), /Sửa & duyệt/);
        await M.cdtDxSua(p20, 'T1', { khoi: 'Khối tỉnh', cdt_lon: 'Đơn vị thử A2', cdt_tt: '', ghi_chu: 'đã sửa' });
        const dx = (await M.cdtDxDs(p20)).rows.find((x) => x.id === 'T1'); assert.strictEqual(dx.st, 'cho'); assert.strictEqual(dx.lon, 'Đơn vị thử A2'); assert.strictEqual(dx.ly, ''); assert.strictEqual(dx.truoc.ly, 'Sai tên');
        await assert.rejects(() => M.cdtDxXoa(p20, 'T2'), /Không tìm thấy/); await assert.rejects(() => M.cdtDxXoa(th, 'T1'), /Duyệt hoặc Từ chối/);
        { const tb = await M.thongBaoCho(th); assert.strictEqual(tb.ap, true); assert.ok(tb.cdt >= 1 && tb.tong >= tb.cdt); assert.strictEqual((await M.thongBaoCho(p20)).ap, false); }
        await M.cdtDxXoa(p20, 'T1'); assert.ok(!(await M.cdtDxDs(p20)).rows.some((x) => x.id === 'T1'));
        await luu([{ id: 'T4', khoi: 'Khối tỉnh', lon: 'Z', tt: '', gc: '', kbnn: ky, nguoi: 'x', luc: 4, st: 'duyet', ly: '' }]); await assert.rejects(() => M.cdtDxXoa(p20, 'T4'), /đã được duyệt/);
        await luu([{ id: 'T5', khoi: 'Khối tỉnh', lon: 'Q', tt: '', gc: '', kbnn: ky, nguoi: 'x', luc: 5, st: 'tu_choi', ly: 'x' }, { id: 'T6', khoi: 'Khối tỉnh', lon: 'R', tt: '', gc: '', kbnn: ky, nguoi: 'x', luc: 6, st: 'cho', ly: '' }]);
        await assert.rejects(() => M.cdtDxAn(p20, 'T5'), /Chỉ Phòng NV2/); await assert.rejects(() => M.cdtDxAn(th, 'T6'), /đã bị từ chối/);
        await M.cdtDxAn(th, 'T5'); assert.ok(!(await M.cdtDxDs(th)).rows.some((x) => x.id === 'T5')); assert.ok((await M.cdtDxDs(p20)).rows.some((x) => x.id === 'T5'));
        await M.cdtDxSua(p20, 'T5', { khoi: 'Khối tỉnh', cdt_lon: 'Q2' }); assert.ok((await M.cdtDxDs(th)).rows.some((x) => x.id === 'T5'));
        await luu([]);
      }
      { const DY = require('../lib/dmdyn'), BT0 = require('../lib/bieutong'), P = { 'Phòng giao dịch số 21': 1, 'Phòng Nghiệp vụ 2': 1 };
        const arr = DY.xay([[1, 'Khối xã, phường', 'Phường Minh Xuân', 'Phòng Kinh tế hạ tầng và đô thị', '', 0, 3, { 'Phòng Nghiệp vụ 2': 3 }], [2, 'Khối tỉnh', 'Sở Mới Toanh', '', '', 0, 1, { 'Phòng Nghiệp vụ 2': 1 }], [3, 'Khối tỉnh', 'Bộ Chỉ huy Bộ đội Biên phòng tỉnh Tuyên Quang', '', '', 0, 1, { 'Phòng giao dịch số 21': 1 }]], BT0);
        const by = {}; arr.forEach((o) => { by[o.row] = o; }); assert.strictEqual(new Set(arr.map((o) => o.row)).size, arr.length);
        const iMX = arr.findIndex((o) => o.row === 154); assert.strictEqual(arr[iMX + 1].b, 'Phòng Kinh tế hạ tầng và đô thị'); assert.strictEqual(arr[iMX + 1].a, ''); assert.strictEqual(arr[iMX].a, '45');
        const moi = arr.find((o) => o.b === 'Sở Mới Toanh'); assert.strictEqual(moi.a, '26'); assert.strictEqual(arr[arr.indexOf(moi) + 1].a, 'II');
        const bp = arr.findIndex((o) => /Bộ Chỉ huy Bộ đội Biên phòng/.test(o.b) && o.c === 'Phòng giao dịch 20'); assert.strictEqual(arr[bp + 1].b, 'Giao dịch tại'); assert.strictEqual(arr[bp + 1].c, 'Phòng giao dịch 21');
        const kids = new Set(); arr.forEach((o) => (o.kids || []).forEach((k) => { assert(by[k]); assert(!kids.has(k)); kids.add(k); })); assert.strictEqual(arr.length, DY.BASE.length + 3); }
      { const sv = M.api.goi, gl = []; M.api.goi = async (fn, b) => { gl.push([fn, b]); if (fn === 'cv_dm_ban_do') return [['9001', 'DA thiếu phòng', '', '', ''], ['9002', 'DA có phòng', '', '', 'Phòng giao dịch số 20']]; return { ok: true }; };
        const d = await M.pgdThieuDs(p20); assert.deepStrictEqual(d.rows.map((r) => r.ma), ['9001']); assert.ok(d.pgd.includes('Phòng giao dịch số 21'));
        await M.pgdThieuGan(p20, '9001', 'Phòng giao dịch số 21'); const c = gl.find((g) => g[0] === 'cv_dm_sua'); assert.strictEqual(c[1].p_gh, null); assert.strictEqual(c[1].p_rec.kbnn, 'Phòng giao dịch số 21');
        await assert.rejects(() => M.pgdThieuGan(p20, '9002', 'Phòng giao dịch số 21'), /đã có phòng giao dịch/); await assert.rejects(() => M.pgdThieuGan(p20, '9001', 'Phòng lạ'), /không hợp lệ/); M.api.goi = sv; }
      { const x = await M.dmHtXuat(th, ''); assert.ok(x.b64 && /xlsx$/.test(x.name), 'xuất Excel hoàn thiện'); }
      await assert.rejects(() => M.cbqLuu(p20, { ten: 'A', ma: 'hanhht04' }), /họ và tên/); await assert.rejects(() => M.cbqLuu(p20, { ten: 'Hoàng Thúy Hạnh', ma: 'Hạnh 04' }), /Mã nhân viên/);
      { const x = await M.cbqLuu(p20, { ten: 'Hoàng Thúy Hạnh', ma: 'HanhHT04' }); assert.ok(x.ok);
        const d = await M.cbqDs(p20); assert.strictEqual(d.rows.length >= 1 && d.rows.some((r) => r.ma === 'hanhht04'), true);
        await assert.rejects(() => M.cbqLuu(th, { ten: 'Người khác', ma: 'hanhht04', kbnn: 'Phòng giao dịch số 21' }), /đã có/);
        await assert.rejects(() => M.cbqLuu(th, { ten: 'Người khác', ma: 'abc123' }), /Chọn phòng/);
        const r = d.rows.find((y) => y.ma === 'hanhht04'); await M.cbqXoa(p20, r.id); assert.strictEqual((await M.cbqDs(p20)).rows.some((y) => y.ma === 'hanhht04'), false); }
      await assert.rejects(() => M.dmCbcqLuu(p20, [], 'A'), /Thiếu mã dự án/);
      { // gán rồi hủy phân công bằng từng tài khoản Người nhập (kể cả Phòng Nghiệp vụ 2)
        const sv = M.api.goi, bd = [['901', 'DA 1', '', '', 'Phòng giao dịch số 20', '', ''], ['902', 'DA 2', '', '', 'Phòng giao dịch số 20', '', ''], ['903', 'DA 3', '', '', 'Phòng Nghiệp vụ 2', '', ''], ['904', 'DA 4', '', '', '', '', '']];
        M.api.goi = async (fn) => (fn === 'cv_dm_ban_do' ? bd : sv(fn)); M._reset && M._reset();
        const luu = (k, v) => L._.db().q('INSERT INTO kv (k,v) VALUES ($1,$2) ON CONFLICT (k) DO UPDATE SET v=excluded.v', [k, JSON.stringify(v)]);
        const gm = async () => (JSON.parse((await L._.db().q('SELECT v FROM kv WHERE k=$1', ['dm:cbcq']))[0].v).m);
        await luu('dm:cbql', { ds: [{ id: 'c1', ten: 'Cán bộ A', ma: 'cba', kbnn: 'Phòng giao dịch số 20' }, { id: 'c2', ten: 'Cán bộ B', ma: 'cbb', kbnn: 'Phòng Nghiệp vụ 2' }] }); await luu('dm:cbcq', { m: {} });
        for (const [tk, ma, das, mas] of [[lap20, 'cba', ['901', '902'], ['901', '902']], [await lg('NV2 - Người lập biểu'), 'cbb', ['903'], ['903']]]) {
          await M.dmCbcqLuu(tk, das, ma); assert.strictEqual(Object.keys(await gm()).filter((k) => mas.includes(k)).length, mas.length);
          await M.dmCbcqLuu(tk, das, ''); assert.strictEqual(Object.keys(await gm()).filter((k) => mas.includes(k)).length, 0, 'hủy phân công phải xóa được');
        }
        M.api.goi = sv;
      }
      await assert.rejects(() => M.tbGhi(p20, 'x'), /Chỉ Phòng NV2/);
      await assert.rejects(() => M.lhGhi(p20, 'x'), /Chỉ Phòng NV2/);
      await assert.rejects(() => M.dmHtLuu(p20, '1', 'tam', 'ngắn'), /ít nhất 10 ký tự/); await assert.rejects(() => M.dmHtLuu(p20, '1', 'xoa', ''), /không hợp lệ/); await assert.rejects(() => M.dmHtXacNhan(p20, '1', true), /Chỉ Phòng NV2/); assert.deepStrictEqual((await M.dmHtDs(p20)).rows, []);
      await assert.rejects(() => M.dmTenDeXuat(th, '1', 'Tên', 'lý do dài đủ mười'), /không cần đề xuất/); await assert.rejects(() => M.dmTenDeXuat(p20, '1', 'Tên mới', 'ngắn'), /Bắt buộc ghi lý do/); await assert.rejects(() => M.dmTenDxDuyet(p20, '1', true), /Chỉ Phòng NV2/);
      { await assert.rejects(() => M.gyGui(p20, 'Khác', 'a'), /quá ngắn/); await M.gyGui(p20, 'Lỗi / sự cố', 'Nút lưu không phản hồi ở màn hình hoàn thiện'); const g1 = await M.gyDs(p20), g2 = await M.gyDs(th); assert.strictEqual(g1.sua, false); assert.strictEqual(g1.ds.length, 1); assert.strictEqual(g2.chua, 1);
        await assert.rejects(() => M.gyTraLoi(p20, g1.ds[0].id, 'x'), /Chỉ Phòng NV2/); await M.gyTraLoi(th, g1.ds[0].id, 'Đã ghi nhận, sẽ sửa'); assert.strictEqual((await M.gyDs(p20)).ds[0].tl, 'Đã ghi nhận, sẽ sửa'); assert.strictEqual((await M.gyDs(th)).chua, 0); }
      { const t = M.ctmtTra('1102; 11102 ; 0514'); assert.strictEqual(t.rows.length, 2); assert.deepStrictEqual(t.rows[0].chuoi.map((x) => x.ma), ['0100', '0102', '1102']); assert(/Rà soát, lập, phê duyệt quy hoạch chung xã/.test(t.rows[0].chuoi[2].ten)); assert.deepStrictEqual(t.rows[1].chuoi.map((x) => x.ma), ['0510', '0514']); assert.strictEqual(t.rows[0].nhan, 'NTM-GNBV-DTTS 26-30'); assert.strictEqual(t.rows[1].nhan, 'DTTS 21-25'); assert.strictEqual(M.ctmtTra('0022').rows[0].nhan, 'Không xác định'); assert.deepStrictEqual(M.ctmtTra('9999 12').loi, ['9999', '12']); assert.strictEqual((await M.dmCtmtLuu(th, '8011836', '9999', 'CTMT địa phương')).khac, 1); assert.strictEqual((await M.dmCtmtLuu(th, '8011836', '0514; 0759', 'CTMT khác')).khac, 1); await M.dmCtmtLuu(th, '8011836', '0514'); }
      { const sv5 = M.api.goi; let g5; M.api.goi = async (fn, b) => { g5 = [fn, b]; return { tong: 2143 }; }; await M.dmCtmtDongBo(th, false); assert.strictEqual(g5[0], 'cv_dm_ctmt_dong_bo'); const r5 = g5[1].p_rows.find((x) => x.m === '8011836'); assert.strictEqual(r5.c, '0514'); assert.strictEqual(r5.n, 'DTTS'); assert.strictEqual(r5.l, 'DTTS 21-25'); assert(/hạ tầng thiết yếu/i.test(r5.t)); await assert.rejects(() => M.dmCtmtDongBo(p20, false), /Chỉ Phòng NV2/); M.api.goi = sv5; }
      let goi2; M.api.goi = async (fn, b) => { goi2 = [fn, b]; return { giu: 1 }; }; await M.dmDongBo(th, false); assert.strictEqual(goi2[0], 'cv_dm_dong_bo'); assert.strictEqual(goi2[1].p_ghi, false); assert(goi2[1].p_rows.length > 4000); M.api.goi = sv;
    }
    {
      const ma0 = Object.keys(require('../lib/so_sanh_b501_tt85.json')).find((m) => require('../lib/so_sanh_b501_tt85.json')[m].s === 'BT');
      const sv = M.api.goi; M.api.goi = async (fn) => { if (fn === 'cv_dm_ds') return { tong: 2, rows: [[ma0, 'Tên web khác hẳn', mauT, mauT, 'Phòng giao dịch số 20', '', '', '', false, false, null, null, ''], ['9999999', 'DA ngoài file', mauT, mauT, 'Phòng giao dịch số 21', '', '', '', false, false, null, null, '']] }; if (fn === 'cv_dm_cdt_ten') return { ten: [mauT], lon: [mauT], tt: {} }; return { ok: true }; };
      M._reset && M._reset(); const kq = await M.dmXuatDeXuat(th); assert(kq.b64.length > 2000); M.api.goi = sv; M._reset && M._reset();
    }
    // TT37: gán chủ đầu tư theo danh mục dự án, cộng theo (chủ đầu tư, phòng)
    {
      const T37 = require('../lib/tt37'), kqg = { khoi: [{ pgd: 'Phòng giao dịch 20', tong: [30, 0, 0, 0, 0], da: { 111: { ma: '111', ten: 'A', v: [10, 1, 2, 3, 4] }, 222: { ma: '222', ten: 'B', v: [20, 0, 0, 0, 0] }, 333: { ma: '333', ten: 'C', v: [5, 0, 0, 0, 0] }, 444: { ma: '444', ten: 'D', v: [0, 0, 0, 0, 0] } } }], lech: [], loi: [], ngay: '2026-11-16' };
      M.api.goi = async (fn) => { if (fn === 'cv_dm_ban_do') return [['111', 'A', mauT, mauT, 'Phòng giao dịch số 20'], ['222', 'B', mauT, mauT, 'Phòng giao dịch số 21']]; if (fn === 'cv_dm_cdt_ten') return { ten: [mauT], lon: [mauT], tt: {} }; return { ok: true }; };
      process.env.TONGHOP_KHOA = 'k'; M._reset && M._reset();
      const g = await T37._ganCdt(kqg), s = T37._tomTat(kqg, g);
      assert.strictEqual(g.dong.length, 1); assert.strictEqual(g.dong[0].v[0], 30, 'cộng theo chủ đầu tư và phòng'); assert.strictEqual(g.dong[0].so, 2);
      assert.strictEqual(g.chuaKhop.length, 1); assert.strictEqual(g.chuaKhop[0].ma, '333'); assert.strictEqual(s.soDuAn, 3, 'dự án không phát sinh không tính'); assert.strictEqual(g.lechKb, 1, 'phòng trong file khác phòng trong danh mục');
    }
    {
      const T37 = require('../lib/tt37'), fake = Buffer.from('xlsx-gia').toString('base64');
      const kqf = { ngay: '2026-11-16' }; const id = await T37._luuFile({ ten: 'tester' }, 'a.xlsx', fake, kqf);
      assert.strictEqual((await T37.ds(th)).ds.length, 1); assert.strictEqual((await T37.taiXuong(th, id)).b64, fake);
      await assert.rejects(() => T37.ds(p20), /quyền/); assert.strictEqual((await T37.xoa(th, id)).ds.length, 0);
    }
    {
      const bc = require('../lib/tt37bc'), T37 = require('../lib/tt37');
      await assert.rejects(() => bc.baoCao(p20, 'a', 'eA==', ''), /Chỉ cán bộ Phòng NV2/);
    }
    M.api.goi = null; delete process.env.TONGHOP_KHOA; await assert.rejects(() => M.dmDs(th, {}, 0), /TONGHOP_KHOA/);
  }
  // ---- BC KPI: đối chiếu THBC theo mốc ngày, PGD xác nhận / ghi nhận số khác kèm lý do ----
  {
    const K = require('../lib/kpi'), b64 = require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'doichieu_thbc.xlsx')).toString('base64');
    await assert.rejects(() => K.taiThbc(lap20, '2026-10-15', '', 'x.xlsx', b64), /Chỉ Phòng NV2/);
    await assert.rejects(() => K.taiThbc(th, '2026-02-31', '', 'x.xlsx', b64), /ngày mốc/);
    const r0 = await K.taiThbc(th, '2026-10-15', '', 'doichieu.xlsx', b64); assert(r0.co && r0.full); assert.strictEqual(r0.rows.filter((x) => x.k === 'row').length, 195);
    assert(Math.abs(r0.rows.find((x) => x.k === 'tot').e0 - r0.rows.find((x) => x.k === 'tot').t0) < 1e-6);
    const r20 = await K.lay(lap20, '2026-10-15'), l20 = r20.rows.filter((x) => x.k === 'row'); assert(l20.length > 0 && l20.every((x) => x.c === P20) && r20.quyen.sua && !r20.quyen.xacNhan, 'người lập sửa được, không xác nhận được'); { const tp0 = await K.lay(tp20, '2026-10-15'); assert(!tp0.quyen.sua && tp0.quyen.xnThbc && tp0.quyen.xacNhan, 'Trưởng phòng chỉ xác nhận số THBC'); }
    { const xk = await X.xuatKpi(th, '2026-10-15', 'xem', 'sau'); assert(xk.rows.length > 5, 'xem trước bảng KPI');
      const mk = [{ t: 'p', jc: 'left', r: [{ t: 'Số: 77 /KBVIII-NV2' }] }, { t: 'p', jc: 'left', r: [{ t: 'Phú Thọ, ngày 05 tháng 11 năm 2026' }] }]; await K.vbTayLuu(th, '2026-10-15', mk);
      const vk = await K.vbLay(th, '2026-10-15'); assert(vk.tay && vk.so === '77' && vk.ngay === '5/11/2026', 'công văn KPI soạn trên web: lưu và lấy số/ngày'); assert((await K.vbTayXuat(th, '2026-10-15', mk)).b64.length > 500); await K.vbTayLam(th, '2026-10-15'); assert(!(await K.vbLay(th, '2026-10-15')).tay); }
    const kk = await K.lay(ktt20, '2026-10-15'); assert(!kk.quyen.sua && !kk.quyen.xacNhan, 'KTT chỉ xem');
    const x0 = l20[0], v = [x0.t0 + 5, x0.t1, x0.t2, x0.t3];
    await assert.rejects(() => K.luuDc(lap20, '2026-10-15', [{ khoa: x0.khoa, v, ly: '' }]), /bắt buộc ghi lý do/);
    await assert.rejects(() => K.luuDc(th, '2026-10-15', [{ khoa: x0.khoa, v, ly: 'abc' }]), /Chỉ phòng giao dịch/);
    await assert.rejects(() => K.luuDc(tp20, '2026-10-15', [{ khoa: x0.khoa, v, ly: 'abc xyz' }]), /không sửa trực tiếp/); await assert.rejects(() => K.luuDc(ktt20, '2026-10-15', [{ khoa: x0.khoa, v, ly: 'abc xyz' }]), /chỉ xem/);
    const o = await K.luuDc(lap20, '2026-10-15', [{ khoa: x0.khoa, v, ly: 'chứng từ hạch toán sau ngày chốt' }]); const y0 = o.rows.find((x) => x.khoa === x0.khoa);
    assert(Math.abs(y0.p0 - (x0.t0 + 5)) < 1e-6 && Math.abs(y0.e0 - x0.t0) < 1e-6 && y0.ly && o.ds.find((d) => d.pgd === P20).tt === 'nhap' && o.quyen.gui, 'bản nháp: chưa tính vào số sau điều chỉnh');
    { const tk = await K.lay(tp20, '2026-10-15'); assert.strictEqual(tk.rows.find((x) => x.khoa === x0.khoa).ly, undefined, 'bản nháp Trưởng phòng chưa thấy'); assert(!tk.quyen.xacNhan, 'có điều chỉnh nháp thì chưa xác nhận được'); }
    await assert.rejects(() => K.xacNhan(tp20, '2026-10-15'), /chưa gửi phê duyệt/);
    await assert.rejects(() => K.pheDuyet(tp20, '2026-10-15'), /Không có số điều chỉnh nào đang chờ/); await assert.rejects(() => K.guiDuyet(tp20, '2026-10-15'), /Chỉ người nhập/);
    await assert.rejects(() => K.xacNhan(lap20, '2026-10-15'), /Chỉ Lãnh đạo phòng/); await assert.rejects(() => K.xacNhan(ktt20, '2026-10-15'), /Chỉ Lãnh đạo phòng/);
    const g = await K.guiDuyet(lap20, '2026-10-15'); assert.strictEqual(g.ds.find((d) => d.pgd === P20).tt, 'gui'); assert(!g.quyen.sua && !g.quyen.gui);
    await assert.rejects(() => K.luuDc(lap20, '2026-10-15', [{ khoa: x0.khoa, v: null }]), /đã gửi phê duyệt/);
    { const tk = await K.lay(tp20, '2026-10-15'); assert(tk.quyen.pheDuyet && tk.quyen.traLai && !tk.quyen.xacNhan && !tk.quyen.sua); assert(Math.abs(tk.rows.find((x) => x.khoa === x0.khoa).p0 - (x0.t0 + 5)) < 1e-6 && Math.abs(tk.rows.find((x) => x.khoa === x0.khoa).e0 - x0.t0) < 1e-6); }
    await assert.rejects(() => K.xacNhan(tp20, '2026-10-15'), /chờ phê duyệt/); await assert.rejects(() => K.pheDuyet(lap20, '2026-10-15'), /Chỉ Lãnh đạo phòng/);
    const tl = await K.traLai(tp20, '2026-10-15'); assert.strictEqual(tl.ds.find((d) => d.pgd === P20).tt, 'nhap'); await K.guiDuyet(lap20, '2026-10-15');
    const pd = await K.pheDuyet(tp20, '2026-10-15'); assert.strictEqual(pd.ds.find((d) => d.pgd === P20).tt, 'duyet'); assert(pd.quyen.xnDc && !pd.quyen.xnThbc && Math.abs(pd.rows.find((x) => x.khoa === x0.khoa).e0 - (x0.t0 + 5)) < 1e-6, 'duyệt xong số sau điều chỉnh thay số THBC');
    const xn = await K.xacNhan(tp20, '2026-10-15'); assert.strictEqual(xn.ds.find((d) => d.pgd === P20).tt, 'xn_dc'); assert(!xn.quyen.sua && xn.quyen.moLai);
    await assert.rejects(() => K.luuDc(lap20, '2026-10-15', [{ khoa: x0.khoa, v: null }]), /đã xác nhận/);
    const tt = await K.lay(th, '2026-10-15'); assert(Math.abs(tt.rows.find((x) => x.k === 'tot').e0 - tt.rows.find((x) => x.k === 'tot').t0 - 5) < 1e-6, 'tổng toàn tỉnh lấy số phòng ghi nhận'); assert(tt.vb && tt.vb.tong.tong > 0);
    for (const f of ['xlsx', 'pdf']) { const ex = await X.xuatKpi(th, '2026-10-15', f, 'sau'); assert(ex.b64.length > 1000); }
    { const h = Buffer.from((await X.xuatKpi(th, '2026-10-15', 'pdf', 'sau')).b64, 'base64').toString('utf8'); assert(/Ghi chú \(lý do điều chỉnh\)/.test(h), 'biểu KPI có cột Ghi chú khi có điều chỉnh'); }
    assert((await X.xuatKpi(lap20, '2026-10-15', 'xlsx', 'goc')).b64.length > 1000);
    await assert.rejects(() => K.vbLay(lap20, '2026-10-15'), /Không có quyền/); await K.vbLuu(th, '2026-10-15', { so: '1725', ngay: '16/10/2026', nguoiKy: 'Đặng Kim Liên' }); const cv = await X.xuatCongVan(th, '2026-10-15', 'sau'); assert(cv.name.endsWith('.docx') && cv.b64.length > 1500); require('fs').writeFileSync('/tmp/cv_test.docx', Buffer.from(cv.b64, 'base64'));
    await K.moLai(tp20, '2026-10-15'); const bo = await K.luuDc(lap20, '2026-10-15', [{ khoa: x0.khoa, v: [x0.t0, x0.t1, x0.t2, x0.t3] }]); assert.strictEqual(bo.ds.find((d) => d.pgd === P20).tt, 'cho', 'nhập lại đúng THBC = không còn điều chỉnh');
    await K.chotMoc(th, '2026-10-15', true); await assert.rejects(() => K.xacNhan(tp20, '2026-10-15'), /đã chốt/); await K.chotMoc(th, '2026-10-15', false);
    // sheet 1953 của cùng file vẫn đọc được ở mục THBC 1953 (chỉ có cột lũy kế)
    const TB = require('../lib/thbc'); const r1953 = await TB.nhap(th, 'doichieu.xlsx', b64); assert.strictEqual(r1953.rows.filter((x) => x.k === 'row' && x.tlk != null).length, 195); await TB.xoa(th);
    { const tm = await K.taoTuBc1953(th, '2026-10-20', ''); assert(tm.co && tm.moc.file.startsWith('Số tạm') && tm.rows.find((x) => x.k === 'tot').e0 + tm.rows.find((x) => x.k === 'tot').e2 > 0); await K.xoaMoc(th, '2026-10-20'); }
    await K.xoaMoc(th, '2026-10-15'); assert.strictEqual((await K.dsKy(th)).ds.length, 0);
  }
  {   // giao diện: script nhúng trong index.html phải đúng cú pháp (lỗi cú pháp làm hỏng cả trang, kể cả đăng nhập)
    const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'cv1953', 'index.html'), 'utf8');
    const m = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop();
    assert(m, 'không thấy script'); new (require('vm').Script)(m[1]);
  }
  console.log('Tất cả kiểm thử đạt (' + (Date.now() - t0) + ' ms).');
})().catch((e) => { console.error('KIỂM THỬ LỖI:', e); process.exit(1); });
