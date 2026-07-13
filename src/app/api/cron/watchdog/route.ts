import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkCronSecret } from '@/lib/cron-auth';
import { getPlatformSetting, setPlatformSetting } from '@/lib/platform-settings';
import { gatherSystemHealth, type SystemHealth } from '@/lib/system-health';
import { loadAlertRouting, buildAlertInserts } from '@/lib/alert-dispatch';

export const dynamic = 'force-dynamic';

/**
 * Watchdog — canh gác hệ thống. Chạy định kỳ (systemd 30'/lần):
 *  - Với mỗi công ty có nhóm Zalo BLĐ toàn công ty (scope='management', showroom_id null):
 *      tổng hợp sức khoẻ → nếu có mục ĐỎ (fail) thì đẩy 1 tin cảnh báo vào nhóm đó.
 *  - Chống spam (dedup): chỉ báo LẠI khi tập lỗi ĐỔI, hoặc quá 6 giờ kể từ lần báo trước.
 *  - Khi hết lỗi (đã khôi phục): báo 1 tin "đã khôi phục" rồi thôi.
 * Lead vẫn được lưu bình thường dù có lỗi — watchdog chỉ để CON NGƯỜI biết mà xử lý sớm.
 * Định tuyến đích cảnh báo (cá nhân / nhóm BLĐ) tách sang lib/alert-dispatch (dùng chung health-digest).
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
  // Định tuyến đích (cá nhân / nhóm BLĐ) + danh sách công ty lấy từ helper dùng chung.
  const routing = await loadAlertRouting(service);
  const companyIds = [
    ...new Set([...routing.zaloChannelByCompany.keys(), ...routing.mgmtByCompany.keys()]),
  ];
  const buildInserts = (companyId: string, text: string) =>
    buildAlertInserts(routing, companyId, text, 'system_alert');

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
