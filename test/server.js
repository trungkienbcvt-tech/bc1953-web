// Máy chủ thử nghiệm cục bộ (SQLite trong bộ nhớ + dữ liệu khởi tạo): node test/server.js
const http = require('http'), fs = require('fs'), path = require('path');
const db = require('../lib/db')(); const { seed } = require('../lib/seed'); const rpc = require('../api/rpc');
(async () => {
  const codes = await seed(db, require('../seed/raw.json'));
  fs.writeFileSync('/tmp/codes.json', JSON.stringify(codes));
  http.createServer(async (req, res) => {
    if (req.url === '/api/rpc') { let b = ''; req.on('data', (d) => b += d); req.on('end', () => { req.body = b; rpc(req, res); }); return; }
    // Phục vụ tệp tĩnh trong public/ (trang chủ, /cv1953/, /tonghop/)
    const pub = path.join(__dirname, '../public'); let u = decodeURIComponent(req.url.split('?')[0]);
    if (u === '/cv1953' || u === '/tonghop') { res.writeHead(302, { Location: u + '/' }); return res.end(); }
    if (u.endsWith('/')) u += 'index.html';
    const f = path.join(pub, path.normalize(u));
    if (!f.startsWith(pub) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end('Not found'); }
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
    res.setHeader('Content-Type', mime[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f));
  }).listen(8766, () => console.log('ready'));
})();
