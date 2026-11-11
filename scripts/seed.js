'use strict';
// Chạy: DATABASE_URL=... node scripts/seed.js [--force]
const fs = require('fs'), path = require('path');
const db = require('../lib/db')();
const { seed } = require('../lib/seed');
(async () => {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../seed/raw.json'), 'utf8'));
  const codes = await seed(db, raw, { force: process.argv.includes('--force') });
  const out = 'Tài khoản\tVai trò\tMã đăng nhập\n' + codes.map((c) => `${c.ten}\t${c.vt}\t${c.ma}`).join('\n') + '\n';
  fs.writeFileSync(path.join(__dirname, '../ma-dang-nhap.txt'), out);
  console.log(out + '\nĐã lưu bảng mã vào ma-dang-nhap.txt (file này đã nằm trong .gitignore, KHÔNG đưa lên GitHub).');
  process.exit(0);
})().catch((e) => { console.error('LỖI:', e.message); process.exit(1); });
