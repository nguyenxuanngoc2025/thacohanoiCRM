/** Bỏ dấu tiếng Việt + thường hoá để so khớp không phân biệt dấu/hoa-thường. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // dấu thanh + dấu mũ
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/**
 * Khớp lead theo từ khoá tìm kiếm thông minh:
 * - Phần SỐ trong từ khoá → so với SĐT (dạng nội địa 0...): khớp tiền tố, hoặc chuỗi con khi ≥4 số.
 * - Phần CHỮ trong từ khoá → so với tên, bỏ dấu cả 2 phía.
 * Khớp 1 trong 2 là đủ. Từ khoá rỗng = khớp tất cả.
 *
 * @param name      tên khách (có thể null)
 * @param phoneLocal SĐT dạng hiển thị nội địa, ví dụ "0914155096"
 * @param query     chuỗi người dùng gõ
 */
export function matchesQuery(name: string | null, phoneLocal: string, query: string): boolean {
  const q = query.trim();
  if (!q) return true;

  // — So theo SĐT —
  let qDigits = q.replace(/\D/g, '');
  if (qDigits.startsWith('84') && qDigits.length >= 10) qDigits = '0' + qDigits.slice(2);
  if (qDigits) {
    const d = phoneLocal.replace(/\D/g, '');
    if (d.startsWith(qDigits)) return true;
    if (qDigits.length >= 4 && d.includes(qDigits)) return true;
  }

  // — So theo tên (chỉ khi từ khoá có chữ, tránh số lọt vào so tên) —
  if (/\D/.test(q)) {
    const qText = normalizeText(q);
    if (qText && normalizeText(name ?? '').includes(qText)) return true;
  }

  return false;
}
