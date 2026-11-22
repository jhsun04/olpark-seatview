// 한국체육산업개발 공공데이터 분석 → app/data/summary.json
//  1) 올림픽공원 입출차 정보(2024-07, 동2·남2·북2문): 시간대별 주차 중인 차량 수
//  2) 영문 공연정보: 2024-07 공연 날짜 → 공연일 vs 비공연일 비교
//  3) 주차장 혼잡도 정보: 주차구역별 '만차·혼잡' 기록 수, 시간대
//  4) 2025 공연 연계 데이터(문화공공데이터광장): 공연 목록·관람객 규모·공연 시간대
// 사용: node analyze.mjs
import fs from 'node:fs';
import path from 'node:path';

const base = path.resolve(import.meta.dirname, '..');
const dir = path.join(base, 'raw', 'files');
const dec = new TextDecoder('euc-kr');
function csv(name) {
  const text = dec.decode(fs.readFileSync(path.join(dir, name)));
  const lines = text.split(/\r?\n/).filter(Boolean);
  const split = l => (l.match(/("([^"]|"")*"|[^,]*)(,|$)/g) || []).slice(0, -1).map(c => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));
  const head = split(lines[0]);
  return lines.slice(1).map(l => Object.fromEntries(split(l).map((v, i) => [head[i], v])));
}
const find = kw => fs.readdirSync(dir).find(f => f.includes(kw));
const parseT = s => { const m = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)/.exec(s || ''); return m ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]) : null; };
const H = 3600e3;

// ---------- 1) 입출차 → 시간대별 재차 대수 ----------
const io = csv(find('입출차'));
const start = Date.UTC(2024, 6, 1), days = 31;
const occ = new Float64Array(days * 24); // 각 시각 정각에 주차 중인 차량 수
const entries = new Float64Array(days * 24);
let noExit = 0, bad = 0;
for (const r of io) {
  const a = parseT(r['입차일시']); let b = parseT(r['출차일시']);
  if (a === null) { bad++; continue; }
  if (b === null || b < a) { noExit++; b = a + 24 * H; } // 출차 기록 없음(장기 주차): 24시간으로 제한
  const ia = Math.floor((a - start) / H); if (ia >= 0 && ia < days * 24) entries[ia]++;
  for (let k = Math.ceil((a - start) / H); k * H + start < b && k < days * 24; k++) if (k >= 0) occ[k]++;
}

// ---------- 2) 2024-07 공연 날짜 ----------
const shows = csv(find('영문'));
const july = shows.filter(r => (r['공연일자'] || '').startsWith('2024-07'));
const eventDays = new Set(july.map(r => +r['공연일자'].slice(8, 10)));

const dayStats = [];
for (let d = 0; d < days; d++) {
  const hours = Array.from(occ.slice(d * 24, d * 24 + 24));
  const peak = Math.max(...hours), peakHour = hours.indexOf(peak);
  const dow = new Date(start + d * 24 * H).getUTCDay();
  dayStats.push({ day: d + 1, dow, event: eventDays.has(d + 1), peak, peakHour, hours });
}
const avgProfile = list => Array.from({ length: 24 }, (_, h) => Math.round(list.reduce((s, x) => s + x.hours[h], 0) / Math.max(1, list.length)));
const isWeekend = x => x.dow === 0 || x.dow === 6;
const groups = {
  eventWeekend: dayStats.filter(x => x.event && isWeekend(x)), eventWeekday: dayStats.filter(x => x.event && !isWeekend(x)),
  plainWeekend: dayStats.filter(x => !x.event && isWeekend(x)), plainWeekday: dayStats.filter(x => !x.event && !isWeekend(x)),
};
const profiles = Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, { days: v.length, profile: avgProfile(v) }]));

// ---------- 3) 혼잡도 ----------
const cg = csv(find('혼잡도'));
const byZone = {}, byHour = Array(24).fill(0);
for (const r of cg) {
  const z = r['주차구역'], lv = r['혼잡도'];
  byZone[z] ??= { 원활: 0, 혼잡: 0, 만차: 0 };
  if (lv in byZone[z]) byZone[z][lv]++;
  if (lv !== '원활') byHour[+String(r['등록시간']).slice(0, 2)]++;
}

// ---------- 4) 2025 공연(연계 데이터) ----------
const p2025 = fs.existsSync(path.join(base, 'raw', 'kcisa_675.json')) ? JSON.parse(fs.readFileSync(path.join(base, 'raw', 'kcisa_675.json'), 'utf8')) : [];
const showMap = new Map();
for (const r of p2025) {
  const m = /공연명:(.*),공연관람객수:(\d+)/s.exec(r.TITLE || '');
  if (!m || !m[1].trim()) continue;
  const date = r.ISSUED_DATE.slice(0, 10), hour = +r.ISSUED_DATE.slice(11, 13);
  for (const name of m[1].split(/\s*,\s*(?=\S)/).map(s => s.trim()).filter(Boolean)) {
    const key = name + '|' + date;
    const s = showMap.get(key) || { name, date, hours: [], audience: +m[2] };
    s.hours.push(hour); s.audience = Math.max(s.audience, +m[2]); showMap.set(key, s);
  }
}
const shows2025 = [...showMap.values()].map(s => ({ name: s.name, date: s.date, from: Math.min(...s.hours), to: Math.max(...s.hours) + 1, audience: s.audience }))
  .sort((a, b) => (a.date + a.name).localeCompare(b.date + b.name));

const summary = {
  generated: new Date().toISOString().slice(0, 10),
  sources: {
    parking: '한국체육산업개발 「올림픽공원 입출차 정보」 2024-07 (동2문·남2문·북2문), 공공데이터포털 15138735',
    showsEn: '한국체육산업개발 「영문 공연정보」, 공공데이터포털 15149169',
    congestion: '한국체육산업개발 「주차장 혼잡도 정보」, 공공데이터포털 15164156',
    shows2025: '한국체육산업개발 「올림픽공원 2025 차량입출차, 공연, 날씨정보 등 연계 데이터」, 문화공공데이터광장 API_CPM_009',
  },
  parking: { records: io.length, noExit, bad, eventDays: [...eventDays].sort((a, b) => a - b), julyShows: july.map(r => ({ date: r['공연일자'], title: r['공연제목'] })), profiles, days: dayStats.map(({ hours, ...x }) => x) },
  congestion: { records: cg.length, byZone, byHour },
  shows2025,
};
fs.mkdirSync(path.join(base, 'app', 'data'), { recursive: true });
fs.writeFileSync(path.join(base, 'app', 'data', 'summary.json'), JSON.stringify(summary));

// 확인용 요약 출력
console.log('입출차', io.length, '건 (출차 없음', noExit, ', 오류', bad, ')');
console.log('2024-07 공연일:', [...eventDays].sort((a, b) => a - b).join(','), ' 공연', july.length, '건');
for (const [k, v] of Object.entries(profiles)) console.log(k, v.days + '일', '시간대별 평균 재차:', v.profile.join(' '));
console.log('혼잡도 기록', cg.length, '건, 구역별:', JSON.stringify(byZone));
console.log('혼잡·만차 시간대:', byHour.join(' '));
console.log('2025 공연(공연명×날짜)', shows2025.length, '건, 예:', shows2025.slice(0, 3));
