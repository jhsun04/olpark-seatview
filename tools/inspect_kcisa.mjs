// 수집한 연계 데이터의 구성·품질 점검
import fs from 'node:fs';
import path from 'node:path';
const base = path.resolve(import.meta.dirname, '..');
const raw = JSON.parse(fs.readFileSync(path.join(base, 'raw', 'kcisa_675.json'), 'utf8'));
const rows = JSON.parse(fs.readFileSync(path.join(base, 'app', 'data', 'olpark2025.json'), 'utf8'));

console.log('원본 항목 키:', Object.keys(raw[0]));
console.log('설명문 예시 3개:'); raw.slice(0, 3).forEach(r => console.log('  ', r.DESCRIPTION ?? r.description));
const withShowText = raw.filter(r => /공연명:[^,]/.test(r.DESCRIPTION ?? '')).slice(0, 5);
console.log('공연명이 채워진 설명문 예시:', withShowText.length ? withShowText.map(r => r.DESCRIPTION) : '없음');
const descKeys = new Set(); raw.forEach(r => (String(r.DESCRIPTION ?? '').match(/[가-힣A-Za-z]+(?=:)/g) || []).forEach(k => descKeys.add(k)));
console.log('설명문에 나오는 항목명:', [...descKeys]);

const days = new Set(rows.map(r => r.date));
const hours = {}; rows.forEach(r => { hours[r.hour] = (hours[r.hour] || 0) + 1; });
console.log('일수:', days.size, ' 시간대별 행 수:', hours);
const cars = rows.map(r => r.cars).filter(v => v !== null).sort((a, b) => a - b);
console.log('주차대수 최소/중앙/최대:', cars[0], cars[Math.floor(cars.length / 2)], cars.at(-1));
const ratio = rows.filter(r => r.cars).map(r => r.visitors / r.cars);
console.log('방문객/주차대수 비율 종류:', [...new Set(ratio.map(v => v.toFixed(2)))].slice(0, 10));
console.log('공연관람객수>0 행:', rows.filter(r => r.audience > 0).length, ' 휴일 값 종류:', [...new Set(rows.map(r => r.holiday))]);
console.log('ID 범위:', Math.min(...rows.map(r => r.id)), '~', Math.max(...rows.map(r => r.id)));
console.log('제목 예시:', raw.slice(0, 3).map(r => r.TITLE ?? r.title));
