/** Chuan hoa SDT VN ve +84... (khoa dinh danh noi bo). Tra null neu khong hop le. */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/[^\d+]/g, '');
  let local: string;
  if (digits.startsWith('+84')) local = digits.slice(3);
  else if (digits.startsWith('84')) local = digits.slice(2);
  else if (digits.startsWith('0')) local = digits.slice(1);
  else local = digits.replace(/^\+/, '');
  if (!/^\d{9,10}$/.test(local)) return null;
  return '+84' + local;
}

/** Hien thi SDT ra dang 0... tu +84... */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return '';
  if (phone.startsWith('+84')) return '0' + phone.slice(3);
  if (phone.startsWith('84')) return '0' + phone.slice(2);
  return phone;
}
