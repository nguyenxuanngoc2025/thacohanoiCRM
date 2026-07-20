import { NextResponse, type NextRequest } from 'next/server';
import { requirePlatformOwner } from '@/lib/platform-guard';
import { writeAudit } from '@/lib/platform-audit';
import {
  parseUnitFiles, parseUnitShow, parseTimersCalendar,
  classifyTimer, buildOverrideContent, unitStatusLight, explainCron, cronTitle, formatVnTime, cronSortKey,
} from '@/lib/cron-admin';
import {
  listTimers, showTimer, showService, enableTimer, disableTimer,
  startService, validateCalendar, writeOverride,
} from '@/lib/systemd';

export const dynamic = 'force-dynamic';

/**
 * Quản lý cron (systemd timer) cho Chủ nền tảng. GET = liệt kê mọi timer + trạng thái;
 * POST = bật/tắt/chạy ngay/đổi lịch. Chỉ nhận unit CÓ THẬT (whitelist theo list-timers) →
 * chống mọi tên bịa. Đổi lịch: validate cú pháp trước, ghi drop-in override (hoàn tác được).
 */

const svcOf = (timer: string) => timer.replace(/\.timer$/, '.service');

interface TimerView {
  unit: string;
  service: string;
  group: 'crm' | 'infra' | 'os';
  dangerous: boolean;
  title: string;
  description: string;
  explain: string;
  enabled: boolean;
  unitFileState: string;
  light: 'green' | 'gray' | 'red';
  calendars: string[];
  nextRun: string;
  lastRun: string;
  lastResult: string;
}

async function buildTimerView(unit: string, state: string): Promise<TimerView> {
  const [timerRaw, svcRaw] = await Promise.all([showTimer(unit), showService(svcOf(unit))]);
  const t = parseUnitShow(timerRaw);
  const s = parseUnitShow(svcRaw);
  const { group, dangerous } = classifyTimer(unit);
  const lastResult = s.Result ?? '';
  return {
    unit,
    service: svcOf(unit),
    group,
    dangerous,
    title: cronTitle(unit, t.Description ?? ''),
    description: t.Description ?? '',
    explain: explainCron(unit, t.Description ?? ''),
    enabled: state === 'enabled',
    unitFileState: t.UnitFileState ?? state,
    light: unitStatusLight({
      unitFileState: t.UnitFileState ?? state,
      activeState: t.ActiveState ?? '',
      lastResult,
    }),
    calendars: parseTimersCalendar(timerRaw),
    nextRun: formatVnTime(t.NextElapseUSecRealtime ?? ''),
    lastRun: formatVnTime(t.LastTriggerUSec ?? ''),
    lastResult,
  };
}

// GET /api/platform/cron — danh sách mọi timer đã phân nhóm + trạng thái.
export async function GET() {
  const guard = await requirePlatformOwner();
  if (guard.error) return guard.error;
  try {
    const rows = parseUnitFiles(await listTimers());
    const timers = await Promise.all(rows.map((r) => buildTimerView(r.unit, r.state)));
    // Sắp theo luồng nghiệp vụ (thu lead → báo cáo ngày/tuần/tháng → …); còn lại theo tên.
    timers.sort((a, b) => cronSortKey(a.unit) - cronSortKey(b.unit) || a.unit.localeCompare(b.unit));
    return NextResponse.json({ timers });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/platform/cron — action: enable | disable | run | reschedule.
export async function POST(request: NextRequest) {
  const guard = await requirePlatformOwner();
  if (guard.error) return guard.error;
  const { service, userId } = guard.ctx;

  try {
    const body = await request.json() as {
      action?: string; unit?: string; calendars?: unknown;
    };
    const action = String(body.action ?? '');
    const unit = String(body.unit ?? '').trim();
    if (!unit.endsWith('.timer')) {
      return NextResponse.json({ error: 'Tên timer không hợp lệ.' }, { status: 400 });
    }

    // Whitelist: unit phải CÓ THẬT trong danh sách timer trên máy.
    const known = new Set(parseUnitFiles(await listTimers()).map((r) => r.unit));
    if (!known.has(unit)) {
      return NextResponse.json({ error: 'Timer không tồn tại.' }, { status: 404 });
    }

    if (action === 'enable') {
      await enableTimer(unit);
      await writeAudit(service, userId, 'cron.enable', 'timer', unit, {});
      return NextResponse.json({ success: true });
    }
    if (action === 'disable') {
      await disableTimer(unit);
      await writeAudit(service, userId, 'cron.disable', 'timer', unit, {});
      return NextResponse.json({ success: true });
    }
    if (action === 'run') {
      await startService(svcOf(unit));
      await writeAudit(service, userId, 'cron.run', 'timer', unit, {});
      return NextResponse.json({ success: true });
    }
    if (action === 'reschedule') {
      const cals = Array.isArray(body.calendars)
        ? (body.calendars as unknown[]).map((c) => String(c).trim()).filter(Boolean)
        : [];
      if (cals.length === 0) {
        return NextResponse.json({ error: 'Thiếu lịch mới.' }, { status: 400 });
      }
      for (const c of cals) {
        if (!(await validateCalendar(c))) {
          return NextResponse.json({ error: `Lịch không hợp lệ: ${c}` }, { status: 400 });
        }
      }
      await writeOverride(unit, buildOverrideContent(cals));
      await writeAudit(service, userId, 'cron.reschedule', 'timer', unit, { calendars: cals });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Hành động không hợp lệ.' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
