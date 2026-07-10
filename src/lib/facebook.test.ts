import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyFbSignature, makeFieldGetter } from './facebook';

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

describe('makeFieldGetter (khop key khong phan biet dau cach/gach duoi)', () => {
  it('bat ten khi field name la "full name" (dau cach)', () => {
    const get = makeFieldGetter([{ name: 'full name', values: ['Đức Hạnh'] }]);
    expect(get(['full_name', 'name', 'họ_và_tên'])).toBe('Đức Hạnh');
  });

  it('bat ten khi field name la "full_name" (gach duoi)', () => {
    const get = makeFieldGetter([{ name: 'full_name', values: ['Lê Hồng Vân'] }]);
    expect(get(['full_name', 'name'])).toBe('Lê Hồng Vân');
  });

  it('bat SDT khi field name la "phone number" (dau cach)', () => {
    const get = makeFieldGetter([{ name: 'phone number', values: ['+84981515513'] }]);
    expect(get(['phone_number', 'phone'])).toBe('+84981515513');
  });

  it('khong nham field khac, tra null khi khong co key phu hop', () => {
    const get = makeFieldGetter([{ name: 'email', values: ['a@b.com'] }]);
    expect(get(['full_name', 'name'])).toBe(null);
  });
});
