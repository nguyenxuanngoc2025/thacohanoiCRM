import { describe, it, expect, beforeAll } from 'vitest';
import { extractGroupIds, parseStyledText, encrypt, decrypt } from './lib.mjs';

beforeAll(() => { process.env.TOKEN_ENC_KEY = 'test-key-123'; });

describe('extractGroupIds', () => {
  it('lấy id từ mảng id thuần', () => {
    expect(extractGroupIds(['111', '222'])).toEqual(['111', '222']);
  });
  it('lấy key từ gridVerMap (object)', () => {
    expect(extractGroupIds({ gridVerMap: { '111': 3, '222': 1 } }).sort()).toEqual(['111', '222']);
  });
  it('lấy key từ gridInfoMap (object)', () => {
    expect(extractGroupIds({ gridInfoMap: { '900': {} } })).toEqual(['900']);
  });
  it('lấy id từ groups là mảng object', () => {
    expect(extractGroupIds({ groups: [{ groupId: 'abc' }, { id: 'def' }] })).toEqual(['abc', 'def']);
  });
  it('rỗng/không hợp lệ → mảng rỗng', () => {
    expect(extractGroupIds(null)).toEqual([]);
    expect(extractGroupIds({})).toEqual([]);
  });
});

describe('parseStyledText', () => {
  it('đổi <b> → style đậm và bỏ tag', () => {
    const { msg, styles } = parseStyledText('Xin <b>chào</b> bạn');
    expect(msg).toBe('Xin chào bạn');
    expect(styles).toEqual([{ start: 4, len: 4, st: expect.anything() }]);
  });
  it('không có tag → giữ nguyên, styles rỗng', () => {
    const { msg, styles } = parseStyledText('SĐT 0901234*** an toàn');
    expect(msg).toBe('SĐT 0901234*** an toàn');
    expect(styles).toEqual([]);
  });
  it('tag lẻ không đóng → giữ nguyên ký tự', () => {
    const { msg } = parseStyledText('a <b>b');
    expect(msg).toBe('a <b>b');
  });
});

describe('crypto round-trip', () => {
  it('encrypt rồi decrypt ra đúng chuỗi gốc', () => {
    const plain = JSON.stringify({ cookie: 'abc', imei: 'xyz', tiếng: 'Việt' });
    const blob = encrypt(plain);
    expect(blob.split('.').length).toBe(3);
    expect(decrypt(blob)).toBe(plain);
  });
  it('blob hỏng → ném lỗi', () => {
    expect(() => decrypt('khong-hop-le')).toThrow();
  });
});
