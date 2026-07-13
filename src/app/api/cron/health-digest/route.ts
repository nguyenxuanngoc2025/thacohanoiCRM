import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkCronSecret } from '@/lib/cron-auth';
import { gatherSystemHealth } from '@/lib/system-health';
import { buildHealthDigestText } from '@/lib/health-digest';
import { loadAlertRouting, buildAlertInserts } from '@/lib/alert-dispatch';

export const dynamic = 'force-dynamic';

/**
 * Báo cáo sức khoẻ CHỦ ĐỘNG — chạy sáng 6:00 & tối 20:00 (giờ VN) qua systemd timer.
 * Với mỗi công ty có đích nhận (Zalo cá nhân / nhóm BLĐ): tổng hợp sức khoẻ kỹ thuật →
 * soạn tin → đẩy vào hàng đợi notifications cho bot Zalo gửi.
 * Khác watchdog: LUÔN gửi (kể cả khi mọi thứ xanh) để người vận hành yên tâm. Không dedup.
 * ?test=1 → thêm dòng "[TIN THỬ NGHIỆM]" đầu tin (để gửi thử thủ công).
 */

export async function POST(request: NextRequest) {
  if (!checkCronSecret(request.headers.get('x-cron-secret'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const isTest = new URL(request.url).searchParams.get('test') === '1';
  const service = createServiceClient();
  const routing = await loadAlertRouting(service);
  const companyIds = [
    ...new Set([...routing.zaloChannelByCompany.keys(), ...routing.mgmtByCompany.keys()]),
  ];

  const now = new Date();
  const summary: { company: string; overall: string; sent: boolean; reason: string }[] = [];

  for (const companyId of companyIds) {
    const { data: comp } = await service.from('companies').select('name').eq('id', companyId).maybeSingle();
    const companyName = (comp as { name?: string } | null)?.name ?? 'Công ty';

    const health = await gatherSystemHealth(companyId);
    let text = buildHealthDigestText(companyName, health, now);
    if (isTest) text = `[TIN THỬ NGHIỆM]\n${text}`;

    const inserts = buildAlertInserts(routing, companyId, text, 'health_digest');
    if (!inserts) {
      summary.push({ company: companyName, overall: health.overall, sent: false, reason: 'no_target' });
      continue;
    }
    await service.from('notifications').insert(inserts);
    summary.push({ company: companyName, overall: health.overall, sent: true, reason: 'sent' });
  }

  return NextResponse.json({ ok: true, companies: summary });
}
