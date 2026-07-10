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
  for (const c of (allChannels ?? []) as { id: string; company_id: string | null; channel: string; target: string; scope: string; sales_team_id: string | null }[]) {
    if (!c.company_id || c.scope !== 'management' || c.sales_team_id) continue;
    (mgmtByCompany.get(c.company_id) ?? mgmtByCompany.set(c.company_id, []).get(c.company_id)!).push({ id: c.id, channel: c.channel, target: c.target });
  }

  const summary: { company: string; overall: string; sent: boolean; reason: string }[] = [];

  for (const companyId of companyIds) {
    const channels = mgmtByCompany.get(companyId) ?? [];
    const { data: comp } = await service.from('companies').select('name').eq('id', companyId).maybeSingle();
    const companyName = (comp as { name?: string } | null)?.name ?? 'Công ty';

    const health = await gatherSystemHealth(companyId);

    if (channels.length === 0) {
      // Chưa có nhóm BLĐ để nhận cảnh báo → chỉ ghi nhận, không đẩy tin.
      summary.push({ company: companyName, overall: health.overall, sent: false, reason: 'no_management_group' });
      continue;
    }

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
        const text = buildAlertText(companyName, health);
        await service.from('notifications').insert(
          channels.map((c) => ({
            channel: c.channel, channel_id: c.id, status: 'pending',
            payload: { event: 'system_alert', target: c.target, text },
          })),
        );
        await setPlatformSetting(stateKey, JSON.stringify({ sig, at: Date.now() } satisfies WatchState));
        sent = true;
        reason = changed ? 'new_failure' : 'realert_6h';
      }
    } else if (prev && prev.sig) {
      // Trước có lỗi, giờ hết → báo khôi phục 1 lần rồi xoá dấu.
      const text = buildRecoverText(companyName);
      await service.from('notifications').insert(
        channels.map((c) => ({
          channel: c.channel, channel_id: c.id, status: 'pending',
          payload: { event: 'system_alert', target: c.target, text },
        })),
      );
      await setPlatformSetting(stateKey, JSON.stringify({ sig: '', at: Date.now() } satisfies WatchState));
      sent = true;
      reason = 'recovered';
    }

    summary.push({ company: companyName, overall: health.overall, sent, reason });
  }

  return NextResponse.json({ ok: true, companies: summary });
}
