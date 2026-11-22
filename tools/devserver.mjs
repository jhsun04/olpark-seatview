// 개발용 로컬 서버: app/ 와 raw/ 를 정적 제공하고, PUT /save/<이름> 으로 받은 파일을 raw/ 에 저장한다.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const base = path.resolve(import.meta.dirname, '..');
const roots = { '/raw/': path.join(base, 'raw'), '/': path.join(base, 'app') };
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.dae': 'model/vnd.collada+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.css': 'text/css' };

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (req.method === 'PUT' && url.startsWith('/save/')) {
    const name = path.basename(url.slice(6));
    const out = fs.createWriteStream(path.join(base, 'raw', name));
    req.pipe(out).on('finish', () => { res.end('saved ' + name); });
    return;
  }
  const prefix = url.startsWith('/raw/') ? '/raw/' : '/';
  const file = path.join(roots[prefix], url.slice(prefix.length) || 'index.html');
  if (!file.startsWith(roots[prefix]) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('Content-Type', types[path.extname(file).toLowerCase()] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(8766, '127.0.0.1', () => console.log('ready http://127.0.0.1:8766'));
