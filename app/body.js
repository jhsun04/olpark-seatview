// 관람객 몸 치수 근사. 단위 m.
// 비율은 일반적인 인체 비율에 따른 근사값이다 (공식 인체치수 통계를 적용한 값이 아님).
//  - 선 눈높이 ≈ 키 × 0.93, 선 어깨높이 ≈ 키 × 0.82
//  - 앉은 눈높이(의자 면 위) ≈ 키 × 0.44, 앉은 어깨높이(의자 면 위) ≈ 키 × 0.34, 의자 면 높이 0.42m
//  - 앉은 머리 꼭대기(의자 면 위) ≈ 키 × 0.52
//  - 휠체어 이용 눈높이(바닥 위) ≈ 1.18m
export const SEAT_H = 0.42, WHEELCHAIR_EYE = 1.18, HEAD_R = 0.1;

export function eyeOffset(posture, heightM) {
  if (posture === 'wheelchair') return WHEELCHAIR_EYE;
  if (posture === 'standing') return heightM * 0.93;
  return SEAT_H + heightM * 0.44; // seated
}

// 앞사람 모형 치수(그 사람이 선 바닥/좌석 단 위): 어깨높이, 머리 꼭대기
export function frontBody(posture, heightM) {
  return posture === 'standing'
    ? { shoulder: heightM * 0.82, headTop: heightM }
    : { shoulder: SEAT_H + heightM * 0.34, headTop: SEAT_H + heightM * 0.52 };
}
