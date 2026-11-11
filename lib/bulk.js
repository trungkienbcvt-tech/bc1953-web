'use strict';
// Chèn nhiều dòng một câu lệnh (giảm số lần gọi qua mạng: máy chủ Vercel và CSDL có thể ở xa nhau).
async function bulk(t, bang, cot, dong, lo) {
  lo = lo || Math.max(1, Math.floor(8000 / cot.length));
  for (let i = 0; i < dong.length; i += lo) {
    const par = [], vals = dong.slice(i, i + lo).map((r) => '(' + r.map((v) => '$' + par.push(v === undefined ? null : v)).join(',') + ')');
    await t.q('INSERT INTO ' + bang + ' (' + cot.join(',') + ') VALUES ' + vals.join(','), par);
  }
}
module.exports = bulk;
