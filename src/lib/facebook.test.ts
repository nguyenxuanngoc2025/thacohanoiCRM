import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyFbSignature } from './facebook';

const appSecret = 'fb-app-secret-xyz';
const rawBody = '{"object":"page","entry":[{"id":"123","changes":[]}]}';

const sign = (body: string, sec = appSecret) =>
  'sha256=' + createHmac('sha256', sec).update(body).digest('hex');

describe('verifyFbSignature', () => {
  it('chap nhan chu ky dung (co tien to sha256=)', () => {
    expect(verifyFbSignature(rawBody, sign(rawBody), appSecret)).toBe(true);
  });

  it('chap nhan chu ky dung khi header khong co tien to sha256=', () => {
    const hex = createHmac('sha256', appSecret).update(rawBody).digest('hex');
    expect(verifyFbSignature(rawBody, hex, appSecret)).toBe(true);
  });

  it('tu choi khi secret sai', () => {
    expect(verifyFbSignature(rawBody, sign(rawBody, 'sai'), appSecret)).toBe(false);
  });

  it('tu choi khi body bi sua', () => {
    expect(verifyFbSignature(rawBody + 'x', sign(rawBody), appSecret)).toBe(false);
  });

  it('tu choi khi thieu chu ky / secret', () => {
    expect(verifyFbSignature(rawBody, null, appSecret)).toBe(false);
    expect(verifyFbSignature(rawBody, sign(rawBody), null)).toBe(false);
    expect(verifyFbSignature(rawBody, '', appSecret)).toBe(false);
  });
});
