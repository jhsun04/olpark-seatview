import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { VENUES } from './venues.js';
import { buildCollider, intersect } from './collide.js';
import { eyeOffset, frontBody, HEAD_R } from './body.js';
import { initVisit } from './visit.js';

// 수천 번의 시야 레이 계산을 빠르게 하기 위한 BVH 가속
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const $ = id => document.getElementById(id);
const PERFORMER_H = 1.6;

// ---------- 3D 기본 ----------
const view = $('view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
view.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b2130);
scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3f4a, 2.4));
const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(60, 120, 40); scene.add(sun);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 4000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

function resize() {
  const w = view.clientWidth, h = view.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view);
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

// ---------- 상태 ----------
const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
const cache = {};
const state = {
  key: null, venue: null, model: null, meshes: [], stageGroup: null, stageAngle: 0, center: false, mode: 'overview',
  base: null, eye: null,             // base: 서거나 앉은 면의 점, eye: 계산된 눈 위치
  posture: 'seated', height: 1.65,   // 관람 자세(seated/standing/wheelchair), 내 키(m)
  frontH: 0, front: null,            // 앞사람 키(m, 0이면 없음)와 그 모형
};
const roofClip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);

function loadModel(v) {
  if (!cache[v.model]) cache[v.model] = loader.loadAsync(v.model).then(g => {
    const meshes = [];
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      meshes.push(o);
      if (!o.geometry.boundsTree) o.geometry.computeBoundsTree();
      // 한쪽 면만 있는 바닥·벽을 뒤에서 통과해 '바닥 아래'가 좌석으로 잡히지 않도록 양면으로 충돌 검사
      for (const m of [].concat(o.material)) m.side = THREE.DoubleSide;
    });
    g.scene.userData.collider = buildCollider(meshes);
    return g.scene;
  });
  return cache[v.model];
}

async function setVenue(key, keepEye = null) {
  $('loading').hidden = false;
  const v = VENUES[key];
  const model = await loadModel(v);
  if (state.model) scene.remove(state.model);
  scene.add(model);
  Object.assign(state, { key, venue: v, model, meshes: [] });
  model.traverse(o => { if (o.isMesh) state.meshes.push(o); });
  roofClip.constant = v.clipY;
  $('src').textContent = v.source;
  buildStage();
  renderPresets();
  $('loading').hidden = true;
  if (keepEye) enterSeat(keepEye); else overview();
}

// ---------- 가상 무대 ----------
function stageCenter() {
  const v = state.venue, [cx, cz] = v.center;
  if (state.center) return new THREE.Vector3(cx, v.floorY, cz);
  const a = THREE.MathUtils.degToRad(state.stageAngle);
  return new THREE.Vector3(cx + Math.cos(a) * -v.stageDist, v.floorY, cz + Math.sin(a) * -v.stageDist);
}

function buildStage() {
  if (state.stageGroup) scene.remove(state.stageGroup);
  const v = state.venue, g = new THREE.Group();
  const s = state.center ? { w: 16, d: 16, h: v.stage.h } : v.stage;
  const stage = new THREE.Mesh(new THREE.BoxGeometry(s.d, s.h, s.w), new THREE.MeshStandardMaterial({ color: 0xd9433b }));
  stage.position.y = s.h / 2; g.add(stage);
  if (!state.center) {
    const sc = new THREE.Mesh(new THREE.BoxGeometry(0.3, v.screen.h, v.screen.w),
      new THREE.MeshStandardMaterial({ color: 0x3355ff, emissive: 0x16245e }));
    sc.position.set(-v.screen.back, s.h + v.screen.h / 2 + 1.5, 0); g.add(sc); g.userData.screen = sc;
  }
  g.position.copy(stageCenter());
  g.rotation.y = state.center ? 0 : -THREE.MathUtils.degToRad(state.stageAngle);
  g.userData.size = s;
  scene.add(g); state.stageGroup = g;
}

