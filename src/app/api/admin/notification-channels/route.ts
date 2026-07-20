import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { createServiceClient } from '@/lib/supabase/server';
import { buildPeriodReport, buildChannelReport, type ReportLead } from '@/lib/daily-report';
import { renderChannelDaily } from '@/lib/notify-templates';
import { getOpenBrandIds, isBrandClosed, getInactiveShowroomIds, isShowroomInactive } from '@/lib/company-brands';

const VALID_EVENTS = ['new_lead', 'overdue', 'daily_report', 'weekly_report', 'monthly_report'];

// Dựng báo cáo NGÀY (tính đến thời điểm gọi) cho ĐÚNG 1 kênh → dùng cho tin gửi thử,
// để tin test vẫn có giá trị thật thay vì câu chung chung. Scope theo công ty của admin.
async function buildTestReportText(
  service: ReturnType<typeof createServiceClient>,
  companyId: string,
  ch: { scope: string | null; showroom_id: string | null; sales_team_ids: string[]; name: string | null }
): Promise<string> {
  const now = new Date();
  const todayVn = new Date(now.getTime() + 7 * 3600000);
  todayVn.setUTCHours(0, 0, 0, 0);
  const startUtc = new Date(todayVn.getTime() - 7 * 3600000).toISOString();
  const nowVn = new Date(now.getTime() + 7 * 3600000);
  const p2 = (n: number) => String(n).padStart(2, '0');
  const dm = `${p2(todayVn.getUTCDate())}/${p2(todayVn.getUTCMonth() + 1)}`;
  const hhmm = `${p2(nowVn.getUTCHours())}:${p2(nowVn.getUTCMinutes())}`;
  const dateLabel = `NGÀY ${dm}`;

  const { data: leads } = await service
    .from('leads')
    .select('company_id, brand_id, showroom_id, sales_team_id, status, last_contact_at, next_contact_at, showrooms(name), sales_teams(name), brands(name), model_id, models(name), users!assigned_to(full_name)')
    .eq('company_id', companyId)
    .gte('created_at', startUtc)
    .not('showroom_id', 'is', null);

  const openBrands = await getOpenBrandIds(service, companyId);
  const inactiveSr = await getInactiveShowroomIds(service, companyId);
  const open = (leads ?? []).filter((l) =>
    !isBrandClosed(openBrands, (l.brand_id as string | null) ?? null) &&
    !isShowroomInactive(inactiveSr, (l.showroom_id as string | null) ?? null)
  );
  const mapped: ReportLead[] = open.map((l) => {
    const j = l as unknown as { showrooms: { name: string } | null; sales_teams: { name: string } | null; brands: { name: string } | null; models: { name: string } | null; users: { full_name: string } | null };
    return {
      showroom_id: l.showroom_id as string,
      showroom_name: j.showrooms?.name ?? 'Showroom',
      sales_team_id: (l.sales_team_id as string | null) ?? null,
      team_name: j.sales_teams?.name ?? null,
      brand_id: (l.brand_id as string | null) ?? null,
      brand_name: j.brands?.name ?? null,
      company_id: (l.company_id as string | null) ?? null,
      model_id: (l.model_id as string | null) ?? null,
      model_name: j.models?.name ?? null,
      last_contact_at: l.last_contact_at ?? null,
      next_contact_at: l.next_contact_at ?? null,
      status: l.status ?? null,
      assignee_name: j.users?.full_name ?? null,
    };
  });

  // Chọn báo cáo khớp loại kênh (phòng / showroom / toàn công ty).
  // Seed đúng phòng/showroom của kênh → 0 lead vẫn ra báo cáo (không rỗng khi test).
  let body: string;
  if (ch.scope === 'sales' && ch.sales_team_ids.length > 0) {
    const { data: teamRows } = await service.from('sales_teams').select('id, name, brand_ids').in('id', ch.sales_team_ids);
    const teams = (teamRows ?? []).map((t) => ({ id: t.id, name: t.name, brand_ids: (t.brand_ids as string[] | null) ?? [] }));
    // Danh mục hãng → chi tiết hãng "0 lead" luôn hiện (seed từ brand_ids).
    const seedBrandIds = [...new Set(teams.flatMap((t) => t.brand_ids))];
    const { data: brandRows } = seedBrandIds.length
      ? await service.from('brands').select('id, name').in('id', seedBrandIds)
      : { data: [] as { id: string; name: string }[] };
    const brands = (brandRows ?? []).map((b) => ({ id: b.id, name: b.name }));
    const { data: mbRows } = await service.from('brands').select('id').eq('report_by_model', true);
    const modelBreakBrandIds = new Set((mbRows ?? []).map((b) => String(b.id)));
    const cr = buildChannelReport(mapped, dateLabel, now, { headerName: ch.name ?? 'Showroom', teams, brands }, modelBreakBrandIds);
    body = renderChannelDaily(cr);
  } else if (ch.scope === 'management' && ch.showroom_id) {
    const seedSr = (await service.from('showrooms').select('id, name').eq('id', ch.showroom_id).maybeSingle()).data;
    const report = buildPeriodReport(mapped, dateLabel, now, {
      teams: [], showrooms: seedSr ? [{ id: seedSr.id, name: seedSr.name }] : [],
    });
    body = report.perShowroom.find((s) => s.id === ch.showroom_id)?.text ?? report.management;
  } else {
    const report = buildPeriodReport(mapped, dateLabel, now);
    body = report.management;
  }

  return `<b>TIN NHẮN TEST HỆ THỐNG</b>\nKiểm tra kết nối — số liệu ${dateLabel} tính đến ${hhmm}.\n———\n${body}`;
}

