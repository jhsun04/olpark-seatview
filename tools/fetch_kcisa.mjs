// 문화공공데이터광장 API_CPM_009 (한국체육산업개발 올림픽공원 2025 차량입출차·공연·날씨 연계 데이터) 수집.
// 사용: node fetch_kcisa.mjs            → ../.env 의 KCISA_KEY 로 전체 수집 → raw/kcisa_675.json, app/data/olpark2025.json
//       node fetch_kcisa.mjs --selftest → 설명문 파싱 자체 점검
// 키는 출력하지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const base = path.resolve(import.meta.dirname, '..');
const KEYS = ['주차대수', '방문객', '기온', '풍향', '강수량', '습도', '휴일', '공연명', '공연관람객수'];

// "주차대수:19,방문객:57, 기온:-3.4, ... ,공연명:A, B 콘서트,공연관람객수:0"
// 공연명에 쉼표가 들어갈 수 있어 '알려진 항목명:' 위치로 자른다.
export function parseDesc(s) {
  const re = new RegExp(`(${KEYS.join('|')}):`, 'g');
  const marks = [...s.matchAll(re)].map(m => ({ k: m[1], start: m.index, valStart: m.index + m[0].length }));
  const out = {};
  marks.forEach((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].start : s.length;
    out[m.k] = s.slice(m.valStart, end).replace(/[,\s]+$/, '').trim();
  });
  const num = v => (v === undefined || v === '' ? null : Number(v));
  return {
    cars: num(out['주차대수']), visitors: num(out['방문객']), temp: num(out['기온']), wind: num(out['풍향']),
    rain: num(out['강수량']), humidity: num(out['습도']), holiday: out['휴일'] || '', show: out['공연명'] || '',
    audience: num(out['공연관람객수']),
  };
}

function selftest() {
  const a = parseDesc('주차대수:19,방문객:57, 기온:-3.4, 풍향:3.6, 강수량:, 습도:27,휴일:,공연명:,공연관람객수:0');
  assert.deepEqual(a, { cars: 19, visitors: 57, temp: -3.4, wind: 3.6, rain: null, humidity: 27, holiday: '', show: '', audience: 0 });
  const b = parseDesc('주차대수:812,방문객:2436, 기온:21.0, 풍향:1.2, 강수량:0.5, 습도:60,휴일:Y,공연명:2025 A, B 콘서트,공연관람객수:9000');
  assert.equal(b.show, '2025 A, B 콘서트'); assert.equal(b.audience, 9000); assert.equal(b.rain, 0.5); assert.equal(b.holiday, 'Y');
  console.log('selftest ok');
}

function readKey() {
  const env = fs.readFileSync(path.join(base, '.env'), 'utf8');
  const m = env.match(/^KCISA_KEY=(.+)$/m);
  if (!m || !m[1].trim()) throw new Error('.env 에 KCISA_KEY= 값이 없습니다');
  return m[1].trim();
}

// JSON 응답을 우선 요청하고, XML이 오면 <item> 단위로 읽는다.
function itemsFrom(text) {
  try {
    const j = JSON.parse(text);
    const body = j.response?.body ?? j.body ?? j;
    const items = body.items?.item ?? body.items ?? [];
    return { items: Array.isArray(items) ? items : [items], total: Number(body.totalCount ?? 0), code: j.response?.header?.resultCode };
  } catch {
    const get = (blk, tag) => (blk.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)) || [])[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    const items = [...text.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => ({
      TITLE: get(m[1], 'TITLE') ?? get(m[1], 'title'), ISSUED_DATE: get(m[1], 'ISSUED_DATE') ?? get(m[1], 'issuedDate'),
      DESCRIPTION: get(m[1], 'DESCRIPTION') ?? get(m[1], 'description'), LOCAL_ID: get(m[1], 'LOCAL_ID') ?? get(m[1], 'localId'),
    }));
    return { items, total: Number(get(text, 'totalCount') ?? 0), code: get(text, 'resultCode') };
  }
}

async function fetchAll() {
  const key = readKey();
  const rows = [];
  for (let page = 1; page < 100; page++) {
    if (page > 1) await new Promise(r => setTimeout(r, 2500)); // API 제한: 2초에 1회
    const url = `https://api.kcisa.kr/openapi/API_CPM_009/request?serviceKey=${encodeURIComponent(key)}&numOfRows=1000&pageNo=${page}`;
    let res, text;
    for (let tryNo = 1; ; tryNo++) { // 429(호출 제한)이면 기다렸다가 다시 시도
      res = await fetch(url, { headers: { Accept: 'application/json' } });
      text = await res.text();
      if (res.status !== 429 || tryNo >= 8) break;
      console.log(`호출 제한, ${tryNo * 5}초 대기 후 재시도`);
      await new Promise(r => setTimeout(r, tryNo * 5000));
    }
    const { items, total, code } = itemsFrom(text);
    if (!res.ok || (code && code !== '0000' && code !== '00')) {
      throw new Error(`API 오류: HTTP ${res.status}, 결과코드 ${code ?? '-'} — ${text.slice(0, 200).replaceAll(key, '***')}`);
    }
    rows.push(...items);
    console.log(`page ${page}: ${items.length}건 (누적 ${rows.length}/${total || '?'})`);
    if (!items.length || (total && rows.length >= total)) break;
  }
  return rows;
}

if (process.argv.includes('--selftest')) selftest();
else {
  selftest();
  const raw = await fetchAll();
  fs.mkdirSync(path.join(base, 'raw'), { recursive: true });
  fs.writeFileSync(path.join(base, 'raw', 'kcisa_675.json'), JSON.stringify(raw));
  const rows = raw.map(r => {
    const t = String(r.ISSUED_DATE ?? r.issuedDate ?? '');
    return { date: t.slice(0, 10), hour: Number(t.slice(11, 13)), id: Number(r.LOCAL_ID ?? r.localId), ...parseDesc(String(r.DESCRIPTION ?? r.description ?? '')) };
  }).filter(r => r.date).sort((a, b) => (a.date + a.hour).localeCompare(b.date + b.hour));
  fs.mkdirSync(path.join(base, 'app', 'data'), { recursive: true });
  fs.writeFileSync(path.join(base, 'app', 'data', 'olpark2025.json'), JSON.stringify(rows));
  console.log(`저장: ${rows.length}건, 기간 ${rows[0]?.date} ~ ${rows.at(-1)?.date}, 공연 있는 시간대 ${rows.filter(r => r.show).length}건`);
}
