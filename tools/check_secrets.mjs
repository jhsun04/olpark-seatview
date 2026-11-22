// 배포 대상 파일에 .env의 키 값이 들어 있지 않은지 검사한다 (키 값은 출력하지 않음).
// 사용: node check_secrets.mjs <검사할 폴더>...
import fs from 'node:fs';
import path from 'node:path';

const base = path.resolve(import.meta.dirname, '..');
const env = fs.existsSync(path.join(base, '.env')) ? fs.readFileSync(path.join(base, '.env'), 'utf8') : '';
const secrets = [...env.matchAll(/^[A-Z_]+=(.+)$/gm)].map(m => m[1].trim()).filter(v => v.length >= 8);
let found = 0, files = 0;
function walk(p) {
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const f = path.join(p, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.git') walk(f); continue; }
    check(f);
  }
}
function check(f) {
  files++;
  const buf = fs.readFileSync(f);
  for (const s of secrets) if (buf.includes(s) || buf.includes(encodeURIComponent(s))) { console.log('키 발견:', path.relative(base, f)); found++; }
}
for (const d of process.argv.slice(2)) { const p = path.resolve(base, d); fs.statSync(p).isDirectory() ? walk(p) : check(p); }
console.log(`검사 파일 ${files}개, 검사한 키 ${secrets.length}개, 발견 ${found}건`);
process.exit(found ? 1 : 0);
