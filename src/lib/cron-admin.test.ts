import { describe, it, expect } from 'vitest';
import {
  parseUnitFiles,
  parseUnitShow,
  parseTimersCalendar,
  classifyTimer,
  presetToCalendar,
  buildOverrideContent,
  unitStatusLight,
} from './cron-admin';

const UNIT_FILES = `apt-daily.timer              enabled  enabled
certbot.timer                enabled  enabled
cron-health-digest.timer     enabled  enabled
apt-listchanges.timer        disabled enabled
systemd-tmpfiles-clean.timer static   -
zca-bot-heal.timer           enabled  enabled
crm-backup.service           enabled  enabled`;

describe('parseUnitFiles', () => {
  it('chỉ lấy dòng .timer, tách unit + state', () => {
    const rows = parseUnitFiles(UNIT_FILES);
    expect(rows).toHaveLength(6); // bỏ dòng .service
    expect(rows[0]).toEqual({ unit: 'apt-daily.timer', state: 'enabled' });
    const disabled = rows.find((r) => r.unit === 'apt-listchanges.timer');
    expect(disabled?.state).toBe('disabled');
    const staticT = rows.find((r) => r.unit === 'systemd-tmpfiles-clean.timer');
    expect(staticT?.state).toBe('static');
  });
});

describe('parseUnitShow', () => {
  it('tách key=value, tách theo dấu = đầu tiên', () => {
    const raw = `Description=CRM Thaco Auto - bao cao suc khoe 06:00 & 20:00
ActiveState=active
UnitFileState=enabled
NextElapseUSecRealtime=Mon 2026-07-13 13:00:00 UTC
LastTriggerUSec=`;
    const o = parseUnitShow(raw);
    expect(o.Description).toBe('CRM Thaco Auto - bao cao suc khoe 06:00 & 20:00');
    expect(o.ActiveState).toBe('active');
    expect(o.NextElapseUSecRealtime).toBe('Mon 2026-07-13 13:00:00 UTC');
    expect(o.LastTriggerUSec).toBe('');
  });
});

describe('parseTimersCalendar', () => {
  it('lấy mọi OnCalendar từ nhiều dòng TimersCalendar', () => {
    const raw = `TimersCalendar={ OnCalendar=*-*-* 20:00:00 Asia/Ho_Chi_Minh ; next_elapse=Mon 2026-07-13 13:00:00 UTC }
TimersCalendar={ OnCalendar=*-*-* 06:00:00 Asia/Ho_Chi_Minh ; next_elapse=Mon 2026-07-13 23:00:00 UTC }`;
    expect(parseTimersCalendar(raw)).toEqual([
      '*-*-* 20:00:00 Asia/Ho_Chi_Minh',
      '*-*-* 06:00:00 Asia/Ho_Chi_Minh',
    ]);
  });

  it('timer không có lịch → mảng rỗng', () => {
    expect(parseTimersCalendar('NextElapseUSecRealtime=')).toEqual([]);
  });
});

describe('classifyTimer', () => {
  it('cron-* và zca-bot* là nhóm CRM, không nguy hiểm', () => {
    expect(classifyTimer('cron-health-digest.timer')).toEqual({ group: 'crm', dangerous: false });
    expect(classifyTimer('zca-bot-heal.timer')).toEqual({ group: 'crm', dangerous: false });
  });

  it('certbot + supabase-backup là hạ tầng, nguy hiểm', () => {
    expect(classifyTimer('certbot.timer')).toEqual({ group: 'infra', dangerous: true });
    expect(classifyTimer('supabase-backup.timer')).toEqual({ group: 'infra', dangerous: true });
  });

  it('apt/fstrim/logrotate... là hệ điều hành, nguy hiểm', () => {
    expect(classifyTimer('apt-daily.timer').group).toBe('os');
    expect(classifyTimer('fstrim.timer')).toEqual({ group: 'os', dangerous: true });
    expect(classifyTimer('logrotate.timer').dangerous).toBe(true);
  });
});

describe('presetToCalendar', () => {
  it('mỗi N phút', () => {
    expect(presetToCalendar({ kind: 'everyNMin', n: 5 })).toBe('*-*-* *:0/5:00');
    expect(presetToCalendar({ kind: 'everyNMin', n: 30 })).toBe('*-*-* *:0/30:00');
  });

  it('mỗi giờ', () => {
    expect(presetToCalendar({ kind: 'hourly' })).toBe('*-*-* *:00:00');
  });

  it('hằng ngày HH:MM theo giờ VN', () => {
    expect(presetToCalendar({ kind: 'dailyAt', hour: 6, minute: 0 })).toBe(
      '*-*-* 06:00:00 Asia/Ho_Chi_Minh',
    );
    expect(presetToCalendar({ kind: 'dailyAt', hour: 20, minute: 30 })).toBe(
      '*-*-* 20:30:00 Asia/Ho_Chi_Minh',
    );
  });

  it('hằng tuần thứ + HH:MM theo giờ VN', () => {
    expect(presetToCalendar({ kind: 'weeklyAt', weekday: 'Mon', hour: 8, minute: 0 })).toBe(
      'Mon *-*-* 08:00:00 Asia/Ho_Chi_Minh',
    );
  });
});

describe('buildOverrideContent', () => {
  it('xoá lịch cũ (OnCalendar= rỗng) rồi thêm lịch mới', () => {
    const c = buildOverrideContent(['*-*-* 06:00:00 Asia/Ho_Chi_Minh', '*-*-* 20:00:00 Asia/Ho_Chi_Minh']);
    expect(c).toBe(
      '[Timer]\nOnCalendar=\nOnCalendar=*-*-* 06:00:00 Asia/Ho_Chi_Minh\nOnCalendar=*-*-* 20:00:00 Asia/Ho_Chi_Minh\n',
    );
  });
});

describe('unitStatusLight', () => {
  it('bật + lần chạy cuối tốt → xanh', () => {
    expect(
      unitStatusLight({ unitFileState: 'enabled', activeState: 'active', lastResult: 'success' }),
    ).toBe('green');
  });

  it('tắt (disabled) → xám', () => {
    expect(
      unitStatusLight({ unitFileState: 'disabled', activeState: 'inactive', lastResult: 'success' }),
    ).toBe('gray');
  });

  it('bật nhưng lần chạy cuối lỗi → đỏ', () => {
    expect(
      unitStatusLight({ unitFileState: 'enabled', activeState: 'active', lastResult: 'exit-code' }),
    ).toBe('red');
  });

  it('lần chạy cuối chưa có (rỗng) mà đang bật → xanh', () => {
    expect(
      unitStatusLight({ unitFileState: 'enabled', activeState: 'active', lastResult: '' }),
    ).toBe('green');
  });
});
