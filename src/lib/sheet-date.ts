// Parse ô thời gian trong Google Sheet về Date (UTC) — để cắt theo mốc khi đồng bộ lead.
// Sheet trả giá trị FORMATTED_VALUE nên ngày là chuỗi hiển thị (đa số VN: dd/mm/yyyy),
// đôi khi là số serial (ngày kể từ 1899-12-30 nếu ô là số chưa định dạng ngày).
// Mọi Date dựng bằng Date.UTC để so sánh KHÔNG lệ thuộc múi giờ máy chạy.

// Google Sheets/Excel serial: ngày 0 = 1899-12-30 (hệ ngày 1900).
const SERIAL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 86400000;

function fromParts(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): Date | null {
  // Chặn ngày/tháng vô lý (vd 32/13): dựng Date rồi kiểm tra lại các thành phần.
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

export function parseSheetDate(raw: string | null | undefined): Date | null {
  const s = (raw ?? '').trim();
  if (!s) return null;

  // Số serial thuần (vd "45901" hoặc "45901.5")
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    if (serial > 0 && serial < 100000) {
      return new Date(SERIAL_EPOCH_MS + Math.round(serial) * DAY_MS);
    }
    return null;
  }

  // ISO: yyyy-mm-dd[ T]hh:mm[:ss]
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (m) {
    return fromParts(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  }

  // VN: dd/mm/yyyy hoặc dd-mm-yyyy, có thể kèm giờ hh:mm[:ss]
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (m) {
    return fromParts(+m[3], +m[2], +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  }

  return null;
}

// Ô thời gian có >= mốc since (mốc dạng 'YYYY-MM-DD', tính từ 00:00) không?
// Ô không parse được → false (an toàn: KHÔNG nạp dòng cũ/rác, tránh spam thông báo).
export function isOnOrAfter(cellRaw: string | null | undefined, sinceISO: string): boolean {
  const cell = parseSheetDate(cellRaw);
  if (!cell) return false;
  const since = parseSheetDate(sinceISO);
  if (!since) return true; // mốc hỏng → không lọc
  return cell.getTime() >= since.getTime();
}
