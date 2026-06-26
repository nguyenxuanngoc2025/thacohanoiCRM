// Phân loại: tên có phải tên người không. False = tên rác (trống/placeholder/slug/
// từ khoá marketing) → cần tra Zalo bù tên. True = giữ nguyên, không tra.

const PLACEHOLDERS = ['khách lẻ', 'khách hàng'];

// Từ khoá marketing (dạng đã bỏ dấu, lowercase) — so trên chuỗi đã bỏ dấu.
const MARKETING = [
  'bao gia', 'lan banh', 'khuyen mai', 'nhan', 'dang ky', 'form', 'uu dai',
];

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

export function looksLikePersonName(name: string | null | undefined): boolean {
  const raw = (name ?? '').trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  if (PLACEHOLDERS.includes(lower)) return false;
  if (raw.includes('_')) return false;
  const noDiac = stripDiacritics(lower);
  if (MARKETING.some((kw) => noDiac.includes(kw))) return false;
  return true;
}
