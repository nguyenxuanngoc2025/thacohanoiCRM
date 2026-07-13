import { createServiceClient } from '@/lib/supabase/server';
import { getPlatformSetting } from '@/lib/platform-settings';

type Db = ReturnType<typeof createServiceClient>;

/**
 * Định tuyến đích cho tin CẢNH BÁO / BÁO CÁO SỨC KHOẺ hệ thống (watchdog + health-digest dùng chung).
 *
 * Đích ưu tiên: Zalo CÁ NHÂN người vận hành (platform_settings['watchdog_alert_target']).
 * Nếu chưa cấu hình cá nhân → nhóm BLĐ toàn công ty (scope='management', không gắn phòng).
 *
 * Vì bot Zalo poll notifications theo channel_id thuộc công ty, tin cá nhân vẫn phải gắn 1 channel_id
 * zalo bất kỳ của công ty để bot nhặt được; payload.target sẽ override đích thật sang Zalo cá nhân.
 */

export const WATCHDOG_ALERT_TARGET_KEY = 'watchdog_alert_target';

export interface AlertRouting {
  zaloChannelByCompany: Map<string, string>;
  mgmtByCompany: Map<string, { id: string; channel: string; target: string }[]>;
  personal: { target: string; thread_type: number } | null;
}

/** Nạp một lần dữ liệu định tuyến cho MỌI công ty (kênh + đích cá nhân). */
export async function loadAlertRouting(service: Db): Promise<AlertRouting> {
  const { data: allChannels } = await service
    .from('notification_channels')
    .select('id, company_id, channel, target, scope, sales_team_id')
    .eq('is_active', true);

  const zaloChannelByCompany = new Map<string, string>();
  const mgmtByCompany = new Map<string, { id: string; channel: string; target: string }[]>();
  for (const c of (allChannels ?? []) as {
    id: string; company_id: string | null; channel: string; target: string; scope: string; sales_team_id: string | null;
  }[]) {
    if (!c.company_id) continue;
    if (c.channel === 'zalo' && !zaloChannelByCompany.has(c.company_id)) zaloChannelByCompany.set(c.company_id, c.id);
    if (c.scope !== 'management' || c.sales_team_id) continue;
    (mgmtByCompany.get(c.company_id) ?? mgmtByCompany.set(c.company_id, []).get(c.company_id)!).push({ id: c.id, channel: c.channel, target: c.target });
  }

  let personal: { target: string; thread_type: number } | null = null;
  try {
    const raw = await getPlatformSetting(WATCHDOG_ALERT_TARGET_KEY);
    const j = raw ? (JSON.parse(raw) as { target?: string; thread_type?: number }) : null;
    if (j?.target) personal = { target: j.target, thread_type: j.thread_type === 0 ? 0 : 1 };
  } catch { personal = null; }

  return { zaloChannelByCompany, mgmtByCompany, personal };
}

/** Dựng các dòng notifications cho 1 tin, theo đích cá nhân (ưu tiên) hoặc nhóm BLĐ. null = không có đích. */
export function buildAlertInserts(
  routing: AlertRouting,
  companyId: string,
  text: string,
  event: string,
): Record<string, unknown>[] | null {
  if (routing.personal) {
    const channelId = routing.zaloChannelByCompany.get(companyId);
    if (!channelId) return null;
    return [{
      channel: 'zalo', channel_id: channelId, status: 'pending',
      payload: { event, target: routing.personal.target, thread_type: routing.personal.thread_type, text },
    }];
  }
  const channels = routing.mgmtByCompany.get(companyId) ?? [];
  if (channels.length === 0) return null;
  return channels.map((c) => ({
    channel: c.channel, channel_id: c.id, status: 'pending',
    payload: { event, target: c.target, thread_type: 1, text },
  }));
}
