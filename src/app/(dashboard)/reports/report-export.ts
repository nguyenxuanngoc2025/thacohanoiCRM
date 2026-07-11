import { type SheetData } from '@/lib/xlsx-export';

export type SheetCol<T = unknown> = { header: string; value: (r: T) => string | number };

/** Xuất 1 bảng đúng cột đang hiển thị trên UI (WYSIWYG). rows đã tính sẵn; totalRow là mảng ô dòng Tổng (đủ số cột) hoặc bỏ qua nếu không có. */
export function tableSheet<T>(name: string, cols: SheetCol<T>[], rows: T[], totalRow?: (string | number)[] | null): SheetData {
  const header = cols.map((c) => c.header);
  const body = rows.map((r) => cols.map((c) => c.value(r)));
  const out: (string | number)[][] = [header, ...body];
  if (totalRow && totalRow.length) out.push(totalRow);
  return { name, rows: out };
}
