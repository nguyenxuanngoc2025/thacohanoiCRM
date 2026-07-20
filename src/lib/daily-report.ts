import {
  renderDailySr, renderDailyMgmt, renderPeriodSr, renderPeriodMgmt,
  type DailySrStats, type MgmtRow, type NonCompliant, type PeriodMgmtRow,
} from './notify-templates';

export interface ReportLead {
  showroom_id: string;
  showroom_name: string;
  // Phòng bán hàng phụ trách lead (null = chưa thuộc phòng nào → không vào báo cáo nhóm bán hàng).
  sales_team_id: string | null;
  team_name: string | null;
  // Thương hiệu của lead (từ kênh) — để tách chi tiết theo hãng trong báo cáo.
  brand_id: string | null;
  brand_name: string | null;
  last_contact_at: string | null;
  next_contact_at: string | null;
  status: string | null;
  assignee_name: string | null;
}

export interface ScopedReport {
  // id = showroom_id (perShowroom) hoặc sales_team_id (perTeam)
  id: string;
  name: string;
  stats: DailySrStats;
  text: string;
}

export interface PeriodReport {
  // Báo cáo từng phòng bán hàng → gửi vào group của phòng (kênh scope='sales').
  perTeam: ScopedReport[];
  // Báo cáo từng showroom → gửi nhóm BLĐ showroom (kênh scope='management' có showroom_id).
  perShowroom: ScopedReport[];
  // Bảng tổng hợp toàn công ty → gửi nhóm BLĐ công ty (kênh scope='management' showroom_id null).
  management: string;
}

// Phòng/showroom đã cấu hình group nhận báo cáo → luôn xuất hiện trong báo cáo
// (kèm số 0 nếu kỳ này không có lead), để group đã tạo vẫn nhận báo cáo đều.
export interface ReportSeed {
  teams?: { id: string; name: string }[];
  showrooms?: { id: string; name: string }[];
}

export interface BrandBreak {
  name: string;
  stats: DailySrStats;
}

export interface ChannelPhong {
  name: string;
  stats: DailySrStats;
  brands: BrandBreak[];
  nonCompliant: NonCompliant[];
}

export interface ChannelReport {
  dateLabel: string;
  headerName: string;
  overview: { stats: DailySrStats; brands: BrandBreak[] };
  phongs: ChannelPhong[];
}

export interface ChannelReportSeed {
  headerName: string;
  // brand_ids = tập hãng CỐ ĐỊNH phòng bán → luôn hiện chi tiết hãng (kể cả 0 lead).
  teams: { id: string; name: string; brand_ids?: string[] }[];
  // Danh mục hãng (id → tên) để đặt tên hãng khi seed từ brand_ids (chưa có lead nào).
  brands?: { id: string; name: string }[];
}

function emptyStats(): DailySrStats {
  return { total: 0, contacted: 0, pending: 0, overdue: 0, KHQT: 0, GDTD: 0, KyHD: 0, Fail: 0 };
}

interface Bucket {
  name: string;
  stats: DailySrStats;
  overdueByAssignee: Map<string, number>;
  byBrand: Map<string, { name: string; stats: DailySrStats }>;
}

function newBucket(name: string): Bucket {
  return { name, stats: emptyStats(), overdueByAssignee: new Map<string, number>(), byBrand: new Map() };
}

// Tạo trước 1 hãng trong bucket (stats 0) để chi tiết hãng luôn hiện dù chưa có lead.
function seedBrand(g: Bucket, brandId: string, name: string): void {
  if (!g.byBrand.has(brandId)) g.byBrand.set(brandId, { name, stats: emptyStats() });
}

// Cộng số liệu thuần (không đụng overdueByAssignee) — dùng cho cả bucket chính lẫn sub-bucket hãng.
function addStats(s: DailySrStats, l: ReportLead, now: Date): void {
  s.total += 1;
  const contacted = l.last_contact_at != null;
  if (contacted) s.contacted += 1;
  else {
    s.pending += 1;
    if (l.next_contact_at && new Date(l.next_contact_at).getTime() <= now.getTime()) s.overdue += 1;
  }
  if (l.status === 'KHQT') s.KHQT += 1;
  else if (l.status === 'GDTD') s.GDTD += 1;
  else if (l.status === 'KHĐ') s.KyHD += 1;
  else if (l.status === 'Fail') s.Fail += 1;
}

