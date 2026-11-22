// node tools/body.test.mjs
import assert from 'node:assert/strict';
import { eyeOffset, frontBody } from '../app/body.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
close(eyeOffset('standing', 1.65), 1.5345);
close(eyeOffset('seated', 1.65), 0.42 + 0.726);
close(eyeOffset('wheelchair', 1.9), 1.18); // 휠체어는 키와 무관
assert.ok(eyeOffset('seated', 1.4) < eyeOffset('seated', 1.9)); // 키가 클수록 눈이 높다
for (const p of ['standing', 'seated']) {
  const b = frontBody(p, 1.7);
  assert.ok(b.shoulder < eyeOffset(p, 1.7) && eyeOffset(p, 1.7) < b.headTop, p); // 어깨 < 눈 < 머리 꼭대기
}
close(frontBody('standing', 1.8).headTop, 1.8);
console.log('body ok');