// ---------- 좌석 높이 찾기 ----------
const ray = new THREE.Raycaster();
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
const col = () => state.model.userData.collider;
function firstHit(origin, dir, far = Infinity) {
  ray.set(origin, dir); ray.far = far;
  return intersect(col(), ray, true)[0];
}
function allHits(origin, dir) {
  ray.set(origin, dir); ray.far = Infinity;
  return intersect(col(), ray, false);
}

// 사람이 앉을 수 있는 면: 위를 향한 면이고 머리 위 2m가 비어 있어야 한다 (지붕 통로·구조물 위 제외)
function isSeatable(h) {
  const n = h.worldNormal || UP;
  if (Math.abs(n.y) < 0.6) return false;
  const above = firstHit(h.point.clone().add(new THREE.Vector3(0, 0.05, 0)), UP, 2.0);
  return !above;
}

function seatAt(r, deg, y) {
  const v = state.venue, [cx, cz] = v.center;
  const a = THREE.MathUtils.degToRad(state.stageAngle + deg);
  const x = cx + Math.cos(a) * -r, z = cz + Math.sin(a) * -r;
  // 위에서 내려다본 '앉을 수 있는 면' 중 가장 낮은 것부터, 경기장 안쪽이 보이는 첫 면을 좌석으로 본다.
  // (지붕 없는 모델에서 조명 트러스·통로 윗면, 또는 객석 아래 로비 바닥이 잡히는 것을 막음)
  const cands = allHits(new THREE.Vector3(x, v.ceilY, z), DOWN).filter(isSeatable).sort((p, q) => p.point.y - q.point.y);
  // 좌석 면 높이(y)를 지정한 대표 좌석은 그 높이에 가장 가까운 면을 쓴다
  const hit = y !== undefined
    ? cands.reduce((b, h) => (!b || Math.abs(h.point.y - y) < Math.abs(b.point.y - y) ? h : b), null)
    : cands.find(h => seesBowl(h.point.clone().add(new THREE.Vector3(0, 1.2, 0)))) || cands.at(-1);
  return hit ? hit.point.clone() : null;
}
function seesBowl(eye) {
  const [cx, cz] = state.venue.center, y = state.venue.floorY + 6;
  return [[0, 0], [8, 0], [-8, 0], [0, 8], [0, -8]].some(([dx, dz]) => {
    const p = new THREE.Vector3(cx + dx, y, cz + dz), d = p.clone().sub(eye), len = d.length();
    return !firstHit(eye, d.normalize(), len - 0.5);
  });
}
const onFloor = p => p.y < state.venue.floorY + 0.25;
function eyeAt(base) { return base.clone().add(new THREE.Vector3(0, eyeOffset(state.posture, state.height), 0)); }

// ---------- 앞사람 ----------
// 무대 쪽으로 한 줄 앞(서 있으면 0.7m, 앉아 있으면 0.9m)에 같은 자세의 사람 모형을 세운다.
// 앞줄 바닥 높이는 그 자리에서 아래로 레이를 쏴서 찾는다(계단식 객석이면 낮아짐).
function placeFront() {
  if (state.front) { scene.remove(state.front); state.front = null; }
  if (!state.frontH || !state.base) return;
  const p = state.posture === 'wheelchair' ? 'seated' : state.posture;
  const toStage = stageCenterPoint().sub(state.base); toStage.y = 0; toStage.normalize();
  const side = new THREE.Vector3(-toStage.z, 0, toStage.x);
  // 앞줄에 3명이 0.5m 간격(어깨가 맞닿는 밀집 상태)으로 나란히 선다. 스탠딩은 밀집해 있으므로 한 줄 더(지그재그) 세운다.
  const pitch = p === 'standing' ? 0.7 : 0.9, rows = p === 'standing' ? 2 : 1;
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a6cff, transparent: true, opacity: 0.45 });
  const crowd = new THREE.Group();
  crowd.userData.rows = []; // 시야 판정용: 줄마다 {내 자리에서 거리, 머리 꼭대기 높이}
  for (let row = 1; row <= rows; row++) {
    const center = state.base.clone().add(toStage.clone().multiplyScalar(pitch * row));
    const ground = firstHit(new THREE.Vector3(center.x, state.base.y + 1.0, center.z), DOWN, 4);
    const gy = ground ? ground.point.y : state.base.y;
    crowd.userData.rows.push({ d: pitch * row, top: gy + frontBody(p, state.frontH).headTop });
    for (const k of [-1, 0, 1]) {
      const pos = center.clone().add(side.clone().multiplyScalar(k * 0.5 + (row % 2 === 0 ? 0.25 : 0)));
      crowd.add(person(p, state.frontH, pos.setY(gy), mat));
    }
  }
  scene.add(crowd); state.front = crowd;
}
// 어깨까지는 어깨너비(옷 포함 약 50cm) 몸통, 목, 머리(지름 약 20cm)
function person(p, h, at, mat) {
  const { shoulder, headTop } = frontBody(p, h), from = p === 'standing' ? 0 : 0.42;
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, shoulder - from, 0.25), mat);
  torso.position.y = from + (shoulder - from) / 2;
  const neckH = headTop - 2 * HEAD_R - shoulder + 0.02;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, Math.max(0.02, neckH), 10), mat);
  neck.position.y = shoulder + neckH / 2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 16, 12), mat);
  head.position.y = headTop - HEAD_R;
  g.add(torso, neck, head); g.position.copy(at);
  return g;
}
function stageCenterPoint() { return state.stageGroup.position.clone(); }

