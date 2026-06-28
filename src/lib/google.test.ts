import { describe, it, expect } from 'vitest';
import { guessColumns, buildConsentUrl } from './google';

describe('guessColumns', () => {
  it('đoán cột theo tiêu đề tiếng Việt có dấu', () => {
    const header = ['Thời gian', 'Họ và tên', 'Số điện thoại', 'Ghi chú'];
    expect(guessColumns(header, [])).toEqual({ phoneCol: 2, nameCol: 1 });
  });

  it('đoán cột theo tiêu đề tiếng Anh', () => {
    const header = ['Date', 'Full Name', 'Phone', 'Note'];
    expect(guessColumns(header, [])).toEqual({ phoneCol: 2, nameCol: 1 });
  });

  it('không có tiêu đề SĐT thì dò theo dữ liệu mẫu', () => {
    const header = ['A', 'B', 'C'];
    const sample = [['Nguyễn An', '0901234567', 'hà nội'], ['Trần Bình', '0912000111', 'hcm']];
    expect(guessColumns(header, sample).phoneCol).toBe(1);
  });

  it('không tìm thấy gì thì trả null', () => {
    expect(guessColumns(['X', 'Y'], [])).toEqual({ phoneCol: null, nameCol: null });
  });
});

describe('buildConsentUrl', () => {
  it('dựng URL consent có scope drive.file + offline + prompt consent', () => {
    const url = buildConsentUrl({ clientId: 'cid', redirectUri: 'https://x/cb', state: 'st' });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(u.searchParams.get('client_id')).toBe('cid');
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('prompt')).toBe('consent');
    expect(u.searchParams.get('scope')).toContain('drive.file');
    expect(u.searchParams.get('state')).toBe('st');
  });
});
