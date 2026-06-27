// Helper thuần cho module doanh thu nền tảng — không phụ thuộc Supabase, dễ test.

/** Tổng thực nhận (bỏ qua giá trị không hợp lệ). */
export function totalPaid(payments: { amount: number }[]): number {
  return payments.reduce((s, p) => s + (Number.isFinite(p.amount) ? p.amount : 0), 0);
}

/** Công nợ = giá trị HĐ − tổng đã thu, kẹp về 0 (không âm). */
export function outstanding(contractValue: number, payments: { amount: number }[]): number {
  return Math.max(0, contractValue - totalPaid(payments));
}

/**
 * Quá hạn: tồn tại 1 đợt lịch có due_date < hôm nay mà tổng thực nhận tới hôm nay
 * < tổng lịch tới đợt đó (cộng dồn — thu sớm bù được đợt sau).
 * So sánh ngày dạng 'YYYY-MM-DD' bằng so sánh chuỗi (an toàn cho định dạng ISO).
 */
export function isContractOverdue(
  schedule: { due_date: string; amount: number }[],
  payments: { paid_at: string; amount: number }[],
  today: string,
): boolean {
  const paidToToday = payments
    .filter((p) => p.paid_at <= today)
    .reduce((s, p) => s + (Number.isFinite(p.amount) ? p.amount : 0), 0);

  let cumulativeDue = 0;
  for (const d of [...schedule].sort((a, b) => a.due_date.localeCompare(b.due_date))) {
    if (d.due_date < today) {
      cumulativeDue += Number.isFinite(d.amount) ? d.amount : 0;
      if (paidToToday < cumulativeDue) return true;
    }
  }
  return false;
}

/** Tổng hợp nhiều hợp đồng (mỗi dòng đã tính sẵn paid). */
export function summarize(
  rows: { contract_value: number; paid: number }[],
): { totalValue: number; totalPaid: number; totalOutstanding: number } {
  let totalValue = 0;
  let totalPaidSum = 0;
  for (const r of rows) {
    totalValue += Number.isFinite(r.contract_value) ? r.contract_value : 0;
    totalPaidSum += Number.isFinite(r.paid) ? r.paid : 0;
  }
  return {
    totalValue,
    totalPaid: totalPaidSum,
    totalOutstanding: Math.max(0, totalValue - totalPaidSum),
  };
}