// Cộng dồn 1 lead vào bucket (showroom hoặc team) + sub-bucket theo hãng. now để xác định quá hạn.
function accumulate(g: Bucket, l: ReportLead, now: Date): void {
  addStats(g.stats, l, now);
  const contacted = l.last_contact_at != null;
  if (!contacted && l.next_contact_at && new Date(l.next_contact_at).getTime() <= now.getTime()) {
    const who = l.assignee_name?.trim() || 'Chưa phân';
    g.overdueByAssignee.set(who, (g.overdueByAssignee.get(who) ?? 0) + 1);
  }
  if (l.brand_id) {
    const bb = g.byBrand.get(l.brand_id) ?? { name: l.brand_name?.trim() || 'Khác', stats: emptyStats() };
    addStats(bb.stats, l, now);
    g.byBrand.set(l.brand_id, bb);
  }
}

function nonCompliantOf(g: Bucket): NonCompliant[] {
  return [...g.overdueByAssignee.entries()]
    .map(([name, overdue]) => ({ name, overdue }))
    .sort((a, b) => b.overdue - a.overdue);
}

/**
 * Từ danh sách lead trong kỳ → báo cáo 3 cấp:
 *  - perTeam: thống kê từng phòng bán hàng (chỉ lead có sales_team_id).
 *  - perShowroom: thống kê từng showroom.
 *  - management: bảng tổng hợp toàn công ty.
 * dateLabel đã gồm từ chỉ kỳ ('NGÀY 24/06' | 'TUẦN ...' | 'THÁNG ...').
 */
export function buildPeriodReport(leads: ReportLead[], dateLabel: string, now: Date, seed?: ReportSeed): PeriodReport {
  const teams = new Map<string, Bucket>();
  const showrooms = new Map<string, Bucket>();

  // Tạo sẵn bucket rỗng cho phòng/showroom đã có group → có lead thì cộng dồn,
  // không có lead vẫn ra báo cáo "0 lead" cho group đó.
  for (const t of seed?.teams ?? []) teams.set(t.id, newBucket(t.name));
  for (const s of seed?.showrooms ?? []) showrooms.set(s.id, newBucket(s.name));

  for (const l of leads) {
    const sg = showrooms.get(l.showroom_id) ?? newBucket(l.showroom_name);
    accumulate(sg, l, now);
    showrooms.set(l.showroom_id, sg);

    if (l.sales_team_id) {
      const tg = teams.get(l.sales_team_id) ?? newBucket(l.team_name?.trim() || l.showroom_name);
      accumulate(tg, l, now);
      teams.set(l.sales_team_id, tg);
    }
  }

  const perTeam: ScopedReport[] = [...teams.entries()].map(([id, g]) => ({
    id, name: g.name, stats: g.stats,
    text: renderDailySr(g.name, dateLabel, g.stats, nonCompliantOf(g)),
  }));

  const perShowroom: ScopedReport[] = [];
  const mgmtRows: MgmtRow[] = [];
  let tTotal = 0, tContacted = 0, tOverdue = 0;
  for (const [showroomId, g] of showrooms) {
    perShowroom.push({
      id: showroomId, name: g.name, stats: g.stats,
      text: renderDailySr(g.name, dateLabel, g.stats, nonCompliantOf(g)),
    });
    mgmtRows.push({
      showroom: g.name, total: g.stats.total, contacted: g.stats.contacted,
      pending: g.stats.pending, overdue: g.stats.overdue,
      contactRate: g.stats.total ? Math.round((g.stats.contacted / g.stats.total) * 100) : 0,
    });
    tTotal += g.stats.total; tContacted += g.stats.contacted; tOverdue += g.stats.overdue;
  }

  return {
    perTeam,
    perShowroom,
    management: renderDailyMgmt(dateLabel, mgmtRows, { total: tTotal, contacted: tContacted, overdue: tOverdue }),
  };
}

// Cộng dồn mọi trường của 1 stats vào accumulator (dùng tính TỔNG toàn công ty).
function sumInto(acc: DailySrStats, s: DailySrStats): void {
  acc.total += s.total; acc.contacted += s.contacted; acc.pending += s.pending;
  acc.overdue += s.overdue; acc.KHQT += s.KHQT; acc.GDTD += s.GDTD; acc.KyHD += s.KyHD; acc.Fail += s.Fail;
}

export interface LongPeriodReport {
  // Báo cáo từng showroom (kèm so kỳ trước) → gửi nhóm BLĐ showroom.
  perShowroom: ScopedReport[];
  // Bảng tổng hợp toàn công ty (xếp hạng showroom + so kỳ trước) → gửi nhóm BLĐ công ty.
  management: string;
}

