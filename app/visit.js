// 공연 날 주차·혼잡 안내: data/summary.json (tools/analyze.mjs 결과)을 화면에 보여 준다.
const $ = id => document.getElementById(id);

function chart(a, b) {
  // a: 공연 있는 주말, b: 공연 없는 주말 (시간대별 평균 주차 차량 수)
  const W = 280, Hh = 120, P = 22, max = Math.max(...a, ...b) * 1.1;
  const x = h => P + (h / 23) * (W - P - 6), y = v => Hh - 16 - (v / max) * (Hh - 26);
  const line = (arr, c) => `<polyline fill="none" stroke="${c}" stroke-width="2.2" points="${arr.map((v, h) => `${x(h).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/>`;
  const ticks = [0, 6, 12, 18, 23].map(h => `<text x="${x(h)}" y="${Hh - 3}" font-size="9" fill="#9aa4b5" text-anchor="middle">${h}시</text>`).join('');
  const peak = a.indexOf(Math.max(...a));
  return `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="공연 있는 주말과 없는 주말의 시간대별 주차 차량 수">
    <line x1="${P}" y1="${Hh - 16}" x2="${W - 6}" y2="${Hh - 16}" stroke="#2a3140"/>${ticks}
    ${line(b, '#9aa4b5')}${line(a, '#ff5a4e')}
    <circle cx="${x(peak)}" cy="${y(a[peak])}" r="3.5" fill="#ff5a4e"/>
    <text x="${x(peak)}" y="${y(a[peak]) - 6}" font-size="10" fill="#ff5a4e" text-anchor="middle">${a[peak].toLocaleString()}대</text>
  </svg>
  <div class="legend"><span><i style="background:#ff5a4e"></i>공연 있는 주말</span><span><i style="background:#9aa4b5"></i>공연 없는 주말</span></div>`;
}

export async function initVisit() {
  let s;
  try { s = await (await fetch('data/summary.json')).json(); } catch { $('visit').hidden = true; return; }
  const p = s.parking.profiles, ev = p.eventWeekend.profile, pl = p.plainWeekend.profile;
  $('park-chart').innerHTML = chart(ev, pl);
  const pk = ev.indexOf(Math.max(...ev)), ratio = Math.round((ev[pk] / pl[pk] - 1) * 100);
  $('park-text').textContent =
    `2024년 7월 실제 입출차 기록(동2·남2·북2문, ${s.parking.records.toLocaleString()}건)을 보면, 공연이 있던 주말은 ${pk}시에 주차 차량이 약 ${ev[pk].toLocaleString()}대로 ` +
    `공연 없는 주말 같은 시각(약 ${pl[pk].toLocaleString()}대)보다 약 ${ratio}% 많았어요. 공연이 끝나는 20시에도 약 ${ev[20].toLocaleString()}대로, 평소 주말(약 ${pl[20].toLocaleString()}대)의 두 배가 넘었어요. ` +
    `공연 날은 대중교통 이용을 권해요. (공연 주말 ${p.eventWeekend.days}일·평일 ${p.eventWeekday.days}일 기준의 표본이라 참고용이에요)`;

  const zones = Object.entries(s.congestion.byZone).map(([z, c]) => [z, c['만차']]).sort((a, b) => b[1] - a[1]).slice(0, 3);
  $('zone-text').textContent = `주차장 혼잡도 기록(${s.congestion.records}건)에서 '만차'가 가장 많이 기록된 구역: ${zones.map(([z, n]) => `${z}(${n}회)`).join(', ')}. ` +
    `출처: ${Object.values(s.sources).join(' / ')}`;

  const list = $('show-list'), names = [...new Set(s.shows2025.map(x => x.name))].sort();
  list.innerHTML = names.map(n => `<option value="${n.replace(/"/g, '&quot;')}">`).join('');
  $('show-q').addEventListener('change', e => {
    const hits = s.shows2025.filter(x => x.name === e.target.value);
    if (!hits.length) { $('show-info').textContent = '목록에서 공연을 골라 주세요.'; return; }
    const aud = Math.max(...hits.map(x => x.audience));
    const dates = hits.map(x => `${x.date.slice(5).replace('-', '/')} ${x.from}~${x.to}시`).join(', ');
    $('show-info').textContent = `${hits[0].name}: ${dates}${aud ? ` · 관람객 약 ${aud.toLocaleString()}명` : ''}. 공연장은 위 메뉴에서 골라 좌석 시야를 확인하세요.`;
  });
}
