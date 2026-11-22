// 시야·좌석 계산용 충돌 검사.
// KSPO DOME 모델은 좌석·난간 등 10만 개가 InstancedMesh라 기본 레이캐스트가 수 초 걸린다.
// 복제본마다 경계 구(球)를 미리 계산해 두고, 레이가 구에 닿는 복제본만 정밀 검사한다.
import * as THREE from 'three';

export function buildCollider(meshes) {
  const plain = [], inst = [];
  const centers = [], radii = [];
  const m4 = new THREE.Matrix4(), v = new THREE.Vector3();
  for (const m of meshes) {
    m.updateWorldMatrix(true, false);
    if (!m.isInstancedMesh) { plain.push(m); continue; }
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    const bs = m.geometry.boundingSphere;
    for (let i = 0; i < m.count; i++) {
      m.getMatrixAt(i, m4); m4.premultiply(m.matrixWorld);
      v.copy(bs.center).applyMatrix4(m4);
      centers.push(v.x, v.y, v.z); radii.push(bs.radius * m4.getMaxScaleOnAxis());
      inst.push([m, i]);
    }
  }
  return { plain, inst, centers: new Float32Array(centers), radii: new Float32Array(radii) };
}

const tmp = new THREE.Mesh(), m4 = new THREE.Matrix4(), nm = new THREE.Matrix3();

// 거리순으로 정렬된 충돌 목록. 각 항목에 worldNormal(월드 좌표 면 법선)을 붙인다.
export function intersect(col, raycaster, firstOnly) {
  const { origin: o, direction: d } = raycaster.ray, far = raycaster.far;
  raycaster.firstHitOnly = firstOnly;
  const hits = raycaster.intersectObjects(col.plain, false);
  for (const h of hits) h.worldNormal = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : null;

  const C = col.centers, R = col.radii;
  const cand = [];
  for (let k = 0, n = R.length; k < n; k++) {
    const cx = C[3 * k] - o.x, cy = C[3 * k + 1] - o.y, cz = C[3 * k + 2] - o.z;
    const t = cx * d.x + cy * d.y + cz * d.z, r = R[k];
    if (t < -r || t - r > far) continue;
    const dd = cx * cx + cy * cy + cz * cz - t * t;
    if (dd <= r * r) cand.push(k);
  }
  const out = [];
  for (const k of cand) {
    const [im, i] = col.inst[k];
    im.getMatrixAt(i, m4); tmp.geometry = im.geometry; tmp.material = im.material;
    tmp.matrixWorld.multiplyMatrices(im.matrixWorld, m4);
    out.length = 0; tmp.raycast(raycaster, out);
    for (const h of out) {
      h.object = im; h.instanceId = i;
      h.worldNormal = h.face ? h.face.normal.clone().applyMatrix3(nm.getNormalMatrix(tmp.matrixWorld)).normalize() : null;
      hits.push(h);
    }
  }
  hits.sort((a, b) => a.distance - b.distance);
  return firstOnly ? hits.slice(0, 1) : hits;
}
