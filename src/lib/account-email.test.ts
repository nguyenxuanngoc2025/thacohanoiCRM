import { describe, it, expect } from 'vitest';
import { usernameToEmail, EMAIL_DOMAIN } from './account-email';

describe('usernameToEmail', () => {
  it('ghép đuôi cho tên trơn', () => {
    expect(usernameToEmail('nguyenvana')).toBe(`nguyenvana@${EMAIL_DOMAIN}`);
  });
  it('giữ nguyên nếu đã có email đầy đủ', () => {
    expect(usernameToEmail('a@b.com')).toBe('a@b.com');
  });
  it('chuẩn hoá hoa/thường + cắt khoảng trắng', () => {
    expect(usernameToEmail('  NguyenVanA  ')).toBe(`nguyenvana@${EMAIL_DOMAIN}`);
  });
  it('xử lý số điện thoại làm tên đăng nhập', () => {
    expect(usernameToEmail('0938806341')).toBe(`0938806341@${EMAIL_DOMAIN}`);
  });
  it('trả rỗng khi không nhập gì', () => {
    expect(usernameToEmail('')).toBe('');
    expect(usernameToEmail('   ')).toBe('');
  });
});
