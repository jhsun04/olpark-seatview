# 올팍 좌석뷰 — 내 자리에서 본 무대

한국체육산업개발(주) 2026 공공데이터 활용 경진대회 출품용 웹 서비스.
마감: 2026-12-01(화) 18:00, data@ksponco.or.kr

## 폴더
- `app/` 배포되는 정적 웹 (서버 불필요)
  - `models/` 웹용으로 경량화한 3D 모델 (KSPO DOME 7MB, 티켓링크 라이브 아레나 4.3MB)
  - `vendor/` three.js 0.170, three-mesh-bvh 0.8.3 (CDN 없이 동작하도록 포함, MIT 라이선스)
  - `venues.js` 공연장별 좌표·대표 좌석 설정, `collide.js` 시야 계산용 충돌 검사, `app.js` 화면
  - `probe.html`, `convert.html` 개발용 (배포 시 제외)
- `raw/` 원본 데이터 (한국체육산업개발 공식 다운로드, 배포 제외)
- `tools/` 변환·개발 도구 (`devserver.mjs`: 로컬 확인용 서버)

## 로컬에서 보기
```
node tools/devserver.mjs
```
→ http://127.0.0.1:8766/

## 데이터 출처
- 한국체육산업개발 「올림픽공원 공연장 실감형 콘텐츠」 (공공데이터포털 15127487, 이용허락범위 제한 없음)
  - KSPO DOME: kspodome_dae.zip(DAE) → GLB 변환 → 단순화·meshopt 압축
  - SK핸드볼경기장(현 티켓링크 라이브 아레나): skhandball_glb.zip(SKHandBall_simLab.glb) → 단순화·압축

## 알려진 한계
- 빨간 무대·파란 스크린은 가상 배치. 실제 공연의 무대·장비·앞사람은 반영되지 않음
- 아레나 모델은 지붕 덮개가 없고 객석 위 트러스가 있어 대표 좌석의 좌석 면 높이를 측정해 지정함
- 좌석 구역 번호와 3D 위치 연결은 아직 안 됨
