import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkCronSecret } from '@/lib/cron-auth';
import { leadNeedsNameEnrich } from '@/lib/person-name';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Quét (2 lần/ngày) toàn bộ lead tên trống/bất thường CHƯA từng tra Zalo, tạo "việc tra tên"
 * cho bot xử lý ĐỘC LẬP với luồng thông báo. Bot là nơi DUY NHẤT có phiên Zalo (api.findUser),
 * nên cron chỉ xếp việc — bot poll bảng notifications, thấy payload.enrich_only thì tra tên +
 * ghi vào lead (KHÔNG gửi tin nhắn). Tôn trọng name_locked (user tự sửa) và name_enriched_at
 * (chỉ thử 1 lần/lead, tránh tra lặp vô hạn SĐT không có Zalo).
 * Chỉ xếp việc cho công ty có bot Zalo đang kết nối.
 */
export async function POST(req: NextRequest) {
  if (!checkCronSecret(req.headers.get('x-cron-secret'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const db = createServiceClient();

  // Công ty có bot Zalo đang kết nối (mới xử lý được việc tra tên).
  const { data: sessions } = await db
    .from('zalo_bot_sessions').select('company_id').eq('status', 'connected');
  const companyIds = [...new Set((sessions ?? []).map((s) => s.company_id as string))];
  if (companyIds.length === 0) return NextResponse.json({ ok: true, enqueued: 0, note: 'no connected bot' });

  // 1 kênh zalo active / công ty làm "cổng" cho bot nhặt việc (bot lọc theo channel_id của công ty).
  const { data: chans } = await db
    .from('notification_channels').select('id, company_id')
    .eq('channel', 'zalo').eq('is_active', true).in('company_id', companyIds);
  const zaloChanByCompany = new Map<string, string>();
  for (const c of chans ?? []) {
    if (!zaloChanByCompany.has(c.company_id as string)) zaloChanByCompany.set(c.company_id as string, c.id as string);
  }
  const scopedCompanies = [...zaloChanByCompany.keys()];
  if (scopedCompanies.length === 0) return NextResponse.json({ ok: true, enqueued: 0, note: 'no zalo channel' });

  // Ứng viên: chưa khoá tên, chưa thử tra, có SĐT. Lọc tên rác bằng leadNeedsNameEnrich (TS).
  const { data: candidates } = await db
    .from('leads')
    .select('id, company_id, phone, full_name, name_locked, name_enriched_at')
    .in('company_id', scopedCompanies)
    .eq('name_locked', false)
    .is('name_enriched_at', null)
    .not('phone', 'is', null)
    .limit(500);

  const needing = (candidates ?? []).filter((l) => leadNeedsNameEnrich({
    full_name: l.full_name as string | null,
    phone: l.phone as string | null,
    name_locked: l.name_locked as boolean | null,
    name_enriched_at: l.name_enriched_at as string | null,
  }));
  if (needing.length === 0) return NextResponse.json({ ok: true, enqueued: 0, scanned: candidates?.length ?? 0 });

  // Bỏ lead đã có việc tra tên đang chờ (tránh xếp trùng nếu bot xử lý chậm giữa 2 lần quét).
  const { data: existing } = await db
    .from('notifications').select('lead_id')
    .eq('status', 'pending')
    .in('lead_id', needing.map((l) => l.id as string));
  const pendingLeadIds = new Set((existing ?? []).map((n) => n.lead_id as string));

  const rows = needing
    .filter((l) => !pendingLeadIds.has(l.id as string))
    .map((l) => ({
      lead_id: l.id as string,
      channel: 'zalo',
      channel_id: zaloChanByCompany.get(l.company_id as string)!,
      status: 'pending',
      payload: {
        enrich_only: true,
        enrich: {
          leadId: l.id as string,
          phone: l.phone as string,
          badName: (l.full_name as string | null)?.trim() || 'Khách lẻ',
        },
      },
    }));

  if (rows.length === 0) return NextResponse.json({ ok: true, enqueued: 0, scanned: candidates?.length ?? 0 });

  const { error } = await db.from('notifications').insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, enqueued: rows.length, scanned: candidates?.length ?? 0 });
}