// ---------- 모드 ----------
// 전체 보기에서는 clipY 위(지붕)를 잘라 안을 보이게 한다
function setRoof(visible) { renderer.clippingPlanes = visible ? [] : [roofClip]; }

function overview() {
  state.mode = 'overview'; state.eye = null; state.base = null; placeFront(); setRoof(false);
  const [cx, cz] = state.venue.center, d = state.venue.stageDist * 4;
  camera.fov = 50; camera.updateProjectionMatrix();
  camera.position.set(cx + d * 0.55, state.venue.floorY + d * 0.75, cz + d * 0.55);
  controls.target.set(cx, state.venue.floorY, cz);
  Object.assign(controls, { enableZoom: true, enablePan: false, rotateSpeed: 0.6, minDistance: 20, maxDistance: d * 2, maxPolarAngle: Math.PI * 0.48 });
  $('result').hidden = true; $('hint').hidden = false;
  updateUrl();
}

function performerTarget() {
  const g = state.stageGroup;
  return g.position.clone().add(new THREE.Vector3(0, g.userData.size.h + PERFORMER_H, 0));
}

// 새 자리를 고르면 플로어는 스탠딩, 객석은 착석으로 자세를 맞춘다(휠체어를 골랐으면 유지)
function pickSeat(base) {
  if (state.posture !== 'wheelchair') setPosture(onFloor(base) ? 'standing' : 'seated', false);
  enterSeat(base);
}

function enterSeat(base) {
  state.base = base.clone();
  const eye = eyeAt(base);
  state.mode = 'seat'; state.eye = eye.clone(); setRoof(true);
  placeFront();
  camera.fov = 60; camera.updateProjectionMatrix();
  camera.position.copy(eye);
  const look = performerTarget();
  // 눈 바로 앞을 축으로 돌려서 '고개 돌리기'처럼 둘러보게 함
  controls.target.copy(eye).add(look.sub(eye).normalize().multiplyScalar(0.05));
  Object.assign(controls, { enableZoom: false, enablePan: false, rotateSpeed: -0.35, minDistance: 0, maxDistance: Infinity, maxPolarAngle: Math.PI });
  controls.update();
  $('hint').hidden = true;
  showMetrics(measure(eye));
  updateUrl();
}

// ---------- 시야 측정 ----------
// 눈에서 무대 위 공연자 머리 높이의 격자점·스크린 격자점으로 레이를 쏴, 경기장 구조물(난간, 기둥, 앞 좌석 등)과
// 앞사람 모형에 먼저 막히는지 센다. 공연 장비는 모델에 없으므로 반영되지 않는다.
function fractionVisible(eye, points) {
  let ok = 0, byPerson = 0;
  for (const p of points) {
    const dir = p.clone().sub(eye), dist = dir.length(); dir.normalize();
    if (firstHit(eye, dir, dist - 0.4)) continue;
    if (state.front && blockedByHeads(eye, p)) { byPerson++; continue; }
    ok++;
  }
  return { v: ok / points.length, person: byPerson / points.length };
}

