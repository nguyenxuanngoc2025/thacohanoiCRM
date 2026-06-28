import { describe, it, expect, beforeAll } from 'vitest';
import { encrypt, decrypt } from './crypto';

beforeAll(() => { process.env.TOKEN_ENC_KEY = 'test-key-cho-unit-test'; });

describe('crypto AES-256-GCM', () => {
  it('mã hoá rồi giải mã trả lại nguyên văn', () => {
    const plain = 'refresh-token-1//04abcXYZ_-.';
    const blob = encrypt(plain);
    expect(blob).not.toContain(plain);
    expect(blob.split('.')).toHaveLength(3);
    expect(decrypt(blob)).toBe(plain);
  });

  it('hai lần mã hoá cùng chuỗi cho ciphertext khác nhau (iv ngẫu nhiên)', () => {
    expect(encrypt('abc')).not.toBe(encrypt('abc'));
  });

  it('chuỗi mã hoá hỏng thì decrypt ném lỗi', () => {
    expect(() => decrypt('khong-hop-le')).toThrow();
  });
});
