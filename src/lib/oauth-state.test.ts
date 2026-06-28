import { describe, it, expect, beforeAll } from 'vitest';
import { signState, verifyState } from './oauth-state';

beforeAll(() => { process.env.TOKEN_ENC_KEY = 'test-secret-key-for-oauth-state'; });

describe('oauth-state', () => {
  it('ký rồi verify trả lại đúng company + return origin', () => {
    const token = signState({ c: 'company-1', r: 'https://abc.crmthacoauto.com' });
    const out = verifyState(token);
    expect(out).not.toBeNull();
    expect(out!.c).toBe('company-1');
    expect(out!.r).toBe('https://abc.crmthacoauto.com');
  });

  it('từ chối token bị sửa payload (chữ ký sai)', () => {
    const token = signState({ c: 'company-1', r: 'https://abc.crmthacoauto.com' });
    const [, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ c: 'company-EVIL', r: 'https://x', exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url');
    expect(verifyState(`${forged}.${sig}`)).toBeNull();
  });

  it('từ chối token hết hạn', () => {
    const token = signState({ c: 'c', r: 'https://x' }, -10);
    expect(verifyState(token)).toBeNull();
  });

  it('từ chối token rỗng / sai định dạng', () => {
    expect(verifyState(null)).toBeNull();
    expect(verifyState('')).toBeNull();
    expect(verifyState('khongchamcham')).toBeNull();
  });
});