/**
 * Báo cáo KỲ DÀI (TUẦN / THÁNG) — tập trung KẾT QUẢ, KHÔNG "quá hạn/chưa tuân thủ".
 * Nhận lead của kỳ HIỆN TẠI + kỳ TRƯỚC (cùng độ dài) để so sánh. Chỉ 2 cấp:
 *  - perShowroom: kết quả từng showroom (tổng, tỷ lệ LH, phễu chốt, tỷ lệ chốt, chi tiết hãng, so kỳ trước).
 *  - management: bảng tổng hợp công ty + xếp hạng showroom theo Ký HĐ.
 * Nhóm bán hàng KHÔNG nhận báo cáo kỳ dài (chỉ nhận báo cáo ngày).
 */
export function buildLongPeriodReport(
  current: ReportLead[], previous: ReportLead[],
  dateLabel: string, prevLabel: string, now: Date, seed?: ReportSeed,
): LongPeriodReport {
  const cur = new Map<string, Bucket>();
  const prev = new Map<string, Bucket>();
  // Seed showroom đã cấu hình group → luôn ra báo cáo (kể cả 0 lead).
  for (const s of seed?.showrooms ?? []) { cur.set(s.id, newBucket(s.name)); prev.set(s.id, newBucket(s.name)); }
  for (const l of current) {
    const g = cur.get(l.showroom_id) ?? newBucket(l.showroom_name);
    accumulate(g, l, now); cur.set(l.showroom_id, g);
  }
  for (const l of previous) {
    const g = prev.get(l.showroom_id) ?? newBucket(l.showroom_name);
    accumulate(g, l, now); prev.set(l.showroom_id, g);
  }

  const perShowroom: ScopedReport[] = [];
  const rows: PeriodMgmtRow[] = [];
  const curTotals = emptyStats();
  const prevTotals = emptyStats();
  for (const [id, g] of cur) {
    const p = prev.get(id) ?? newBucket(g.name);
    perShowroom.push({
      id, name: g.name, stats: g.stats,
      text: renderPeriodSr(g.name, dateLabel, prevLabel, g.stats, p.stats, brandBreaks(g)),
    });
    rows.push({ showroom: g.name, cur: g.stats, prev: p.stats });
    sumInto(curTotals, g.stats); sumInto(prevTotals, p.stats);
  }

  return { perShowroom, management: renderPeriodMgmt(dateLabel, prevLabel, rows, curTotals, prevTotals) };
}

// Danh sách chi tiết hãng của 1 bucket, sắp theo tên hãng cho ổn định.
function brandBreaks(g: Bucket): BrandBreak[] {
  return [...g.byBrand.values()]
    .map((b) => ({ name: b.name, stats: b.stats }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

/**
 * Báo cáo cấp KÊNH (1 kênh Zalo gắn nhiều phòng): TỔNG QUAN (cộng dồn các phòng, kèm
 * tách hãng) + từng PHÒNG (kèm tách hãng). Chỉ gom lead có sales_team_id thuộc seed.teams.
 * Phòng trong seed nhưng 0 lead vẫn xuất hiện (báo cáo số 0).
 */
export function buildChannelReport(
  leads: ReportLead[], dateLabel: string, now: Date, seed: ChannelReportSeed,
): ChannelReport {
  const teamIds = new Set(seed.teams.map((t) => t.id));
  const brandName = new Map((seed.brands ?? []).map((b) => [b.id, b.name]));
  const overview = newBucket(seed.headerName);
  const teamBuckets = new Map<string, Bucket>();
  for (const t of seed.teams) {
    const tb = newBucket(t.name);
    // Seed sẵn hãng phòng bán (0 lead) → chi tiết hãng LUÔN xuất hiện.
    for (const bid of t.brand_ids ?? []) {
      seedBrand(tb, bid, brandName.get(bid) ?? 'Khác');
      seedBrand(overview, bid, brandName.get(bid) ?? 'Khác');
    }
    teamBuckets.set(t.id, tb);
  }

  for (const l of leads) {
    if (!l.sales_team_id || !teamIds.has(l.sales_team_id)) continue;
    accumulate(overview, l, now);
    const tb = teamBuckets.get(l.sales_team_id) ?? newBucket(l.team_name?.trim() || l.showroom_name);
    accumulate(tb, l, now);
    teamBuckets.set(l.sales_team_id, tb);
  }

  return {
    dateLabel,
    headerName: seed.headerName,
    overview: { stats: overview.stats, brands: brandBreaks(overview) },
    phongs: [...teamBuckets.values()].map((b) => ({
      name: b.name, stats: b.stats, brands: brandBreaks(b), nonCompliant: nonCompliantOf(b),
    })),
  };
}