// 앞사람 가림: 시선이 앞줄 위치를 지날 때의 높이가 앞사람 머리 꼭대기보다 낮으면 가린 것으로 본다.
// 머리 사이 틈은 사람이 움직이면 바뀌므로 계산하지 않는다(보수적 판정, 키가 클수록 항상 더 잘 보임).
function blockedByHeads(eye, p) {
  const flat = Math.hypot(p.x - eye.x, p.z - eye.z);
  return state.front.userData.rows.some(r => r.d < flat && eye.y + (p.y - eye.y) * (r.d / flat) < r.top);
}

function stagePoints() {
  const g = state.stageGroup, s = g.userData.size, pts = [];
  // 무대 앞쪽에 선 공연자의 발목·무릎·허리·가슴·머리 높이 × 가로 11곳 (몸이 얼마나 보이는지)
  for (let i = 0; i < 11; i++) for (const hy of [0.1, 0.5, 0.9, 1.3, PERFORMER_H]) {
    const local = new THREE.Vector3(s.d * 0.25, s.h + hy, (i / 10 - 0.5) * s.w * 0.85);
    pts.push(g.localToWorld(local));
  }
  return pts;
}
function screenPoints() {
  const sc = state.stageGroup.userData.screen; if (!sc) return null;
  const { w, h } = state.venue.screen, pts = [];
  for (let i = 0; i < 9; i++) for (let j = 0; j < 5; j++) pts.push(sc.localToWorld(new THREE.Vector3(0.3, (j / 4 - 0.5) * h * 0.85, (i / 8 - 0.5) * w * 0.85)));
  return pts;
}

function measure(eye) {
  const target = performerTarget();
  const dist = eye.distanceTo(target);
  const sp = screenPoints(), st = fractionVisible(eye, stagePoints()), sc = sp ? fractionVisible(eye, sp) : null;
  return { dist, stage: st.v, stagePerson: st.person, screen: sc ? sc.v : null };
}

function grade(f) { return f >= 0.9 ? ['잘 보임', 'good'] : f >= 0.6 ? ['일부 가림', 'mid'] : ['많이 가림', 'bad']; }

function showMetrics(m) {
  $('result').hidden = false;
  $('m-dist').textContent = `약 ${Math.round(m.dist)}m`;
  const [gs, cs] = grade(m.stage);
  $('m-stage').innerHTML = `<span class="${cs}">${Math.round(m.stage * 100)}% · ${gs}</span>`;
  if (m.screen === null) $('m-screen').textContent = '센터 무대(스크린 없음)';
  else { const [g2, c2] = grade(m.screen); $('m-screen').innerHTML = `<span class="${c2}">${Math.round(m.screen * 100)}% · ${g2}</span>`; }
  const d = m.dist;
  let t = d < 25 ? '공연자의 표정까지 맨눈으로 보이는 거리예요.'
        : d < 50 ? '동작은 맨눈으로 보이지만, 표정은 스크린으로 보게 되는 거리예요.'
        : '맨눈으로는 무대 전체 분위기를 보고, 공연자는 주로 스크린으로 보게 되는 거리예요.';
  if (state.frontH) t += m.stagePerson >= 0.05
    ? ` 앞사람 머리가 정면에 있으면 공연자 모습의 ${Math.round(m.stagePerson * 100)}%가 가려져요(머리 사이 틈으로 보이는 경우는 계산하지 않은 보수적인 값).`
    : ' 앞사람 머리 위로 공연자가 보여요.';
  if (m.stage + m.stagePerson < 0.6) t += ' 난간·구조물 때문에 무대 일부가 가려져요. 시야제한석인지 예매 전에 확인해 보세요.';
  $('m-text').textContent = t;
  $('m-eye').textContent = `눈높이: 바닥에서 약 ${Math.round(eyeOffset(state.posture, state.height) * 100)}cm`;
}

