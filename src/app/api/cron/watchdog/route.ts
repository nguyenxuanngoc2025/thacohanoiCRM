import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkCronSecret } from '@/lib/cron-auth';
import { getPlatformSetting, setPlatformSetting } from '@/lib/platform-settings';
import { gatherSystemHealth, type SystemHealth } from '@/lib/system-health';

export const dynamic = 'force-dynamic';

/**
 * Watchdog — canh gác hệ thống. Chạy định kỳ (systemd 30'/lần):
 *  - Với mỗi công ty có nhóm Zalo BLĐ toàn công ty (scope='management', showroom_id null):
 *      tổng hợp sức khoẻ → nếu có mục ĐỎ (fail) thì đẩy 1 tin cảnh báo vào nhóm đó.
 *  - Chống spam (dedup): chỉ báo LẠI khi tập lỗi ĐỔI, hoặc quá 6 giờ kể từ lần báo trước.
 *  - Khi hết lỗi (đã khôi phục): báo 1 tin "đã khôi phục" rồi thôi.
 * Lead vẫn được lưu bình thường dù có lỗi — watchdog chỉ để CON NGƯỜI biết mà xử lý sớm.
 */

const REALERT_MS = 6 * 3600 * 1000; // báo lại cùng lỗi sau 6 giờ
const WATCHDOG_ALERT_TARGET_KEY = 'watchdog_alert_target';

interface WatchState { sig: string; at: number }

function failSignature(h: SystemHealth): string {
  return h.groups
    .flatMap((g) => g.items)
    .filter((it) => it.status === 'fail')
    .map((it) => it.key)
    .sort()
    .join(',');
}

function buildAlertText(companyName: string, h: SystemHealth): string {
  const fails = h.groups.flatMap((g) => g.items).filter((it) => it.status === 'fail');
  const lines: string[] = [];
  lines.push('<b>⚠️ CẢNH BÁO HỆ THỐNG CRM</b>');
  lines.push(companyName);
  lines.push('');
  lines.push(`Phát hiện ${fails.length} mục có lỗi:`);
  for (const f of fails) {
    lines.push('');
    lines.push(`<b>• ${f.label}</b>`);
    lines.push(`  ${f.detail}`);
    if (f.fix) lines.push(`  → ${f.fix}`);
  }
  lines.push('');
  lines.push('Xem chi tiết: Cài đặt → Tình trạng hệ thống.');
  return lines.join('\n');
}

function buildRecoverText(companyName: string): string {
  return ['<b>✅ HỆ THỐNG ĐÃ KHÔI PHỤC</b>', companyName, '', 'Các lỗi trước đó đã hết. Luồng thu lead hoạt động bình thường.'].join('\n');
}

