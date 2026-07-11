import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkCronSecret } from '@/lib/cron-auth';
import { buildPeriodReport, buildChannelReport, type ReportLead } from '@/lib/daily-report';
import { getMutedTeamIdsGlobal, getInactiveShowroomIdsGlobal, isBrandClosed } from '@/lib/company-brands';

export const dynamic = 'force-dynamic';

type Period = 'daily' | 'weekly' | 'monthly';
const EVENT_BY_PERIOD: Record<Period, string> = {
  daily: 'daily_report', weekly: 'weekly_report', monthly: 'monthly_report',
};

const dm = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

export async function POST(request: NextRequest) {
  if (!checkCronSecret(request.headers.get('x-cron-secret'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const period: Period = (new URL(request.url).searchParams.get('period') as Period) || 'daily';
  const event = EVENT_BY_PERIOD[period] ?? 'daily_report';

  const db = createServiceClient();
  const now = new Date();
  // Đầu ngày HÔM NAY theo giờ VN (UTC+7) tính trên mốc UTC.
  const todayVn = new Date(now.getTime() + 7 * 3600000);
  todayVn.setUTCHours(0, 0, 0, 0);

  // Mốc bắt đầu + nhãn kỳ.
  let startVn: Date;
  let dateLabel: string;
  if (period === 'weekly') {
    startVn = new Date(todayVn.getTime() - 6 * 86400000); // 7 ngày gần nhất (gồm hôm nay)
    dateLabel = `TUẦN ${dm(startVn)}–${dm(todayVn)}`;
  } else if (period === 'monthly') {
    // Timer chạy ngày 28-31; chỉ phát báo cáo vào ĐÚNG ngày cuối tháng (hôm sau sang tháng khác).
    const tomorrow = new Date(todayVn.getTime() + 86400000);
    if (tomorrow.getUTCMonth() === todayVn.getUTCMonth()) {
      return NextResponse.json({ ok: true, period, sent: 0, skipped: 'not_month_end' });
    }
    startVn = new Date(Date.UTC(todayVn.getUTCFullYear(), todayVn.getUTCMonth(), 1));
    dateLabel = `THÁNG ${String(todayVn.getUTCMonth() + 1).padStart(2, '0')}/${todayVn.getUTCFullYear()}`;
  } else {
    startVn = todayVn;
    dateLabel = `NGÀY ${dm(todayVn)}`;
  }
  const startUtc = new Date(startVn.getTime() - 7 * 3600000).toISOString();

  // Lead TẠO trong kỳ
  const { data: leads, error } = await db
    .from('leads')
    .select('company_id, brand_id, showroom_id, sales_team_id, status, last_contact_at, next_contact_at, showrooms(name), sales_teams(name), brands(name), users!assigned_to(full_name)')
    .gte('created_at', startUtc)
    .not('showroom_id', 'is', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Hãng đang TẮT: loại số liệu khỏi báo cáo (R5) + loại phòng khỏi seed (không tạo báo cáo rỗng).
  const { data: cb } = await db.from('company_brands').select('company_id, brand_id');
  const openByCompany = new Map<string, string[]>();
  for (const r of cb ?? []) {
    const row = r as { company_id: string; brand_id: string };
    const arr = openByCompany.get(String(row.company_id)) ?? [];
    arr.push(String(row.brand_id));
    openByCompany.set(String(row.company_id), arr);
  }
  const mutedTeamIds = await getMutedTeamIdsGlobal(db);
  const inactiveSrIds = await getInactiveShowroomIdsGlobal(db);
  const openLeads = (leads ?? []).filter((l) => {
    if (inactiveSrIds.has(String((l.showroom_id as string | null) ?? ''))) return false;
    const cid = (l.company_id as string | null) ?? null;
    if (!cid) return true;
    return !isBrandClosed(openByCompany.get(cid) ?? [], (l.brand_id as string | null) ?? null);
  });

  const mapped: ReportLead[] = openLeads.map((l) => {
    const j = l as unknown as { showrooms: { name: string } | null; sales_teams: { name: string } | null; brands: { name: string } | null; users: { full_name: string } | null };
    return {
      showroom_id: l.showroom_id as string,
      showroom_name: j.showrooms?.name ?? 'Showroom',
      sales_team_id: (l.sales_team_id as string | null) ?? null,
      team_name: j.sales_teams?.name ?? null,
      brand_id: (l.brand_id as string | null) ?? null,
      brand_name: j.brands?.name ?? null,
      last_contact_at: l.last_contact_at ?? null,
      next_contact_at: l.next_contact_at ?? null,
      status: l.status ?? null,
      assignee_name: j.users?.full_name ?? null,
    };
  });

  const { data: channels } = await db
    .from('notification_channels')
    .select('id, channel, target, name, events, showroom_id, sales_team_id, sales_team_ids, scope')
    .eq('is_active', true);

  const has = (c: { events: string[] | null }) => (c.events ?? []).includes(event);

  // Mọi phòng thuộc các kênh sales → tên phòng (cho báo cáo cấp-kênh, kể cả phòng 0 lead).
  const salesChans = (channels ?? []).filter((c) => has(c) && c.scope === 'sales');
  const allTeamIds = [...new Set(salesChans.flatMap((c) =>
    ((c.sales_team_ids as string[] | null) ?? (c.sales_team_id ? [c.sales_team_id as string] : []))
  ).filter((id) => !mutedTeamIds.has(id)))];
  const { data: teamNameRows } = allTeamIds.length
    ? await db.from('sales_teams').select('id, name, brand_ids').in('id', allTeamIds)
    : { data: [] as { id: string; name: string; brand_ids: string[] }[] };
  const teamNameById = new Map((teamNameRows ?? []).map((t) => [t.id, t.name]));
  const teamBrandIds = new Map((teamNameRows ?? []).map((t) => [t.id, (t.brand_ids as string[] | null) ?? []]));

  // Danh mục hãng (id → tên) cho chi tiết hãng "0 lead" seed từ brand_ids.
  const seedBrandIds = [...new Set((teamNameRows ?? []).flatMap((t) => (t.brand_ids as string[] | null) ?? []))];
  const { data: brandRows } = seedBrandIds.length
    ? await db.from('brands').select('id, name').in('id', seedBrandIds)
    : { data: [] as { id: string; name: string }[] };
  const brandList = (brandRows ?? []).map((b) => ({ id: b.id, name: b.name }));

  // Seed showroom: BLĐ theo showroom đã cấu hình group cho kỳ này → luôn có báo cáo (0 lead vẫn gửi).
  const showroomSeedIds = [...new Set((channels ?? []).filter((c) => has(c) && c.scope === 'management' && c.showroom_id && !inactiveSrIds.has(c.showroom_id as string)).map((c) => c.showroom_id as string))];
  const { data: srRows } = showroomSeedIds.length
    ? await db.from('showrooms').select('id, name').in('id', showroomSeedIds)
    : { data: [] as { id: string; name: string }[] };

  const report = buildPeriodReport(mapped, dateLabel, now, {
    teams: [],
    showrooms: (srRows ?? []).map((s) => ({ id: s.id, name: s.name })),
  });

  const inserts: Record<string, unknown>[] = [];

  // Nhóm bán hàng: CHỈ nhận báo cáo NGÀY. Mỗi KÊNH dựng báo cáo cấp-kênh theo tập phòng của nó.
  if (period === 'daily') {
    for (const c of salesChans) {
      const ids = ((c.sales_team_ids as string[] | null) ?? (c.sales_team_id ? [c.sales_team_id as string] : []))
        .filter((id) => !mutedTeamIds.has(id));
      if (ids.length === 0) continue;
      const teams = ids.map((id) => ({ id, name: teamNameById.get(id) ?? 'Phòng', brand_ids: teamBrandIds.get(id) ?? [] }));
      const cr = buildChannelReport(mapped, dateLabel, now, { headerName: c.name ?? 'Showroom', teams, brands: brandList });
      const { renderChannelDaily } = await import('@/lib/notify-templates');
      inserts.push({ channel: c.channel, channel_id: c.id, status: 'pending',
        payload: { event, target: c.target, text: renderChannelDaily(cr) } });
    }
  }

  // Nhóm BLĐ theo showroom: nhận ngày + tuần + tháng (theo event của kỳ).
  for (const sr of report.perShowroom) {
    const targets = (channels ?? []).filter((c) => has(c) && c.scope === 'management' && c.showroom_id === sr.id);
    for (const c of targets) {
      inserts.push({ channel: c.channel, channel_id: c.id, status: 'pending',
        payload: { event, target: c.target, text: sr.text } });
    }
  }

  // Nhóm BLĐ toàn công ty (showroom_id null): bảng tổng hợp.
  const companyTargets = (channels ?? []).filter((c) => has(c) && c.scope === 'management' && c.showroom_id == null);
  for (const c of companyTargets) {
    inserts.push({ channel: c.channel, channel_id: c.id, status: 'pending',
      payload: { event, target: c.target, text: report.management } });
  }

  if (inserts.length > 0) await db.from('notifications').insert(inserts);
  return NextResponse.json({ ok: true, period, sent: inserts.length });
}
