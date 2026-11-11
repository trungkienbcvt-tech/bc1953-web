// Máy chủ thử nghiệm cục bộ (SQLite trong bộ nhớ + dữ liệu khởi tạo): node scripts/dev.js
const http = require('http'), fs = require('fs'), path = require('path');
const db = require('../lib/db')(); const { seed } = require('../lib/seed'); const rpc = require('../api/rpc');
(async () => {
  const codes = await seed(db, require('../seed/raw.json'));
  console.table(codes); fs.writeFileSync('/tmp/codes.json', JSON.stringify(codes));
  http.createServer(async (req, res) => {
    if (req.url === '/api/rpc') { let b = ''; req.on('data', (d) => b += d); req.on('end', () => { req.body = b; rpc(req, res); }); return; }
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(fs.readFileSync(path.join(__dirname, '../public/index.html')));
  }).listen(process.env.PORT||3000, () => console.log('ready'));
})();
