import * as XLSX from 'xlsx';

/** Một sheet: tên + ma trận ô (hàng đầu = tiêu đề cột). */
export interface SheetData {
  name: string;
  /** Hàng đầu tiên là header; các hàng sau là dữ liệu. Ô có thể là số hoặc chuỗi. */
  rows: (string | number)[][];
}

/** Cắt tên sheet về ≤31 ký tự + bỏ ký tự Excel cấm. */
function safeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || 'Sheet';
}

/** Tự co giãn độ rộng cột theo nội dung dài nhất. */
function autoWidth(rows: (string | number)[][]): { wch: number }[] {
  const widths: number[] = [];
  for (const r of rows) {
    r.forEach((cell, i) => {
      const len = String(cell ?? '').length;
      if (len > (widths[i] ?? 0)) widths[i] = len;
    });
  }
  return widths.map((w) => ({ wch: Math.min(Math.max(w + 2, 8), 40) }));
}

/** Xuất nhiều sheet ra 1 file .xlsx và kích hoạt tải về (chỉ chạy ở client). */
export function exportXlsx(fileName: string, sheets: SheetData[]): void {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const s of sheets) {
    let name = safeSheetName(s.name);
    let n = 2;
    while (used.has(name.toLowerCase())) name = `${safeSheetName(s.name).slice(0, 28)} ${n++}`;
    used.add(name.toLowerCase());
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    ws['!cols'] = autoWidth(s.rows);
    if (s.rows.length > 0) ws['!freeze'] = { xSplit: 0, ySplit: 1 } as never; // giữ dòng tiêu đề
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${fileName}-${stamp}.xlsx`);
}
