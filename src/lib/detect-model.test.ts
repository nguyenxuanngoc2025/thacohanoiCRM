import { describe, it, expect } from 'vitest';
import { normalizeForMatch, detectModel } from './detect-model';

describe('normalizeForMatch', () => {
  it('bỏ dấu tiếng Việt + hạ chữ thường', () => {
    expect(normalizeForMatch('Sorento Máy Dầu')).toBe('sorentomaydau');
  });
  it('bỏ gạch nối và khoảng trắng: CX-5 = cx5 = cx 5', () => {
    expect(normalizeForMatch('CX-5')).toBe('cx5');
    expect(normalizeForMatch('cx 5')).toBe('cx5');
    expect(normalizeForMatch('cx5')).toBe('cx5');
  });
  it('đổi đ/Đ thành d', () => {
    expect(normalizeForMatch('Đỏ')).toBe('do');
  });
  it('chuỗi rỗng/space về rỗng', () => {
    expect(normalizeForMatch('   ')).toBe('');
  });
});

const models = [
  { id: 'm1', brand_id: 'kia', name: 'Seltos', keywords: [], is_active: true },
  { id: 'm2', brand_id: 'kia', name: 'Sorento', keywords: ['so ren to'], is_active: true },
  { id: 'm3', brand_id: 'kia', name: 'K5', keywords: [], is_active: false },
  { id: 'm4', brand_id: 'mazda', name: 'CX-5', keywords: ['cx5'], is_active: true },
  { id: 'm5', brand_id: 'mazda', name: 'CX-3', keywords: [], is_active: true },
  { id: 'm6', brand_id: 'mazda', name: 'CX-30', keywords: [], is_active: true },
];

describe('detectModel', () => {
  it('trúng theo tên dòng xe', () => {
    expect(detectModel({ brandId: 'kia', text: 'em quan tâm Seltos', models })).toBe('m1');
  });
  it('trúng theo keyword (có dấu/khoảng trắng)', () => {
    expect(detectModel({ brandId: 'kia', text: 'tư vấn So Ren To giúp', models })).toBe('m2');
  });
  it('CX-5 / cx5 / cx 5 đều trúng', () => {
    expect(detectModel({ brandId: 'mazda', text: 'giá xe cx 5', models })).toBe('m4');
    expect(detectModel({ brandId: 'mazda', text: 'CX-5 bản full', models })).toBe('m4');
  });
  it('mơ hồ (≥2 dòng trúng) → null', () => {
    expect(detectModel({ brandId: 'kia', text: 'so sánh Seltos với Sorento', models })).toBeNull();
  });
  it('CX-30 KHÔNG bị nhầm sang CX-3 (chống trùng chuỗi con số)', () => {
    expect(detectModel({ brandId: 'mazda', text: 'báo giá CX-30', models })).toBe('m6');
    expect(detectModel({ brandId: 'mazda', text: 'em xem CX 30', models })).toBe('m6');
  });
  it('CX-3 trúng đúng CX-3', () => {
    expect(detectModel({ brandId: 'mazda', text: 'báo giá CX-3', models })).toBe('m5');
  });
  it('không trúng → null', () => {
    expect(detectModel({ brandId: 'kia', text: 'cho hỏi giá lăn bánh', models })).toBeNull();
  });
  it('bỏ model khác brand', () => {
    expect(detectModel({ brandId: 'kia', text: 'quan tâm cx5', models })).toBeNull();
  });
  it('bỏ model inactive', () => {
    expect(detectModel({ brandId: 'kia', text: 'mua K5 nhé', models })).toBeNull();
  });
  it('text rỗng → null', () => {
    expect(detectModel({ brandId: 'kia', text: '', models })).toBeNull();
  });
});