export async function POST(request: NextRequest) {
  if (!checkCronSecret(request.headers.get('x-cron-secret'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const service = createServiceClient();

  // Mọi công ty có nhóm Zalo đang hoạt động → cần theo dõi sức khoẻ.
  // Đích nhận cảnh báo = nhóm BLĐ (scope='management', không gắn phòng). Nếu công ty chưa cấu
  // hình nhóm BLĐ thì vẫn tính health (để dashboard/summary thấy) nhưng KHÔNG đẩy tin (no_target).
  const { data: allChannels } = await service
    .from('notification_channels')
    .select('id, company_id, channel, target, scope, sales_team_id')
    .eq('is_active', true);

  const companyIds = [
    ...new Set(
      ((allChannels ?? []) as { company_id: string | null }[])
        .map((c) => c.company_id)
        .filter((x): x is string => !!x),
    ),
  ];

  const mgmtByCompany = new Map<string, { id: string; channel: string; target: string }[]>();
  // 1 kênh zalo bất kỳ của công ty — dùng làm channel_id để child (poll theo company) nhặt được
  // tin cảnh báo cá nhân (payload.target sẽ override đích thật sang Zalo cá nhân).
  const zaloChannelByCompany = new Map<string, string>();
  for (const c of (allChannels ?? []) as { id: string; company_id: string | null; channel: string; target: string; scope: string; sales_team_id: string | null }[]) {
    if (!c.company_id) continue;
    if (c.channel === 'zalo' && !zaloChannelByCompany.has(c.company_id)) zaloChannelByCompany.set(c.company_id, c.id);
    if (c.scope !== 'management' || c.sales_team_id) continue;
    (mgmtByCompany.get(c.company_id) ?? mgmtByCompany.set(c.company_id, []).get(c.company_id)!).push({ id: c.id, channel: c.channel, target: c.target });
  }

  // Đích cảnh báo cá nhân (Zalo cá nhân người vận hành) — ưu tiên hơn nhóm BLĐ nếu đã cấu hình.
  // platform_settings['watchdog_alert_target'] = {"target":"<uid>","thread_type":0,"label":"..."}
  let personal: { target: string; thread_type: number } | null = null;
  try {
    const raw = await getPlatformSetting(WATCHDOG_ALERT_TARGET_KEY);
    const j = raw ? (JSON.parse(raw) as { target?: string; thread_type?: number }) : null;
    if (j?.target) personal = { target: j.target, thread_type: j.thread_type === 0 ? 0 : 1 };
  } catch { personal = null; }

  // Dựng các dòng notifications cho 1 tin cảnh báo, theo đích cá nhân hoặc nhóm BLĐ.
  const buildInserts = (
    companyId: string,
    text: string,
  ): Record<string, unknown>[] | null => {
    if (personal) {
      // Gắn 1 channel_id zalo của công ty để child poll được; payload.target override sang Zalo cá nhân.
      const channelId = zaloChannelByCompany.get(companyId);
      if (!channelId) return null;
      return [{
        channel: 'zalo', channel_id: channelId, status: 'pending',
        payload: { event: 'system_alert', target: personal.target, thread_type: personal.thread_type, text },
      }];
    }
    const channels = mgmtByCompany.get(companyId) ?? [];
    if (channels.length === 0) return null;
    return channels.map((c) => ({
      channel: c.channel, channel_id: c.id, status: 'pending',
      payload: { event: 'system_alert', target: c.target, thread_type: 1, text },
    }));
  };

  const summary: { company: string; overall: string; sent: boolean; reason: string }[] = [];

  for (const companyId of companyIds) {
    const { data: comp } = await service.from('companies').select('name').eq('id', companyId).maybeSingle();
    const companyName = (comp as { name?: string } | null)?.name ?? 'Công ty';

    const health = await gatherSystemHealth(companyId);

    const sig = failSignature(health);
    const stateKey = `watchdog:${companyId}`;
    const raw = await getPlatformSetting(stateKey);
    let prev: WatchState | null = null;
    try { prev = raw ? (JSON.parse(raw) as WatchState) : null; } catch { prev = null; }

    let sent = false;
    let reason = 'no_change';

    if (sig) {
      // Đang có lỗi → báo nếu tập lỗi đổi hoặc quá 6 giờ kể từ lần báo gần nhất.
      const changed = !prev || prev.sig !== sig;
      const staleEnough = prev ? Date.now() - prev.at > REALERT_MS : true;
      if (changed || staleEnough) {
        const inserts = buildInserts(companyId, buildAlertText(companyName, health));
        if (!inserts) {
          summary.push({ company: companyName, overall: health.overall, sent: false, reason: 'no_target' });
          continue;
        }
        await service.from('notifications').insert(inserts);
        await setPlatformSetting(stateKey, JSON.stringify({ sig, at: Date.now() } satisfies WatchState));
        sent = true;
        reason = changed ? 'new_failure' : 'realert_6h';
      }
    } else if (prev && prev.sig) {
      // Trước có lỗi, giờ hết → báo khôi phục 1 lần rồi xoá dấu.
      const inserts = buildInserts(companyId, buildRecoverText(companyName));
      if (inserts) {
        await service.from('notifications').insert(inserts);
        sent = true;
        reason = 'recovered';
      }
      await setPlatformSetting(stateKey, JSON.stringify({ sig: '', at: Date.now() } satisfies WatchState));
    }

    summary.push({ company: companyName, overall: health.overall, sent, reason });
  }

  return NextResponse.json({ ok: true, companies: summary });
}
