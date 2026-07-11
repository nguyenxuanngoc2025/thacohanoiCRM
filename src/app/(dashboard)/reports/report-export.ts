import { type SheetData } from '@/lib/xlsx-export';
import { type GroupRow, type RankedRow, type Kpis } from '@/lib/reports';

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
