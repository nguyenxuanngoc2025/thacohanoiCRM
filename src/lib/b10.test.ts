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

  it('trạng thái DDMS Sales Funnel → định nghĩa của ta (TB 85/2025)', () => {
    // Khách hàng liên hệ / quan tâm → KHQT
    expect(normalizeB10Status('Contact')).toBe('KHQT');
    expect(normalizeB10Status('Prospect')).toBe('KHQT');
    // Giao dịch theo dõi (warm/hot/booking) → GDTD
    expect(normalizeB10Status('Appointment')).toBe('GDTD');
    expect(normalizeB10Status('Test Drive')).toBe('GDTD');
    expect(normalizeB10Status('Sales Offer')).toBe('GDTD');
    expect(normalizeB10Status('Booking')).toBe('GDTD');
    // Fail giữ nguyên
    expect(normalizeB10Status('Fail')).toBe('Fail');
  });

  it('DDMS: không phân biệt hoa/thường, thừa khoảng trắng, thiếu khoảng trắng', () => {
    expect(normalizeB10Status(' prospect ')).toBe('KHQT');
    expect(normalizeB10Status('SALES  OFFER')).toBe('GDTD');
    expect(normalizeB10Status('testdrive')).toBe('GDTD');
    expect(normalizeB10Status('salesoffer')).toBe('GDTD');
  });
});

// thêm vào cuối app/src/lib/b10.test.ts
import { reconcileB10, aggregateB10Archive, type B10Row, type B10Lead } from './b10';

describe('aggregateB10Archive', () => {
  it('gom theo SĐT chuẩn hoá, lấy best status + gộp mọi note không trùng', () => {
    const rows: B10Row[] = [
      { phone: '0900 000 001', status: 'KHQT', note: 'Gọi lần 1' },
      { phone: '0900000001', status: 'KHĐ', note: 'Chốt hợp đồng' },
      { phone: '0900000002', status: 'Prospect', note: '' },
    ];
    const out = aggregateB10Archive(rows);
    const r1 = out.find((r) => r.phone === '+84900000001')!;
    expect(r1.b10_status).toBe('KHĐ'); // best giữa KHQT và KHĐ
    expect(r1.care_note).toBe('Gọi lần 1\nChốt hợp đồng');
    const r2 = out.find((r) => r.phone === '+84900000002')!;
    expect(r2.b10_status).toBe('KHQT'); // Prospect → KHQT
    expect(r2.care_note).toBeNull();
  });

  it('bỏ qua dòng thiếu SĐT; note trùng chỉ giữ 1', () => {
    const rows: B10Row[] = [
      { phone: '', status: 'KHĐ', note: 'x' },
      { phone: '0900000003', status: 'KHQT', note: 'Đã tư vấn' },
      { phone: '0900000003', status: 'KHQT', note: 'Đã tư vấn' },
    ];
    const out = aggregateB10Archive(rows);
    expect(out).toHaveLength(1);
    expect(out[0].care_note).toBe('Đã tư vấn');
  });
});

describe('reconcileB10', () => {
  const scoped: B10Lead[] = [
    { id: 'l1', phone: '0900000001', b10_status: null, status: null },
    { id: 'l2', phone: '0900000002', b10_status: 'KHQT', status: 'KHQT' },
  ];
  // companyPhones = khoá định danh +84… (cùng dạng app lưu trong DB).
  const companyPhones = new Set(['+84900000001', '+84900000002', '+84900000003']);

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

  it('nội dung chăm sóc: lấy giá trị không rỗng gần nhất; thiếu note → null', () => {
    const rows: B10Row[] = [
      { phone: '0900000001', status: 'KHQT', note: ' Đã gọi, hẹn xem xe ' },
      { phone: '0900000001', status: 'KHĐ', note: '' }, // rỗng → giữ note trước
      { phone: '0900000002', status: 'KHQT' },          // không có note → null
    ];
    const r = reconcileB10(rows, scoped, companyPhones);
    expect(r.updates.find((u) => u.id === 'l1')!.b10_care_note).toBe('Đã gọi, hẹn xem xe');
    expect(r.updates.find((u) => u.id === 'l2')!.b10_care_note).toBeNull();
  });
});

describe('reconcileB10 — tự nâng trạng thái chính (phương án A)', () => {
  const companyPhones = new Set(['+84900000001', '+84900000002', '+84900000003', '+84900000004']);

  it('TVBH chưa phân loại (status=null) → tự nâng theo B10, đếm statusRaised', () => {
    const scoped: B10Lead[] = [{ id: 'l1', phone: '0900000001', b10_status: null, status: null }];
    const r = reconcileB10([{ phone: '0900000001', status: 'Prospect' }], scoped, companyPhones);
    expect(r.updates.find((u) => u.id === 'l1')!.new_status).toBe('KHQT');
    expect(r.summary.statusRaised).toBe(1);
    expect(r.summary.conflicts).toBe(0);
  });

  it('status="Chưa LH được" → coi như chưa phân loại, vẫn tự nâng', () => {
    const scoped: B10Lead[] = [{ id: 'l1', phone: '0900000001', b10_status: null, status: 'Chưa LH được' }];
    const r = reconcileB10([{ phone: '0900000001', status: 'Booking' }], scoped, companyPhones);
    expect(r.updates.find((u) => u.id === 'l1')!.new_status).toBe('GDTD');
    expect(r.summary.statusRaised).toBe(1);
  });

  it('TVBH đã phân loại (KHQT) mà B10 cao hơn (GDTD) → KHÔNG tự sửa, đếm conflicts', () => {
    const scoped: B10Lead[] = [{ id: 'l1', phone: '0900000001', b10_status: 'KHQT', status: 'KHQT' }];
    const r = reconcileB10([{ phone: '0900000001', status: 'Appointment' }], scoped, companyPhones);
    expect(r.updates.find((u) => u.id === 'l1')!.new_status).toBeNull();
    expect(r.summary.statusRaised).toBe(0);
    expect(r.summary.conflicts).toBe(1);
  });

  it('TVBH đã đặt Fail mà B10 báo GDTD → KHÔNG lật quyết định, chỉ đếm conflicts', () => {
    const scoped: B10Lead[] = [{ id: 'l1', phone: '0900000001', b10_status: null, status: 'Fail' }];
    const r = reconcileB10([{ phone: '0900000001', status: 'Test Drive' }], scoped, companyPhones);
    expect(r.updates.find((u) => u.id === 'l1')!.new_status).toBeNull();
    expect(r.summary.conflicts).toBe(1);
  });

  it('B10 thấp hơn hoặc bằng trạng thái hiện tại → không nâng, không lệch', () => {
    const scoped: B10Lead[] = [{ id: 'l1', phone: '0900000001', b10_status: 'GDTD', status: 'GDTD' }];
    const r = reconcileB10([{ phone: '0900000001', status: 'Prospect' }], scoped, companyPhones);
    expect(r.updates.find((u) => u.id === 'l1')!.new_status).toBeNull();
    expect(r.summary.statusRaised).toBe(0);
    expect(r.summary.conflicts).toBe(0);
  });

  it('chưa phân loại + B10 giá trị lạ (không nhận ra) → không nâng', () => {
    const scoped: B10Lead[] = [{ id: 'l1', phone: '0900000001', b10_status: null, status: null }];
    const r = reconcileB10([{ phone: '0900000001', status: 'đang xử lý' }], scoped, companyPhones);
    expect(r.updates.find((u) => u.id === 'l1')!.new_status).toBeNull();
    expect(r.summary.statusRaised).toBe(0);
  });
});