// ---------- 관람 조건 (자세·키·앞사람) ----------
function setPosture(p, refresh = true) {
  state.posture = p;
  for (const b of document.querySelectorAll('[data-posture]')) b.setAttribute('aria-pressed', b.dataset.posture === p);
  $('height-row').hidden = p === 'wheelchair';
  if (refresh) refreshSeat();
}
function refreshSeat() { if (state.mode === 'seat') enterSeat(state.base); else updateUrl(); }
for (const b of document.querySelectorAll('[data-posture]')) b.onclick = () => setPosture(b.dataset.posture);
function setHeight(cm) {
  const v = Math.min(195, Math.max(120, Math.round(cm) || 165));
  state.height = v / 100; $('height').value = v; $('height-val').textContent = v;
}
$('height').oninput = e => { setHeight(+e.target.value); };
$('height').onchange = () => refreshSeat();
for (const b of document.querySelectorAll('[data-height]')) b.onclick = () => { setHeight(+b.dataset.height); refreshSeat(); };
$('front').onchange = e => { state.frontH = +e.target.value / 100; refreshSeat(); };

// ---------- 입력 ----------
let down = null;
renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!down || state.mode !== 'overview') return;
  const moved = Math.hypot(e.clientX - down[0], e.clientY - down[1]); down = null;
  if (moved > 6) return;
  const r = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera); ray.far = Infinity;
  const hit = intersect(col(), ray, false).find(h => h.point.y < state.venue.clipY);
  if (hit) pickSeat(hit.point);
});

function renderPresets() {
  const box = $('presets'); box.innerHTML = '';
  for (const p of state.venue.presets) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = p.label;
    b.onclick = () => { const base = seatAt(p.r, p.a, p.y); if (base) pickSeat(base); };
    box.appendChild(b);
  }
}

$('venue').onchange = e => setVenue(e.target.value);
$('stage').onchange = e => {
  const v = e.target.value; state.center = v === 'center'; state.stageAngle = state.center ? 0 : +v.slice(3);
  if (!state.venue) return; // 첫 로딩 전(공유 링크 복원)에는 값만 저장
  buildStage();
  if (state.mode === 'seat') enterSeat(state.base); else updateUrl();
};
$('overview').onclick = () => overview();
$('share').onclick = async () => {
  try { await navigator.clipboard.writeText(location.href); $('share').textContent = '링크를 복사했어요'; }
  catch { $('share').textContent = '주소창의 링크를 복사해 주세요'; }
  setTimeout(() => { $('share').textContent = '이 자리 링크 복사'; }, 2000);
};

// ---------- 공유 링크 ----------
function updateUrl() {
  const q = new URLSearchParams({ v: state.key, s: $('stage').value, pose: state.posture, h: Math.round(state.height * 100), f: Math.round(state.frontH * 100) });
  if (state.base) q.set('b', state.base.toArray().map(n => n.toFixed(2)).join(','));
  history.replaceState(null, '', '?' + q);
}

const q = new URLSearchParams(location.search);
const startKey = VENUES[q.get('v')] ? q.get('v') : 'kspodome';
$('venue').value = startKey;
if (q.get('s')) { $('stage').value = q.get('s'); $('stage').dispatchEvent(new Event('change')); }
setHeight(+q.get('h') || 165);
setPosture(['seated', 'standing', 'wheelchair'].includes(q.get('pose')) ? q.get('pose') : 'seated', false);
if ([0, 160, 170, 185].includes(+q.get('f'))) { $('front').value = q.get('f'); state.frontH = +q.get('f') / 100; }
const p = q.get('b')?.split(',').map(Number);
setVenue(startKey, p?.length === 3 && p.every(Number.isFinite) ? new THREE.Vector3(...p) : null)
  .catch(err => { $('loading').textContent = '3D 모델을 불러오지 못했어요. 새로고침해 주세요.'; console.error(err); });

initVisit();

window.__app = { state, measure, seatAt, enterSeat, pickSeat, setPosture, setHeight, overview, camera, THREE }; // 점검용
