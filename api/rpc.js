'use strict';
// Một điểm vào duy nhất: POST /api/rpc  { fn: "tenHam", args: [...] }  ->  { ok:true, data } | { ok:false, error }
const L = require('../lib/logic');
const X = require('../lib/export');
const D = require('../lib/doichieu');
const M = require('../lib/danhmuc');
const K = require('../lib/kpi');
const FN = {
  dsTaiKhoan: L.dsTaiKhoan, doiMa: L.doiMa, dangNhap: L.dangNhap, layDuLieu: L.layDuLieu, luu: L.luu, trangThai: L.trangThai, datHan: L.datHan, guiBaoCao: L.guiBaoCao,
  thuHoi: L.thuHoi, deNghiSua: L.deNghiSua, tiepNhan: L.tiepNhan, chuyenTra: L.chuyenTra, nopTongHop: L.nopTongHop, tongHop: L.tongHop,
  lamTron: L.lamTron, chotKy: L.chotKy, luuNguoiKy: L.luuNguoiKy, xuatBieu: X.xuatBieu, xuatTong: X.xuatTong, xuatThongKe: X.xuatThongKe,
  duyet: L.duyet, tinhTrang: require('../lib/tinhtrang').tinh, xuatTinhTrang: X.xuatTinhTrang, nhapThbc: require('../lib/thbc').nhap, xoaThbc: require('../lib/thbc').xoa, canhBaoThbc: require('../lib/thbc').canhBao, bieuTong: require('../lib/bieutong').bieuTong, xuatBieuTong: X.xuatBieuTong, doiChieu: D.doiChieu, nhapKbnn: D.nhapKbnn, xoaKbnn: D.xoaKbnn,
  kpiDs: K.dsKy, kpiLay: K.lay, kpiTai: K.taiThbc, kpiTaoTam: K.taoTuBc1953, kpiLuu: K.luuDc, kpiXacNhan: K.xacNhan, kpiGui: K.guiDuyet, kpiPheDuyet: K.pheDuyet, kpiTraLai: K.traLai, kpiMoLai: K.moLai, kpiChot: K.chotMoc, kpiXoa: K.xoaMoc, xuatKpi: X.xuatKpi, bangKemXem: X.bangKemXem, bangKemXuat: X.bangKemXuat, bangKemSua: X.bangKemSua, bangKemSuaXoa: X.bangKemSuaXoa, kpiSua: X.kpiSua, kpiSuaXoa: X.kpiSuaXoa, xuatCongVan: X.xuatCongVan, kpiVbLay: K.vbLay, kpiVbLuu: K.vbLuu, kpiVbTayLuu: K.vbTayLuu, kpiVbTayLam: K.vbTayLam, kpiVbTayXuat: K.vbTayXuat,
  thongBaoCho: M.thongBaoCho, cdtXaDs: M.cdtXaDs, cdtTtNhanh: M.cdtTtNhanh, cdtDxDuyetHet: M.cdtDxDuyetHet, pgdThieuDs: M.pgdThieuDs, pgdThieuGan: M.pgdThieuGan, btGhiChu: require('../lib/bieutong').btGhiChu, cvLay: require('../lib/cv1953').cvLay, cvLuu: require('../lib/cv1953').cvLuu, cvXuat: require('../lib/cv1953').cvXuat, cvLuuTay: require('../lib/cv1953').cvLuuTay, cvLamLai: require('../lib/cv1953').cvLamLai, cvXuatTay: require('../lib/cv1953').cvXuatTay, adDs: M.adDs, adDatMa: M.adDatMa, adNoiDung: M.adNoiDung, adTbGhi: M.adTbGhi, adLhGhi: M.adLhGhi, dmXuatDeXuat: M.dmXuatDeXuat, dmDongBo: M.dmDongBo, dmCtmtDongBo: M.dmCtmtDongBo, dmCtmtTra: M.dmCtmtTra, dmCtmtLuu: M.dmCtmtLuu, dmupTai: require('../lib/dmup').tai, dmupDs: require('../lib/dmup').ds, dmupQuyet: require('../lib/dmup').quyet, dmupKhoiPhuc: require('../lib/dmup').khoiPhuc, dmTenFile: M.dmTenFile, dmTenCoSan: M.dmTenCoSan, dmTuyChon: M.dmTuyChon, dmDs: M.dmDs, dmSua: M.dmSua, dmThem: M.dmThem, dmHangLoat: M.dmHangLoat, dmCanHT: M.dmCanHT, dmCanhBao: M.dmCanhBao, dmDeXuat: M.dmDeXuat, dmDxDs: M.dmDxDs, dmDxDuyet: M.dmDxDuyet, cdtDs: M.cdtDs, cdtLuu: M.cdtLuu, cdtXoa: M.cdtXoa, cdtXuat: M.cdtXuat, cdtDeXuat: M.cdtDeXuat, dmTenDeXuat: M.dmTenDeXuat, dmCbcqLuu: M.dmCbcqLuu, cbqDs: M.cbqDs, cbqLuu: M.cbqLuu, cbqXoa: M.cbqXoa, dmTtBoQua: M.dmTtBoQua, lhLay: M.lhLay, gyGui: M.gyGui, gyDs: M.gyDs, gyTraLoi: M.gyTraLoi, lhGhi: M.lhGhi, dmTienDo: M.dmTienDo, tbLay: M.tbLay, tbGhi: M.tbGhi, dmHtLuu: M.dmHtLuu, dmHtDs: M.dmHtDs, dmHtXacNhan: M.dmHtXacNhan, dmHtXuat: M.dmHtXuat, dmTenDxDs: M.dmTenDxDs, dmTenBang: M.dmTenBang, dmTenBangXuat: M.dmTenBangXuat, dmTenDxDuyet: M.dmTenDxDuyet, cdtDxDs: M.cdtDxDs, cdtDxSua: M.cdtDxSua, cdtDxXoa: M.cdtDxXoa, cdtDxAn: M.cdtDxAn, cdtDxDuyet: M.cdtDxDuyet, dmXuat: M.dmXuat, tt37Xem: require('../lib/tt37').xem, tt37Ghi: require('../lib/tt37').ghi, tt37SoSanh: require('../lib/tt37').soSanh, tt37BaoCao: require('../lib/tt37bc').baoCao, tt37Ds: require('../lib/tt37').ds, tt37Xoa: require('../lib/tt37').xoa, tt37TaiXuong: require('../lib/tt37').taiXuong,
};
async function xuLy(body) {
  const fn = body && body.fn;
  if (!fn || !Object.prototype.hasOwnProperty.call(FN, fn)) return { ok: false, error: 'Chức năng không hợp lệ.' };
  try { await L.init(); return { ok: true, data: await FN[fn].apply(null, Array.isArray(body.args) ? body.args : []) }; }
  catch (e) {
    if (!e.user) console.error('[rpc]', fn, e);
    return { ok: false, error: e.user ? e.message : 'Lỗi máy chủ, vui lòng thử lại. (' + String(e.message).substring(0, 120) + ')' };
  }
}
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(JSON.stringify({ ok: false, error: 'Chỉ nhận POST.' })); }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const r = await xuLy(body);
  res.statusCode = 200; res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(r));
};
module.exports.xuLy = xuLy;
