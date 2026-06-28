import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { verifyZaloSignature } from './zalo';

const appId = '1234567890';
const secret = 'oa-secret-key';
const rawBody = '{"event_name":"user_send_text","oa_id":"oa1","timestamp":"1700000000000"}';
const timestamp = '1700000000000';

const sign = (body: string, ts: string | number, app = appId, sec = secret) =>
  'mac=' + createHash('sha256').update(`${app}${body}${ts}${sec}`).digest('hex');

describe('verifyZaloSignature', () => {
  it('chap nhan chu ky dung (co tien to mac=)', () => {
    expect(verifyZaloSignature({
      signatureHeader: sign(rawBody, timestamp), appId, rawBody, timestamp, secret,
    })).toBe(true);
  });

  it('chap nhan chu ky dung khi header khong co tien to mac=', () => {
    const hash = createHash('sha256').update(`${appId}${rawBody}${timestamp}${secret}`).digest('hex');
    expect(verifyZaloSignature({
      signatureHeader: hash, appId, rawBody, timestamp, secret,
    })).toBe(true);
  });

  it('tu choi khi secret sai', () => {
    expect(verifyZaloSignature({
      signatureHeader: sign(rawBody, timestamp), appId, rawBody, timestamp, secret: 'sai',
    })).toBe(false);
  });

  it('tu choi khi body bi sua', () => {
    expect(verifyZaloSignature({
      signatureHeader: sign(rawBody, timestamp), appId, rawBody: rawBody + 'x', timestamp, secret,
    })).toBe(false);
  });

  it('tu choi khi thieu chu ky / appId / secret / timestamp', () => {
    expect(verifyZaloSignature({ signatureHeader: null, appId, rawBody, timestamp, secret })).toBe(false);
    expect(verifyZaloSignature({ signatureHeader: sign(rawBody, timestamp), appId: null, rawBody, timestamp, secret })).toBe(false);
    expect(verifyZaloSignature({ signatureHeader: sign(rawBody, timestamp), appId, rawBody, timestamp, secret: null })).toBe(false);
    expect(verifyZaloSignature({ signatureHeader: sign(rawBody, timestamp), appId, rawBody, timestamp: null, secret })).toBe(false);
  });
});
