// 관람객 몸 치수 근사. 단위 m.
// 비율은 근사값이다. 눈높이·앉은눈높이·앉은키는 사이즈코리아 20대 남성 표준체형 공개 수치
// (키 1.73m, 눈높이 1.62m, 앉은눈높이 0.82m, 앉은키 0.93m)의 키 대비 비율에서 가져왔고, 어깨 비율은 근사값이다.
//  - 선 눈높이 ≈ 키 × 0.93, 선 어깨높이 ≈ 키 × 0.82
//  - 앉은 눈높이(의자 면 위) ≈ 키 × 0.47, 앉은 어깨높이(의자 면 위) ≈ 키 × 0.34, 의자 면 높이 0.42m
//  - 앉은 머리 꼭대기(의자 면 위) ≈ 키 × 0.54
//  - 휠체어 이용 눈높이(바닥 위) ≈ 1.18m
export const SEAT_H = 0.42, WHEELCHAIR_EYE = 1.18, HEAD_R = 0.1;

export function eyeOffset(posture, heightM) {
  if (posture === 'wheelchair') return WHEELCHAIR_EYE;
  if (posture === 'standing') return heightM * 0.93;
  return SEAT_H + heightM * 0.47; // seated
}

// 앞사람 모형 치수(그 사람이 선 바닥/좌석 단 위): 어깨높이, 머리 꼭대기
export function frontBody(posture, heightM) {
  return posture === 'standing'
    ? { shoulder: heightM * 0.82, headTop: heightM }
    : { shoulder: SEAT_H + heightM * 0.34, headTop: SEAT_H + heightM * 0.54 };
}
