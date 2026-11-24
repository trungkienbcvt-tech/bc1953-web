'use strict';
// Bộ ghi file .docx tối giản (không cần thư viện ngoài) cho công văn: khổ A4, lề theo thể thức văn bản (trái 3 cm, phải 1,5 cm, trên/dưới 2 cm), Times New Roman.
const { zip } = require('./xlsx');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const run = (t, o) => { o = o || {}; const sz = o.sz || 28; return `<w:r><w:rPr>${o.b ? '<w:b/>' : ''}${o.i ? '<w:i/>' : ''}${o.u ? '<w:u w:val="single"/>' : ''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`; };
const para = (runs, o) => { o = o || {}; return `<w:p><w:pPr>${o.keep ? '<w:keepNext/>' : ''}${o.line ? `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="000000"/></w:pBdr>` : ''}<w:spacing w:before="${o.before || 0}" w:after="${o.after || 0}" w:line="${o.ln || 300}" w:lineRule="auto"/><w:ind w:left="${o.left || 0}" w:right="${o.right || 0}" w:firstLine="${o.first || 0}"/><w:jc w:val="${o.jc || 'both'}"/></w:pPr>${runs || ''}</w:p>`; };
const tc = (w, inner) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>${inner}</w:tc>`;
const bang = (cols, cells) => `<w:tbl><w:tblPr><w:tblW w:w="${cols.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${cols.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid><w:tr>${cells.map((c, i) => tc(cols[i], c)).join('')}</w:tr></w:tbl>`;
const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
function ghi(body) {
  const doc = `${head}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `${head}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="28"/><w:szCs w:val="28"/><w:lang w:val="vi-VN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;
  return zip([
    { name: '[Content_Types].xml', data: `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>` },
    { name: '_rels/.rels', data: `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
    { name: 'word/_rels/document.xml.rels', data: `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'word/document.xml', data: doc }, { name: 'word/styles.xml', data: styles },
  ]);
}

// Phần đầu văn bản theo thể thức: cột trái (cơ quan ban hành + gạch ngắn 1/3–1/2 dòng chữ, số, trích yếu), cột phải (quốc hiệu, tiêu ngữ + gạch dài bằng dòng chữ, địa danh ngày tháng)
// Độ rộng dòng chữ đo bằng font Times New Roman: "KHO BẠC NHÀ NƯỚC KHU VỰC VIII" 11pt ≈ 3860 twips, "Độc lập – Tự do – Hạnh phúc" 13pt ≈ 3265 twips.
function gach(ind) { return `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="000000"/></w:pBdr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:ind w:left="${ind}" w:right="${ind}"/><w:jc w:val="center"/><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr></w:p>`; }
function dauVanBan(o) {
  const C0 = { jc: 'center' };
  const T1 = Object.assign({ ln: 240 }, C0), trai = [para(run('KHO BẠC NHÀ NƯỚC', { sz: 22 }), T1), para(run('KHO BẠC NHÀ NƯỚC KHU VỰC VIII', { sz: 22, b: 1 }), T1), gach(1390),
    para(run('Số: ' + (o.so || '......') + ' /KBVIII-NV2', { sz: 26 }), Object.assign({ before: 80 }, C0)), para(run('V/v ' + o.trichYeu, { sz: 24 }), Object.assign({ before: 40 }, C0))].join('');
  const phai = [para(run('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { sz: 22, b: 1 }), T1), para(run('Độc lập – Tự do – Hạnh phúc', { sz: 26, b: 1 }), T1), gach(690),
    para(run(o.diaNgay, { sz: 28, i: 1 }), Object.assign({ before: 120 }, C0))].join('');
  return [trai, phai];
}
// Dựng nội dung từ mô hình khối do trang soạn thảo trên web gửi lên (đã kiểm tra, giới hạn kích cỡ).
// Khối: {t:'p',jc,first,left,before,after,ln,sz,keep,r:[{t,b,i,u}]} | {t:'g',ind} | {t:'tbl',cols:[..],c:[[khối..],[khối..]]}
const so = (v, lo, hi, mac) => { v = Number(v); return isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : mac; };
function runMo(r, sz) { const t = String(r.t == null ? '' : r.t).substring(0, 4000).split('\n'); return t.map((x, i) => (i ? '<w:r><w:br/></w:r>' : '') + run(x, { b: r.b, i: r.i, u: r.u, sz })).join(''); }
function khoi(b, dep) {
  if (!b || typeof b !== 'object') return '';
  if (b.t === 'g') return gach(so(b.ind, 0, 4000, 0));
  if (b.t === 'tbl' && dep < 1) {
    const cols = (Array.isArray(b.cols) ? b.cols : []).slice(0, 4).map((w) => so(w, 500, 9400, 4500)), c = (Array.isArray(b.c) ? b.c : []).slice(0, cols.length);
    if (!cols.length || c.length !== cols.length) return '';
    return bang(cols, c.map((x) => (Array.isArray(x) ? x : []).slice(0, 80).map((y) => khoi(y, dep + 1)).join('') || para('', {})));
  }
  if (b.t !== 'p') return '';
  const jc = ['left', 'center', 'right', 'both'].includes(b.jc) ? b.jc : 'both', sz = so(b.sz, 16, 40, 28);
  const runs = (Array.isArray(b.r) ? b.r : []).slice(0, 200).map((r) => runMo(r || {}, sz)).join('');
  return para(runs, { jc, first: so(b.first, 0, 3000, 0), left: so(b.left, 0, 3000, 0), before: so(b.before, 0, 3000, 0), after: so(b.after, 0, 3000, 0), ln: so(b.ln, 200, 600, 312), keep: b.keep ? 1 : 0 });
}
function tuMoHinh(bl) { return (Array.isArray(bl) ? bl : []).slice(0, 400).map((b) => khoi(b, 0)).join(''); }
module.exports = { ghi, run, para, bang, dauVanBan, tuMoHinh };
