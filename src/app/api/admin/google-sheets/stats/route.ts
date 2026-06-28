import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';

export const dynamic = 'force-dynamic';

// Số liệu 1 Google Sheet đã kết nối: tổng lead lấy về, phân loại, chia showroom,
// tỷ lệ nhận diện dòng xe, lead gần nhất, kết quả đồng bộ gần nhất + cảnh báo cấu hình.
export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { service, companyId } = guard.ctx;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 });

  // Channel + kiểm tra thuộc công ty (qua showroom anchor).
  const { data: ch } = await service.from('channel_accounts')
    .select('id, page_name, page_id, showroom_id, brand_id, last_sync').eq('id', id).maybeSingle();
  if (!ch) return NextResponse.json({ error: 'Không tìm thấy sheet' }, { status: 404 });

  const { data: srAll } = await service.from('showrooms').select('id, name').eq('company_id', companyId);
  const srRows = (srAll ?? []) as { id: string; name: string }[];
  const companySrIds = srRows.map((s) => s.id);
  const srNameById = new Map(srRows.map((s) => [s.id, s.name]));
  if (!companySrIds.includes(ch.showroom_id as string)) {
    return NextResponse.json({ error: 'Sheet không thuộc công ty của bạn.' }, { status: 404 });
  }

  // Lead của sheet này (chỉ cột cần để tổng hợp; tối đa vài trăm dòng).
  const { data: leadRows } = await service.from('leads')
    .select('status, model_id, showroom_id, created_at').eq('channel_account_id', id);
  const leads = (leadRows ?? []) as { status: string | null; model_id: string | null; showroom_id: string | null; created_at: string }[];

  const total = leads.length;
  const byStatus: Record<string, number> = {};
  const byShowroom: Record<string, number> = {};
  let modelCovered = 0;
  let lastLeadAt: string | null = null;
  for (const l of leads) {
    const st = l.status ?? 'Mới';
    byStatus[st] = (byStatus[st] ?? 0) + 1;
    if (l.showroom_id) {
      const nm = srNameById.get(l.showroom_id) ?? l.showroom_id;
      byShowroom[nm] = (byShowroom[nm] ?? 0) + 1;
    }
    if (l.model_id) modelCovered++;
    if (!lastLeadAt || l.created_at > lastLeadAt) lastLeadAt = l.created_at;
  }

  // Cảnh báo cấu hình: showroom nhận lead nào KHÔNG có TVBH active cho thương hiệu của sheet
  // → lead về sẽ không phân giao được cho TVBH.
  const warnings: string[] = [];
  const { data: junction } = await service.from('channel_account_showrooms')
    .select('showroom_id').eq('channel_account_id', id);
  const targetSrIds = junction && junction.length > 0
    ? junction.map((j) => j.showroom_id as string)
    : (ch.showroom_id ? [ch.showroom_id as string] : []);
  if (ch.brand_id && targetSrIds.length > 0) {
    const { data: teams } = await service.from('sales_teams')
      .select('id, showroom_id').in('showroom_id', targetSrIds).eq('brand_id', ch.brand_id);
    const teamRows = (teams ?? []) as { id: string; showroom_id: string }[];
    const teamIds = teamRows.map((t) => t.id);
    const { data: tvbh } = teamIds.length
      ? await service.from('users').select('sales_team_id').in('sales_team_id', teamIds).eq('role', 'tvbh').eq('is_active', true)
      : { data: [] as { sales_team_id: string | null }[] };
    const teamsWithTvbh = new Set((tvbh ?? []).map((u) => u.sales_team_id));
    const coveredSr = new Set(teamRows.filter((t) => teamsWithTvbh.has(t.id)).map((t) => t.showroom_id));
    for (const sid of targetSrIds) {
      if (!coveredSr.has(sid)) warnings.push(`Showroom “${srNameById.get(sid) ?? sid}” chưa có TVBH đang hoạt động cho thương hiệu này — lead sẽ chưa được giao.`);
    }
  }

  return NextResponse.json({
    page_name: ch.page_name,
    total,
    byStatus,
    byShowroom,
    modelCovered,
    modelUncovered: total - modelCovered,
    lastLeadAt,
    lastSync: ch.last_sync ?? null,
    warnings,
  });
}
