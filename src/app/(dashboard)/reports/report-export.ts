import { type SheetData } from '@/lib/xlsx-export';
import { type GroupRow, type RankedRow, type Kpis } from '@/lib/reports';

export type SheetCol<T = unknown> = { header: string; value: (r: T) => string | number };

/** Xuất 1 bảng đúng cột đang hiển thị trên UI (WYSIWYG). rows đã tính sẵn; totalRow là mảng ô dòng Tổng (đủ số cột) hoặc bỏ qua nếu không có. */
export function tableSheet<T>(name: string, cols: SheetCol<T>[], rows: T[], totalRow?: (string | number)[] | null): SheetData {
  const header = cols.map((c) => c.header);
  const body = rows.map((r) => cols.map((c) => c.value(r)));
  const out: (string | number)[][] = [header, ...body];
  if (totalRow && totalRow.length) out.push(totalRow);
  return { name, rows: out };
}

/** 1 bảng khuôn cố định (Bảng quản trị / Xếp hạng) → 1 sheet, kèm cột Δ%chốt + dòng Tổng. */
export function groupSheet(name: string, rows: (GroupRow | RankedRow)[], totals: Kpis, withDelta: boolean): SheetData {
  const header = ['Tên', 'Tổng lead', 'Đã LH', 'KHQT', 'GDTD', 'KHĐ', 'Tỉ lệ chốt', 'Quá hạn', ...(withDelta ? ['Δ so kỳ trước'] : [])];
  const body = rows.map((r) => [
    r.label, r.leads, r.contacted, r.interested, r.following, r.won, r.winRate, r.overdue,
    ...(withDelta ? [(r as RankedRow).winRateDelta ?? 0] : []),
  ]);
  const totalRow: (string | number)[] = [
    'Tổng', totals.total, totals.contacted, totals.interested, totals.following, totals.won, totals.winRate, totals.overdue,
    ...(withDelta ? [''] : []),
  ];
  return { name, rows: [header, ...body, totalRow] };
}
