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
  kpiDs: K.dsKy, kpiLay: K.lay, kpiTai: K.taiThbc, kpiTaoTam: K.taoTuBc1953, kpiLuu: K.luuDc, kpiXacNhan: K.xacNhan, kpiGui: K.guiDuyet, kpiPheDuyet: K.pheDuyet, kpiTraLai: K.traLai, kpiMoLai: K.moLai, kpiChot: K.chotMoc, kpiXoa: K.xoaMoc, xuatKpi: X.xuatKpi, xuatCongVan: X.xuatCongVan, kpiVbLay: K.vbLay, kpiVbLuu: K.vbLuu,
  dmTuyChon: M.dmTuyChon, dmDs: M.dmDs, dmSua: M.dmSua, dmThem: M.dmThem, dmHangLoat: M.dmHangLoat, dmCanHT: M.dmCanHT, dmXuat: M.dmXuat,
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
