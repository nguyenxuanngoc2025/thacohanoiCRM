import { describe, it, expect } from 'vitest';
import { buildHealthDigestText } from './health-digest';
import type { SystemHealth, HealthGroup } from './system-health';

const G = (title: string, items: HealthGroup['items']): HealthGroup => ({ title, items });

const healthy: SystemHealth = {
  overall: 'ok',
  generatedAt: '2026-07-13T00:00:00Z',
  groups: [
    G('Kênh Facebook', [
      { key: 'fb_1', label: 'Fanpage A', status: 'ok', detail: 'Kết nối tốt.' },
      { key: 'fb_2', label: 'Fanpage B', status: 'ok', detail: 'Kết nối tốt.' },
      { key: 'fb_3', label: 'Fanpage C', status: 'ok', detail: 'Kết nối tốt.' },
    ]),
    G('Bot Zalo', [{ key: 'zalo_bot', label: 'Bot Zalo gửi thông báo', status: 'ok', detail: 'Đang kết nối.' }]),
  ],
};

// 06:00 giờ VN = 23:00 UTC hôm trước
const morningUtc = new Date('2026-07-12T23:00:00Z');
// 20:00 giờ VN = 13:00 UTC cùng ngày
const eveningUtc = new Date('2026-07-13T13:00:00Z');

describe('buildHealthDigestText', () => {
  it('hệ thống khoẻ: tiêu đề VẪN KHOẺ, không có dấu lỗi, có câu trấn an', () => {
    const t = buildHealthDigestText('Thaco Auto Hà Nội', healthy, morningUtc);
    expect(t).toContain('VẪN KHOẺ');
    expect(t).toContain('Thaco Auto Hà Nội');
    expect(t).not.toContain('❌');
    expect(t).toContain('Mọi kênh thu lead hoạt động bình thường.');
  });

  it('phase theo giờ VN: sáng vs tối + giờ HH:MM dd/mm đúng múi VN', () => {
    expect(buildHealthDigestText('X', healthy, morningUtc)).toContain('sáng 06:00 13/07');
    expect(buildHealthDigestText('X', healthy, eveningUtc)).toContain('tối 20:00 13/07');
  });

  it('nhóm nhiều mục đều tốt: hiện N/N tốt', () => {
    const t = buildHealthDigestText('X', healthy, morningUtc);
    expect(t).toContain('Kênh Facebook: ✅ 3/3 tốt');
  });

  it('nhóm một mục ok: hiện detail của mục', () => {
    const t = buildHealthDigestText('X', healthy, morningUtc);
    expect(t).toContain('Bot Zalo: ✅ Đang kết nối.');
  });

  it('có mục fail: tiêu đề MỤC LỖI, xổ chi tiết + cách khắc phục', () => {
    const withFail: SystemHealth = {
      overall: 'fail',
      generatedAt: '2026-07-13T13:00:00Z',
      groups: [
        G('Bot Zalo', [{ key: 'zalo_bot', label: 'Bot Zalo gửi thông báo', status: 'fail', detail: 'Mất kết nối.', fix: 'Quét lại QR.' }]),
      ],
    };
    const t = buildHealthDigestText('X', withFail, eveningUtc);
    expect(t).toContain('1 MỤC LỖI');
    expect(t).toContain('Mất kết nối.');
    expect(t).toContain('→ Quét lại QR.');
    expect(t).toContain('Cần xử lý sớm mục ❌ để không sót lead.');
  });

  it('có mục warn (không fail): tiêu đề CẦN CHÚ Ý', () => {
    const withWarn: SystemHealth = {
      overall: 'warn',
      generatedAt: '2026-07-13T13:00:00Z',
      groups: [
        G('Hàng đợi thông báo', [{ key: 'notif_failed', label: 'Tin báo gửi lỗi (24h)', status: 'warn', detail: '2 tin gửi lỗi.' }]),
      ],
    };
    const t = buildHealthDigestText('X', withWarn, eveningUtc);
    expect(t).toContain('CẦN CHÚ Ý');
    expect(t).not.toContain('MỤC LỖI');
  });
});
