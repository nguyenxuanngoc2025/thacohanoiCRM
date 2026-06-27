import { describe, it, expect } from 'vitest';
import { totalPaid, outstanding, isContractOverdue, summarize } from './revenue';

describe('totalPaid', () => {
  it('cộng tổng thực nhận', () => {
    expect(totalPaid([{ amount: 10 }, { amount: 5.5 }])).toBe(15.5);
  });
  it('rỗng → 0', () => {
    expect(totalPaid([])).toBe(0);
  });
  it('bỏ qua giá trị không hợp lệ', () => {
    expect(totalPaid([{ amount: 10 }, { amount: NaN }, { amount: 5 }])).toBe(15);
  });
});

describe('outstanding', () => {
  it('công nợ = giá trị HĐ − tổng đã thu', () => {
    expect(outstanding(100, [{ amount: 30 }, { amount: 20 }])).toBe(50);
  });
  it('thu vượt → âm (kẹp về 0)', () => {
    expect(outstanding(100, [{ amount: 120 }])).toBe(0);
  });
  it('chưa thu → bằng giá trị HĐ', () => {
    expect(outstanding(100, [])).toBe(100);
  });
});

describe('isContractOverdue', () => {
  const today = '2026-06-27';
  it('lịch tới hạn chưa thu đủ → quá hạn', () => {
    const schedule = [{ due_date: '2026-06-01', amount: 50 }];
    const payments = [{ paid_at: '2026-05-30', amount: 20 }];
    expect(isContractOverdue(schedule, payments, today)).toBe(true);
  });
  it('lịch tới hạn đã thu đủ → không quá hạn', () => {
    const schedule = [{ due_date: '2026-06-01', amount: 50 }];
    const payments = [{ paid_at: '2026-06-01', amount: 50 }];
    expect(isContractOverdue(schedule, payments, today)).toBe(false);
  });
  it('lịch chưa tới hạn → không quá hạn dù chưa thu', () => {
    const schedule = [{ due_date: '2026-12-01', amount: 50 }];
    const payments: { paid_at: string; amount: number }[] = [];
    expect(isContractOverdue(schedule, payments, today)).toBe(false);
  });
  it('cộng dồn nhiều đợt: thu sớm bù đợt sau', () => {
    const schedule = [
      { due_date: '2026-05-01', amount: 30 },
      { due_date: '2026-06-01', amount: 30 },
    ];
    const payments = [{ paid_at: '2026-04-15', amount: 60 }];
    expect(isContractOverdue(schedule, payments, today)).toBe(false);
  });
  it('không có lịch → không quá hạn', () => {
    expect(isContractOverdue([], [{ paid_at: '2026-01-01', amount: 5 }], today)).toBe(false);
  });
});

describe('summarize', () => {
  it('tổng giá trị / đã thu / công nợ trên nhiều hợp đồng', () => {
    const result = summarize([
      { contract_value: 100, paid: 40 },
      { contract_value: 200, paid: 200 },
    ]);
    expect(result).toEqual({ totalValue: 300, totalPaid: 240, totalOutstanding: 60 });
  });
  it('rỗng → tất cả 0', () => {
    expect(summarize([])).toEqual({ totalValue: 0, totalPaid: 0, totalOutstanding: 0 });
  });
});
