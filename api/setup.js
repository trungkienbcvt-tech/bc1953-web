'use strict';
// Khởi tạo CSDL từ trình duyệt (không cần cài Node trên máy bạn).
// Dùng: đặt biến môi trường SETUP_KEY trên Vercel, rồi mở  https://<tên-miền>/api/setup?key=<SETUP_KEY>
// Chỉ chạy được khi CSDL còn trống. Nạp lại từ đầu: thêm &force=1 (XÓA số liệu hiện có).
// Xong việc nên xóa biến SETUP_KEY trên Vercel để đóng chức năng này.
const crypto = require('crypto');
const db = require('../lib/db');
const { seed } = require('../lib/seed');
const raw = require('../seed/raw.json');
const SCHEMA = require('../lib/schema');
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  const url = new URL(req.url, 'http://x'), key = url.searchParams.get('key') || '';
  if (!process.env.SETUP_KEY) { res.statusCode = 403; return res.end('Chưa bật khởi tạo: hãy đặt biến môi trường SETUP_KEY trên Vercel rồi Redeploy.'); }
  if (!same(key, process.env.SETUP_KEY)) { res.statusCode = 403; return res.end('Sai khóa.'); }
  try {
    const force = url.searchParams.get('force') === '1', chiSoLieu = url.searchParams.get('mode') === 'data', d = db(); await d.exec(SCHEMA);
    const daCo = Number((await d.q('SELECT COUNT(*) AS n FROM kv'))[0].n) > 0;
    let out = '';
    if (chiSoLieu) {
      if (!daCo) throw new Error('Chưa có dữ liệu để nạp lại; hãy chạy khởi tạo bình thường (không có mode=data).');
      await seed(d, raw, { force: true, giuTaiKhoan: true });
      out += 'ĐÃ NẠP LẠI SỐ LIỆU báo cáo (kỳ 10/2026 = số liệu thật, tháng 9 = lũy kế − phát sinh tháng 10). Tài khoản và mã đăng nhập giữ nguyên.\nLưu ý: trạng thái gửi/duyệt các phòng được đặt lại "Chưa gửi"; file THBC đã tải (nếu có) bị xóa, cần tải lại.\n\n';
    } else if (daCo && !force) out += 'Báo cáo 1953 và tài khoản: ĐÃ CÓ từ trước, giữ nguyên (không hiện lại mã đăng nhập).\n\n';
    else {
      const codes = await seed(d, raw, { force });
      out += 'ĐÃ KHỞI TẠO BÁO CÁO 1953. Lưu lại bảng mã đăng nhập dưới đây (trang này sẽ không hiện lại):\n\nTài khoản\tVai trò\tMã đăng nhập\n' + codes.map((c) => `${c.ten}\t${c.vt}\t${c.ma}`).join('\n') + '\n\n';
    }
    res.end(out + '\nBước cuối: xóa biến SETUP_KEY trên Vercel để đóng chức năng này.');
  } catch (e) { res.statusCode = 500; res.end('LỖI: ' + e.message); }
};
module.exports.xuLy = null;
