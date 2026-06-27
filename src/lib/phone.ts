/**
 * Chuan hoa SDT VN ve +84... (khoa dinh danh noi bo). Tra null neu khong hop le.
 * Quy uoc: SDT hop le = dung 10 chu so dang hien thi (0 + 9 chu so) => phan local DUNG 9 chu so.
 * Moi so khac 10 chu so => khong tinh la lead (tra null).
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/[^\d+]/g, '');
  let local: string;
  if (digits.startsWith('+84')) local = digits.slice(3);
  else if (digits.startsWith('84')) local = digits.slice(2);
  else if (digits.startsWith('0')) local = digits.slice(1);
  else local = digits.replace(/^\+/, '');
  if (!/^\d{9}$/.test(local)) return null;
  return '+84' + local;
}

/** Quet 1 doan van ban tu do (comment / tin nhan) tim SDT VN dau tien hop le. Tra +84... hoac null. */
export function extractPhone(text: string | null | undefined): string | null {
  if (!text) return null;
  // chuoi giong SDT VN: bat dau 0 / 84 / +84, theo sau 8-10 chu so, cho phep . - khoang trang xen giua
  const re = /(?:\+?84|0)\d(?:[\s.\-]?\d){7,9}/g;
  const matches = text.match(re);
  if (!matches) return null;
  for (const m of matches) {
    const p = normalizePhone(m);
    if (p) return p;
  }
  return null;
}

/** Hien thi SDT ra dang 0... tu +84... */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return '';
  if (phone.startsWith('+84')) return '0' + phone.slice(3);
  if (phone.startsWith('84')) return '0' + phone.slice(2);
  return phone;
}