// CRUD notification_channels (kênh Zalo / Telegram nhận thông báo)
export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { service, companyId } = guard.ctx;

  try {
    const body = await request.json();
    const op = body.op as 'create' | 'update' | 'delete' | 'test';

    if (op === 'delete') {
      // FK notifications.channel_id (NO ACTION) chặn xoá khi còn tin tham chiếu.
      // Xoá tin của kênh trước (hàng đợi/lịch sử), rồi xoá kênh — như migration 0029.
      // Chỉ xoá tin của kênh THUỘC công ty admin (cô lập tenant): xác thực kênh trước.
      const { data: ch } = await service.from('notification_channels')
        .select('id').eq('id', body.id).eq('company_id', companyId).maybeSingle();
      if (!ch) return NextResponse.json({ error: 'Không tìm thấy kênh' }, { status: 404 });
      await service.from('notifications').delete().eq('channel_id', ch.id);
      const { error } = await service.from('notification_channels').delete().eq('id', ch.id).eq('company_id', companyId);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    if (op === 'test') {
      const { data: ch, error: chErr } = await service
        .from('notification_channels')
        .select('id, channel, target, name, scope, showroom_id, sales_team_id, sales_team_ids')
        .eq('id', body.id)
        .eq('company_id', companyId)
        .maybeSingle();
      if (chErr || !ch) return NextResponse.json({ error: 'Không tìm thấy kênh' }, { status: 404 });
      if (!companyId) return NextResponse.json({ error: 'Tài khoản chưa gắn công ty.' }, { status: 400 });
      // Tin test = báo cáo ngày thật (lũy kế tới thời điểm gửi) cho đúng kênh này.
      const text = await buildTestReportText(service, companyId, {
        scope: ch.scope, showroom_id: ch.showroom_id,
        sales_team_ids: (ch.sales_team_ids as string[] | null) ?? (ch.sales_team_id ? [ch.sales_team_id] : []),
        name: ch.name,
      });
      const { error } = await service.from('notifications').insert({
        channel: ch.channel,
        channel_id: ch.id,
        status: 'pending',
        payload: { event: 'test', target: ch.target, text },
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    const channel = body.channel === 'telegram' ? 'telegram' : 'zalo';
    const name = String(body.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'Thiếu tên kênh' }, { status: 400 });
    const events = Array.isArray(body.events)
      ? body.events.filter((e: string) => VALID_EVENTS.includes(e))
      : ['new_lead'];
    const scope = body.scope === 'management' ? 'management' : 'sales';
    // Cô lập đa công ty: showroom / phòng bán hàng phải thuộc CÙNG công ty với admin.
    if (scope === 'management' && body.showroom_id) {
      const { data: sr } = await service.from('showrooms')
        .select('id').eq('id', body.showroom_id).eq('company_id', companyId).maybeSingle();
      if (!sr) return NextResponse.json({ error: 'Showroom không thuộc công ty của bạn.' }, { status: 403 });
    }
    // scope='sales': nhận danh sách phòng. Mọi phòng phải thuộc CÙNG công ty (cô lập tenant).
    let salesTeamIds: string[] = [];
    if (scope === 'sales') {
      const raw: unknown[] = Array.isArray(body.sales_team_ids)
        ? body.sales_team_ids
        : (body.sales_team_id ? [body.sales_team_id] : []);
      salesTeamIds = [...new Set(raw.map((x) => String(x)).filter(Boolean))];
      if (salesTeamIds.length === 0) {
        return NextResponse.json({ error: 'Chọn ít nhất 1 phòng bán hàng.' }, { status: 400 });
      }
      const { data: okTeams } = await service.from('sales_teams')
        .select('id').eq('company_id', companyId).in('id', salesTeamIds);
      const okIds = new Set((okTeams ?? []).map((t) => t.id));
      if (salesTeamIds.some((id) => !okIds.has(id))) {
        return NextResponse.json({ error: 'Có phòng không thuộc công ty của bạn.' }, { status: 403 });
      }
    }
    const row = {
      channel,
      name,
      target: body.target ? String(body.target).trim() : null,
      events: events.length ? events : ['new_lead'],
      is_active: body.is_active ?? true,
      scope,
      // Nhiều phòng cho nhóm bán hàng; sales_team_id giữ = phần tử đầu (tương thích code cũ).
      sales_team_ids: scope === 'sales' ? salesTeamIds : [],
      sales_team_id: scope === 'sales' ? (salesTeamIds[0] ?? null) : null,
      showroom_id: scope === 'management' ? (body.showroom_id || null) : null,
    };

    if (op === 'update') {
      const { error } = await service.from('notification_channels').update(row).eq('id', body.id).eq('company_id', companyId);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    const { data, error } = await service
      .from('notification_channels')
      .insert({ ...row, company_id: companyId })
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, id: data.id });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
