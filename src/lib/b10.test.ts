// app/src/lib/b10.test.ts
import { describe, it, expect } from 'vitest';
import { bestB10Status, normalizeB10Status } from './b10';

describe('bestB10Status', () => {
  it('không bao giờ tụt hạng — lấy mức cao nhất', () => {
    expect(bestB10Status(null, 'KHQT')).toBe('KHQT');
    expect(bestB10Status('KHQT', null)).toBe('KHQT');
    expect(bestB10Status('KHQT', 'KHĐ')).toBe('KHĐ');
    expect(bestB10Status('KHĐ', 'KHQT')).toBe('KHĐ');
    expect(bestB10Status('Fail', 'Chưa LH được')).toBe('Fail');
    expect(bestB10Status(null, null)).toBeNull();
  });

  it('thứ tự đầy đủ: Chưa LH được < Fail < KHQT < GDTD < KHĐ', () => {
    expect(bestB10Status('Chưa LH được', 'Fail')).toBe('Fail');
    expect(bestB10Status('Fail', 'KHQT')).toBe('KHQT');
    expect(bestB10Status('KHQT', 'GDTD')).toBe('GDTD');
    expect(bestB10Status('GDTD', 'KHĐ')).toBe('KHĐ');
  });
});

describe('normalizeB10Status', () => {
  it('khớp mã chuẩn (không phân biệt hoa/thường, khoảng trắng)', () => {
    expect(normalizeB10Status('KHQT')).toBe('KHQT');
    expect(normalizeB10Status(' khđ ')).toBe('KHĐ');
    expect(normalizeB10Status('gdtd')).toBe('GDTD');
    expect(normalizeB10Status('chưa lh được')).toBe('Chưa LH được');
    expect(normalizeB10Status('fail')).toBe('Fail');
  });

  it('giá trị rỗng/lạ → null', () => {
    expect(normalizeB10Status('')).toBeNull();
    expect(normalizeB10Status(null)).toBeNull();
    expect(normalizeB10Status('xyz')).toBeNull();
  });
});

// thêm vào cuối app/src/lib/b10.test.ts
import { reconcileB10, type B10Row, type B10Lead } from './b10';

describe('reconcileB10', () => {
  const scoped: B10Lead[] = [
    { id: 'l1', phone: '0900000001', b10_status: null },
    { id: 'l2', phone: '0900000002', b10_status: 'KHQT' },
  ];
  const companyPhones = new Set(['900000001', '900000002', '900000003']);

  it('khớp trong phạm vi → cập nhật best; ngoài phạm vi & không tìm thấy đếm riêng', () => {
    const rows: B10Row[] = [
      { phone: '0900 000 001', status: 'KHĐ' },   // trong phạm vi → l1 = KHĐ
      { phone: '0900000002', status: 'Chưa LH được' }, // l2 đã KHQT → giữ KHQT (không tụt)
      { phone: '0900000003', status: 'KHQT' },    // có trong công ty nhưng ngoài phạm vi
      { phone: '0900000099', status: 'KHQT' },    // không có lead nào
    ];
    const r = reconcileB10(rows, scoped, companyPhones);
    expect(r.summary.totalRows).toBe(4);
    expect(r.summary.matched).toBe(2);
    expect(r.summary.outOfScope).toBe(1);
    expect(r.summary.notFound).toBe(1);
    const u1 = r.updates.find((u) => u.id === 'l1')!;
    const u2 = r.updates.find((u) => u.id === 'l2')!;
    expect(u1.b10_status).toBe('KHĐ');
    expect(u2.b10_status).toBe('KHQT'); // không tụt từ KHQT xuống "Chưa LH được"
  });

  it('giá trị lạ → vẫn đánh dấu khớp (đã lên B10), b10_status giữ nguyên, liệt kê unrecognized', () => {
    const rows: B10Row[] = [{ phone: '0900000001', status: 'đang xử lý' }];
    const r = reconcileB10(rows, scoped, companyPhones);
    expect(r.summary.matched).toBe(1);
    expect(r.summary.unrecognized).toContain('đang xử lý');
    expect(r.updates.find((u) => u.id === 'l1')!.b10_status).toBeNull();
  });

  it('nhiều dòng cùng SĐT trong file → gộp best vào 1 update', () => {
    const rows: B10Row[] = [
      { phone: '0900000001', status: 'KHQT' },
      { phone: '0900000001', status: 'KHĐ' },
    ];
    const r = reconcileB10(rows, scoped, companyPhones);
    expect(r.updates.filter((u) => u.id === 'l1')).toHaveLength(1);
    expect(r.updates.find((u) => u.id === 'l1')!.b10_status).toBe('KHĐ');
    expect(r.summary.matched).toBe(2); // 2 dòng đều khớp đúng khách
  });

  it('dòng thiếu SĐT → đếm notFound, không tạo update', () => {
    const rows: B10Row[] = [{ phone: '', status: 'KHĐ' }];
    const r = reconcileB10(rows, scoped, companyPhones);
    expect(r.summary.notFound).toBe(1);
    expect(r.updates).toHaveLength(0);
  });
});
