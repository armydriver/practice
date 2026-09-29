/* 단일 파일 빌드 — CSS·JS 를 index.html 에 인라인해 어디서든 열리는 standalone HTML 을 만듭니다. */
const fs = require('fs');
const path = require('path');
const ROOT = '/home/user/sangmins-cinema';
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const css = fs.readFileSync(path.join(ROOT, 'css/styles.css'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="css\/styles\.css" \/>/,
  '<style>\n' + css + '\n</style>');

const order = ['data/taxonomy.js', 'data/movies.js', 'data/ratings.js', 'engine/scoring.js', 'app/store.js', 'app/ui.js'];
const scripts = order.map(f => '/* ===== ' + f + ' ===== */\n(function(){\n' + fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n})();').join('\n');
html = html.replace(/<script src="data\/taxonomy\.js"><\/script>[\s\S]*?<script>window\.CinemaUI\.init\(\);<\/script>/,
  '<script>\n' + scripts + '\n</script>\n<script>window.CinemaUI.init();</script>');

const out = '/home/user/sangmins-cinema-standalone.html';
fs.writeFileSync(out, html);
console.log('standalone written:', out, fs.statSync(out).size, 'bytes');
console.log('inline style:', html.indexOf('<style>') >= 0, '| inline scripts:', html.indexOf('===== app/ui.js =====') >= 0);
