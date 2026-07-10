import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { fetchPageLeadsSince, type FbLeadField } from '@/lib/facebook';
import { gatherIntentText } from '@/lib/lead-intent-text';
import { ingestLead } from '@/lib/ingest';
import { checkCronSecret } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Backfill lead Lead Ads đã có trên Facebook nhưng CHƯA vào CRM — xảy ra khi kênh được
 * kết nối TRỄ hơn thời điểm lead phát sinh (webhook lúc đó trả `unknown_channel` → drop).
 * Nạp qua đúng cửa `ingestLead` (chống trùng + phân giao 3 cấp + dò dòng xe), nhưng:
 *   - suppress_notify=true  → KHÔNG spam nhóm Zalo bằng lead cũ,
 *   - created_at_override    → đặt đúng thời điểm gốc trên Facebook.
 * Chỉ admin công ty (kênh trong công ty mình) hoặc platform_owner (chỉ định pageIds).
 */
export async function POST(req: NextRequest) {
  const service = createServiceClient();

  // 2 lối vào: (a) x-cron-secret (chạy tự động từ máy chủ — BẮT BUỘC chỉ định pageIds vì
  // không có ngữ cảnh công ty), (b) session admin/platform_owner (scope theo công ty).
  const viaCron = checkCronSecret(req.headers.get('x-cron-secret'), process.env.CRON_SECRET);
  let callerRole: string | null = null;
  let callerCompany: string | null = null;
  if (!viaCron) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: caller } = await service
      .from('users').select('role, company_id').eq('id', user.id).maybeSingle();
    if (!caller || !['admin', 'platform_owner'].includes(caller.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    callerRole = caller.role;
    callerCompany = caller.company_id as string | null;
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const since = typeof body.since === 'string' ? body.since : null;
  if (!since) return NextResponse.json({ error: 'Thiếu since (YYYY-MM-DD)' }, { status: 400 });
  // Mốc đọc theo giờ VN (UTC+7); FB time_created là epoch giây.
  const sinceUnix = Math.floor(Date.parse(`${since}T00:00:00+07:00`) / 1000);
  if (!Number.isFinite(sinceUnix)) {
    return NextResponse.json({ error: 'since không hợp lệ' }, { status: 400 });
  }
  const bodyPageIds: string[] = Array.isArray(body.pageIds) ? body.pageIds.map(String) : [];
  // limit (tuỳ chọn): chỉ nạp N lead MỚI NHẤT của mỗi page (sau khi lọc theo since).
  const limit = Number.isInteger(body.limit) && (body.limit as number) > 0 ? (body.limit as number) : null;

  // Kênh đang hoạt động; scope theo công ty của admin (platform_owner phải chỉ định pageIds).
  const { data: chans } = await service
    .from('channel_accounts')
    .select('page_id, is_active, showroom:showrooms!showroom_id(company_id)')
    .eq('is_active', true);

  type ChanRow = { page_id: string; showroom: { company_id: string | null } | null };
  const pages = [...new Set(
    ((chans ?? []) as unknown as ChanRow[])
      .filter((c) => {
        if (bodyPageIds.length && !bodyPageIds.includes(c.page_id)) return false;
        // cron / platform_owner: chỉ backfill page được chỉ định rõ (không quét cả hệ thống).
        if (viaCron || callerRole === 'platform_owner') return bodyPageIds.length > 0;
        // admin: chỉ kênh thuộc công ty mình.
        return c.showroom?.company_id === callerCompany;
      })
      .map((c) => c.page_id),
  )];

  if (pages.length === 0) {
    return NextResponse.json({ error: 'Không có kênh nào trong phạm vi để backfill.' }, { status: 400 });
  }

  const results: Record<string, unknown>[] = [];
  for (const pageId of pages) {
    let fetched = 0, ingested = 0, deduped = 0, failed = 0, noPhone = 0;
    try {
      let leads = await fetchPageLeadsSince(pageId, sinceUnix);
      // Chỉ lấy N lead mới nhất khi có limit (sắp giảm dần theo thời điểm tạo trên FB).
      if (limit) {
        leads = [...leads]
          .sort((a, b) => Date.parse(b.createdTime) - Date.parse(a.createdTime))
          .slice(0, limit);
      }
      fetched = leads.length;
      for (const l of leads) {
        if (!l.phone) { noPhone++; continue; }
        const fieldData = ((l.raw as { field_data?: FbLeadField[] })?.field_data) ?? [];
        const intentText = gatherIntentText({
          fieldData, formName: l.formName, adName: l.adName, campaignName: l.campaignName,
        });
        const r = await ingestLead({
          page_id: pageId,
          phone_raw: l.phone,
          full_name: l.fullName,
          source: 'facebook',
          fb_lead_id: l.leadgenId,
          external_payload: l.raw as Record<string, unknown>,
          intent_text: intentText,
          suppress_notify: true,
          created_at_override: l.createdTime,
        });
        if (!r.ok) failed++;
        else if (r.deduped) deduped++;
        else ingested++;
      }
      results.push({ pageId, fetched, ingested, deduped, failed, noPhone });
    } catch (e) {
      results.push({ pageId, error: String(e) });
    }
  }

  return NextResponse.json({ ok: true, since, results });
}
