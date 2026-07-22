import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock thư viện web-push: ghi lại lời gọi + cho phép ném lỗi 410.
const sendNotification = vi.fn();
vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: (...a: unknown[]) => sendNotification(...a) },
}));

import { sendPushToUsers } from './push';

// Service client giả: from('push_subscriptions').select().in('user_id').eq('company_id')
function makeService(rows: Record<string, unknown>[]) {
  const deleted: string[] = [];
  const service = {
    from: () => ({
      select: () => ({
        in: () => ({
          eq: () => Promise.resolve({ data: rows, error: null }),
        }),
      }),
      delete: () => ({ eq: (_c: string, id: string) => { deleted.push(id); return Promise.resolve({ error: null }); } }),
    }),
  };
  return { service, deleted };
}

beforeEach(() => {
  sendNotification.mockReset();
  // Cấu hình VAPID giả để ensureVapid() không no-op trong môi trường test.
  process.env.VAPID_PUBLIC_KEY = 'test-pub';
  process.env.VAPID_PRIVATE_KEY = 'test-priv';
});

describe('sendPushToUsers', () => {
  it('gửi tới mọi subscription của user trong đúng company', async () => {
    sendNotification.mockResolvedValue({});
    const { service } = makeService([
      { id: 's1', endpoint: 'e1', p256dh: 'a', auth: 'b' },
      { id: 's2', endpoint: 'e2', p256dh: 'a', auth: 'b' },
    ]);
    // @ts-expect-error mock service
    await sendPushToUsers(service, 'C1', ['u1'], { title: 'T', body: 'B', url: '/leads' });
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it('lỗi 410 → xoá subscription chết', async () => {
    sendNotification.mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }));
    sendNotification.mockResolvedValueOnce({});
    const { service, deleted } = makeService([
      { id: 'dead', endpoint: 'e1', p256dh: 'a', auth: 'b' },
      { id: 'live', endpoint: 'e2', p256dh: 'a', auth: 'b' },
    ]);
    // @ts-expect-error mock service
    await sendPushToUsers(service, 'C1', ['u1'], { title: 'T', body: 'B', url: '/leads' });
    expect(deleted).toEqual(['dead']);
  });

  it('không có userIds → không gọi gì (fire-and-forget an toàn)', async () => {
    const { service } = makeService([]);
    // @ts-expect-error mock service
    await sendPushToUsers(service, 'C1', [], { title: 'T', body: 'B', url: '/' });
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
