import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkCronSecret } from '@/lib/cron-auth';
import { buildPeriodReport, buildChannelReport, buildChannelPeriodReport, buildLongPeriodReport, buildBrandReport, type ReportLead } from '@/lib/daily-report';
import { getMutedTeamIdsGlobal, getInactiveShowroomIdsGlobal, isBrandClosed } from '@/lib/company-brands';
import { buildDailyPushPerUser, type DailyPushUser, type DailyPushLead } from '@/lib/push-daily';
import { sendPushToUsers } from '@/lib/push';

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
  const mm = (d: Date) => String(d.getUTCMonth() + 1).padStart(2, '0');
  const monthLabel = (d: Date) => `THÁNG ${mm(d)}/${d.getUTCFullYear()}`;

  // Cửa sổ kỳ HIỆN TẠI [curStartVn, endVn) + kỳ TRƯỚC [prevStartVn, curStartVn) cùng độ dài (để so sánh).
  // Báo cáo NGÀY: chỉ 1 kỳ, không cận trên (tới hiện tại), không so sánh.
  // Báo cáo TUẦN: chạy 07:30 thứ 2 → báo cáo TUẦN VỪA XONG (7 ngày trước hôm nay: T2 tuần trước → CN).
  // Báo cáo THÁNG: chạy 07:30 ngày 1 → báo cáo THÁNG VỪA XONG (tháng liền trước).
  let curStartVn: Date;
  let endVn: Date | null;
  let prevStartVn: Date | null;
  let dateLabel: string;
  let prevLabel = '';
  if (period === 'weekly') {
    curStartVn = new Date(todayVn.getTime() - 7 * 86400000);
    endVn = todayVn;
    prevStartVn = new Date(todayVn.getTime() - 14 * 86400000);
    dateLabel = `TUẦN ${dm(curStartVn)}–${dm(new Date(endVn.getTime() - 86400000))}`;
    prevLabel = `TUẦN ${dm(prevStartVn)}–${dm(new Date(curStartVn.getTime() - 86400000))}`;
  } else if (period === 'monthly') {
    curStartVn = new Date(Date.UTC(todayVn.getUTCFullYear(), todayVn.getUTCMonth() - 1, 1));
    endVn = new Date(Date.UTC(todayVn.getUTCFullYear(), todayVn.getUTCMonth(), 1));
    prevStartVn = new Date(Date.UTC(todayVn.getUTCFullYear(), todayVn.getUTCMonth() - 2, 1));
    dateLabel = monthLabel(curStartVn);
    prevLabel = monthLabel(prevStartVn);
  } else {
    curStartVn = todayVn;
    endVn = null;
    prevStartVn = null;
    dateLabel = `NGÀY ${dm(todayVn)}`;
  }
  const toUtcIso = (vn: Date) => new Date(vn.getTime() - 7 * 3600000).toISOString();
  const queryStartUtc = toUtcIso(prevStartVn ?? curStartVn);
  const curStartUtcMs = new Date(toUtcIso(curStartVn)).getTime();

  // Lead TẠO trong kỳ (gồm cả kỳ trước để so sánh với báo cáo tuần/tháng).
  let query = db
    .from('leads')
    .select('company_id, brand_id, showroom_id, sales_team_id, assigned_to, status, created_at, last_contact_at, next_contact_at, showrooms(name), sales_teams(name), brands(name), model_id, models(name), users!assigned_to(full_name)')
    .gte('created_at', queryStartUtc)
    .not('showroom_id', 'is', null);
  if (endVn) query = query.lt('created_at', toUtcIso(endVn));
  const { data: leads, error } = await query;
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

  const toReportLead = (l: (typeof openLeads)[number]): ReportLead => {
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
  };
  // Tách lead kỳ hiện tại / kỳ trước theo mốc created_at (kỳ trước chỉ dùng để so sánh tuần/tháng).
  const mapped: ReportLead[] = openLeads
    .filter((l) => new Date(String(l.created_at)).getTime() >= curStartUtcMs)
    .map(toReportLead);
  const mappedPrev: ReportLead[] = openLeads
    .filter((l) => new Date(String(l.created_at)).getTime() < curStartUtcMs)
    .map(toReportLead);

  const { data: channels } = await db
    .from('notification_channels')
    .select('id, channel, target, name, events, showroom_id, sales_team_id, sales_team_ids, scope, company_id, brand_ids')
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

  // Thương hiệu tách chi tiết theo DÒNG XE (cờ report_by_model). brands là master toàn cục.
  const { data: mbRows } = await db.from('brands').select('id').eq('report_by_model', true);
  const modelBreakBrandIds = new Set((mbRows ?? []).map((b) => String(b.id)));

  // Seed showroom: BLĐ theo showroom đã cấu hình group cho kỳ này → luôn có báo cáo (0 lead vẫn gửi).
  const showroomSeedIds = [...new Set((channels ?? []).filter((c) => has(c) && c.scope === 'management' && c.showroom_id && !inactiveSrIds.has(c.showroom_id as string)).map((c) => c.showroom_id as string))];
  const { data: srRows } = showroomSeedIds.length
    ? await db.from('showrooms').select('id, name').in('id', showroomSeedIds)
    : { data: [] as { id: string; name: string }[] };

  const showroomSeed = (srRows ?? []).map((s) => ({ id: s.id, name: s.name }));
  // NGÀY: bố cục theo dõi vận hành (quá hạn, chưa tuân thủ). TUẦN/THÁNG: tập trung kết quả + so kỳ trước.
  const report = period === 'daily'
    ? buildPeriodReport(mapped, dateLabel, now, { showrooms: showroomSeed }, modelBreakBrandIds)
    : buildLongPeriodReport(mapped, mappedPrev, dateLabel, prevLabel, now, { showrooms: showroomSeed }, modelBreakBrandIds);

  const inserts: Record<string, unknown>[] = [];

  // Nhóm bán hàng nhận báo cáo cấp-kênh (theo tập phòng của kênh): NGÀY = bố cục vận hành
  // (quá hạn), TUẦN/THÁNG = tập trung kết quả + so kỳ trước.
  const { renderChannelDaily, renderChannelPeriod } = await import('@/lib/notify-templates');
  for (const c of salesChans) {
    const ids = ((c.sales_team_ids as string[] | null) ?? (c.sales_team_id ? [c.sales_team_id as string] : []))
      .filter((id) => !mutedTeamIds.has(id));
    if (ids.length === 0) continue;
    const teams = ids.map((id) => ({ id, name: teamNameById.get(id) ?? 'Phòng', brand_ids: teamBrandIds.get(id) ?? [] }));
    const seed = { headerName: c.name ?? 'Showroom', teams, brands: brandList };
    const text = period === 'daily'
      ? renderChannelDaily(buildChannelReport(mapped, dateLabel, now, seed, modelBreakBrandIds))
      : renderChannelPeriod(buildChannelPeriodReport(mapped, mappedPrev, dateLabel, prevLabel, now, seed, modelBreakBrandIds));
    inserts.push({ channel: c.channel, channel_id: c.id, status: 'pending',
      payload: { event, target: c.target, text } });
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

  // Nhóm BLĐ thương hiệu (scope='brand'): mỗi hãng phụ trách 1 khối. Cô lập tenant:
  // LUÔN lọc company_id của kênh KÈM brand_id (brands là master toàn cục — bài học bug 0033).
  const brandChans = (channels ?? []).filter((c) => has(c) && c.scope === 'brand');
  if (brandChans.length > 0) {
    const { renderBrandReport } = await import('@/lib/notify-templates');
    const brandSeedIds = [...new Set(brandChans.flatMap((c) => (c.brand_ids as string[] | null) ?? []))];
    const { data: bRows } = brandSeedIds.length
      ? await db.from('brands').select('id, name').in('id', brandSeedIds)
      : { data: [] as { id: string; name: string }[] };
    const brandNameById = new Map((bRows ?? []).map((b) => [String(b.id), b.name]));
    for (const c of brandChans) {
      const bids = (c.brand_ids as string[] | null) ?? [];
      if (bids.length === 0) continue;
      const brandLeads = mapped.filter((l) =>
        l.company_id === c.company_id && l.brand_id != null && bids.includes(l.brand_id));
      const seed = { headerName: c.name ?? 'BLĐ thương hiệu', brands: bids.map((id) => ({ id, name: brandNameById.get(id) ?? 'Thương hiệu' })) };
      const text = renderBrandReport(buildBrandReport(brandLeads, dateLabel, now, seed));
      inserts.push({ channel: c.channel, channel_id: c.id, status: 'pending', payload: { event, target: c.target, text } });
    }
  }

  if (inserts.length > 0) await db.from('notifications').insert(inserts);

  // ── Web Push cá nhân báo cáo cuối ngày (chỉ kỳ NGÀY, song song Zalo) ───────
  if (period === 'daily') {
    const curLeads = openLeads.filter((l) => new Date(String(l.created_at)).getTime() >= curStartUtcMs);
    const companyIds = [...new Set(curLeads.map((l) => (l.company_id as string | null) ?? '').filter(Boolean))];
    if (companyIds.length > 0) {
      const [{ data: uRows }, { data: usRows }] = await Promise.all([
        db.from('users').select('id, role, company_id, sales_team_id').in('company_id', companyIds),
        db.from('user_showrooms').select('user_id, showroom_id'),
      ]);
      const srByUser = new Map<string, string[]>();
      for (const r of (usRows ?? []) as { user_id: string; showroom_id: string }[]) {
        const arr = srByUser.get(r.user_id) ?? []; arr.push(r.showroom_id); srByUser.set(r.user_id, arr);
      }
      const dpUsers: DailyPushUser[] = ((uRows ?? []) as { id: string; role: string; company_id: string | null; sales_team_id: string | null }[])
        .map((u) => ({ ...u, showroom_ids: srByUser.get(u.id) ?? [] }));
      const dpLeads: DailyPushLead[] = curLeads.map((l) => ({
        company_id: (l.company_id as string | null) ?? null,
        sales_team_id: (l.sales_team_id as string | null) ?? null,
        showroom_id: (l.showroom_id as string | null) ?? null,
        assignee_id: (l.assigned_to as string | null) ?? null,
        status: (l.status as string | null) ?? null,
        next_contact_at: (l.next_contact_at as string | null) ?? null,
      }));
      const msgs = buildDailyPushPerUser(dpLeads, dpUsers, now);
      const userCompany = new Map(dpUsers.map((u) => [u.id, u.company_id]));
      await Promise.all(msgs.map((m) =>
        sendPushToUsers(db, userCompany.get(m.userId) ?? null, [m.userId], { title: m.title, body: m.body, url: m.url })
      ));
    }
  }

  return NextResponse.json({ ok: true, period, sent: inserts.length });
}
