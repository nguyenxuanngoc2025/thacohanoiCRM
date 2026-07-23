import {
  renderDailySr, renderDailyMgmt, renderPeriodSr, renderPeriodMgmt,
  type DailySrStats, type NonCompliant,
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
  // Công ty của lead — để cô lập đa tenant khi định tuyến báo cáo brand (brands là master toàn cục).
  company_id: string | null;
  // Dòng xe của lead (auto-dò lúc nạp) — để tách chi tiết theo dòng xe cho thương hiệu có cờ report_by_model.
  model_id: string | null;
  model_name: string | null;
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

export interface BrandBlock {
  brandId: string;
  brandName: string;
  stats: DailySrStats;
  models: BrandBreak[];     // theo dòng xe (name + stats)
}

export interface BrandReport {
  dateLabel: string;   // "NGÀY 20/07" | "TUẦN .." | "THÁNG .."
  headerName: string;  // tên nhóm (kênh)
  blocks: BrandBlock[]; // 1 khối / thương hiệu, theo thứ tự seed
}

export interface ChannelPhong {
  name: string;
  stats: DailySrStats;
  brands: BrandBreak[];
  byModel: boolean;
  nonCompliant: NonCompliant[];
}

export interface ChannelReport {
  dateLabel: string;
  headerName: string;
  overview: { stats: DailySrStats; brands: BrandBreak[]; byModel: boolean };
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
  // true = nhóm chi tiết gom theo DÒNG XE (thương hiệu có cờ report_by_model); false = theo thương hiệu.
  byModel: boolean;
}

function newBucket(name: string): Bucket {
  return { name, stats: emptyStats(), overdueByAssignee: new Map<string, number>(), byBrand: new Map(), byModel: false };
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

// Cộng dồn 1 lead vào bucket + sub-bucket chi tiết. now để xác định quá hạn.
// Cách gom chi tiết theo cờ g.byModel do CALLER quyết định TRƯỚC (nhất quán cả bucket):
// byModel=true → gom theo DÒNG XE; false → gom theo THƯƠNG HIỆU.
function accumulate(g: Bucket, l: ReportLead, now: Date): void {
  addStats(g.stats, l, now);
  const contacted = l.last_contact_at != null;
  if (!contacted && l.next_contact_at && new Date(l.next_contact_at).getTime() <= now.getTime()) {
    const who = l.assignee_name?.trim() || 'Chưa phân';
    g.overdueByAssignee.set(who, (g.overdueByAssignee.get(who) ?? 0) + 1);
  }
  if (g.byModel) {
    const key = `m:${l.model_id ?? 'none'}`;
    const bb = g.byBrand.get(key) ?? { name: l.model_name?.trim() || 'Chưa xác định', stats: emptyStats() };
    addStats(bb.stats, l, now);
    g.byBrand.set(key, bb);
  } else if (l.brand_id) {
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

// Showroom nào gom chi tiết theo DÒNG XE: có ≥1 lead thuộc thương hiệu cờ report_by_model
// VÀ không có lead thương hiệu nào ngoài tập cờ (mirror "isModelTeam" cấp phòng). Showroom
// lẫn hãng cờ + hãng thường → theo THƯƠNG HIỆU (fallback an toàn, không trộn 2 kiểu).
function modelShowroomIds(leads: ReportLead[], modelBreakBrandIds: Set<string>): Set<string> {
  const hasFlagged = new Set<string>();
  const hasOther = new Set<string>();
  for (const l of leads) {
    if (!l.brand_id) continue;
    if (modelBreakBrandIds.has(l.brand_id)) hasFlagged.add(l.showroom_id);
    else hasOther.add(l.showroom_id);
  }
  const res = new Set<string>();
  for (const id of hasFlagged) if (!hasOther.has(id)) res.add(id);
  return res;
}

/**
 * Từ danh sách lead trong kỳ → báo cáo 3 cấp:
 *  - perTeam: thống kê từng phòng bán hàng (chỉ lead có sales_team_id).
 *  - perShowroom: thống kê từng showroom.
 *  - management: bảng tổng hợp toàn công ty.
 * dateLabel đã gồm từ chỉ kỳ ('NGÀY 24/06' | 'TUẦN ...' | 'THÁNG ...').
 */
// Cấp toàn công ty gom chi tiết theo DÒNG XE khi MỌI lead có hãng đều thuộc tập cờ report_by_model
// (không lẫn hãng thường). Ngược lại → theo THƯƠNG HIỆU.
function companyByModel(leads: ReportLead[], modelBreakBrandIds: Set<string>): boolean {
  let hasFlagged = false, hasOther = false;
  for (const l of leads) {
    if (!l.brand_id) continue;
    if (modelBreakBrandIds.has(l.brand_id)) hasFlagged = true; else hasOther = true;
  }
  return hasFlagged && !hasOther;
}

export function buildPeriodReport(
  leads: ReportLead[], dateLabel: string, now: Date, seed?: ReportSeed,
  modelBreakBrandIds: Set<string> = new Set(),
): PeriodReport {
  const modelSr = modelShowroomIds(leads, modelBreakBrandIds);
  const mkSr = (id: string, name: string): Bucket => {
    const g = newBucket(name);
    g.byModel = modelSr.has(id);
    return g;
  };
  const teams = new Map<string, Bucket>();
  const showrooms = new Map<string, Bucket>();
  // Bucket tổng toàn công ty (nhóm BLĐ công ty) — chi tiết theo thương hiệu / dòng xe.
  const company = newBucket('TỔNG HỢP BAN LÃNH ĐẠO');
  company.byModel = companyByModel(leads, modelBreakBrandIds);

  // Tạo sẵn bucket rỗng cho phòng/showroom đã có group → có lead thì cộng dồn,
  // không có lead vẫn ra báo cáo "0 lead" cho group đó.
  for (const t of seed?.teams ?? []) teams.set(t.id, newBucket(t.name));
  for (const s of seed?.showrooms ?? []) showrooms.set(s.id, mkSr(s.id, s.name));

  for (const l of leads) {
    const sg = showrooms.get(l.showroom_id) ?? mkSr(l.showroom_id, l.showroom_name);
    accumulate(sg, l, now);
    showrooms.set(l.showroom_id, sg);
    accumulate(company, l, now);

    if (l.sales_team_id) {
      const tg = teams.get(l.sales_team_id) ?? newBucket(l.team_name?.trim() || l.showroom_name);
      accumulate(tg, l, now);
      teams.set(l.sales_team_id, tg);
    }
  }

  const perTeam: ScopedReport[] = [...teams.entries()].map(([id, g]) => ({
    id, name: g.name, stats: g.stats,
    text: renderDailySr(g.name, dateLabel, g.stats, nonCompliantOf(g), brandBreaks(g), g.byModel),
  }));

  const perShowroom: ScopedReport[] = [];
  for (const [showroomId, g] of showrooms) {
    perShowroom.push({
      id: showroomId, name: g.name, stats: g.stats,
      text: renderDailySr(g.name, dateLabel, g.stats, nonCompliantOf(g), brandBreaks(g), g.byModel),
    });
  }

  return {
    perTeam,
    perShowroom,
    management: renderDailyMgmt(dateLabel, company.stats, brandBreaks(company), company.byModel),
  };
}

export interface LongPeriodReport {
  // Báo cáo từng showroom (kèm so kỳ trước) → gửi nhóm BLĐ showroom.
  perShowroom: ScopedReport[];
  // Bảng tổng hợp toàn công ty (chi tiết theo thương hiệu + so kỳ trước) → gửi nhóm BLĐ công ty.
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
  modelBreakBrandIds: Set<string> = new Set(),
): LongPeriodReport {
  // Showroom "theo dòng xe": MỌI lead có hãng đều thuộc tập cờ (không lẫn hãng khác) —
  // quyết định TRƯỚC để mục chi tiết đồng nhất, tránh trộn dòng xe + thương hiệu khi lẫn hãng.
  const modelSr = modelShowroomIds([...current, ...previous], modelBreakBrandIds);
  const mkSr = (id: string, name: string): Bucket => {
    const g = newBucket(name);
    g.byModel = modelSr.has(id);
    return g;
  };
  const cur = new Map<string, Bucket>();
  const prev = new Map<string, Bucket>();
  // Bucket tổng toàn công ty (nhóm BLĐ công ty) — chi tiết theo thương hiệu / dòng xe, so kỳ trước.
  const companyCur = newBucket('TỔNG HỢP BAN LÃNH ĐẠO');
  const companyPrev = newBucket('TỔNG HỢP BAN LÃNH ĐẠO');
  companyCur.byModel = companyByModel([...current, ...previous], modelBreakBrandIds);
  // Seed showroom đã cấu hình group → luôn ra báo cáo (kể cả 0 lead).
  for (const s of seed?.showrooms ?? []) { cur.set(s.id, mkSr(s.id, s.name)); prev.set(s.id, mkSr(s.id, s.name)); }
  for (const l of current) {
    const g = cur.get(l.showroom_id) ?? mkSr(l.showroom_id, l.showroom_name);
    accumulate(g, l, now); cur.set(l.showroom_id, g);
    accumulate(companyCur, l, now);
  }
  for (const l of previous) {
    const g = prev.get(l.showroom_id) ?? mkSr(l.showroom_id, l.showroom_name);
    accumulate(g, l, now); prev.set(l.showroom_id, g);
    accumulate(companyPrev, l, now);
  }

  const perShowroom: ScopedReport[] = [];
  for (const [id, g] of cur) {
    const p = prev.get(id) ?? newBucket(g.name);
    perShowroom.push({
      id, name: g.name, stats: g.stats,
      text: renderPeriodSr(g.name, dateLabel, prevLabel, g.stats, p.stats, brandBreaks(g), g.byModel),
    });
  }

  return {
    perShowroom,
    management: renderPeriodMgmt(dateLabel, prevLabel, companyCur.stats, companyPrev.stats, brandBreaks(companyCur), companyCur.byModel),
  };
}

// Danh sách chi tiết của 1 bucket. Theo dòng xe (byModel) → sắp tổng giảm dần rồi theo tên;
// theo thương hiệu → sắp theo tên (như cũ).
function brandBreaks(g: Bucket): BrandBreak[] {
  const arr = [...g.byBrand.values()].map((b) => ({ name: b.name, stats: b.stats }));
  if (g.byModel) {
    return arr.sort((a, b) => b.stats.total - a.stats.total || a.name.localeCompare(b.name, 'vi'));
  }
  return arr.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

/**
 * Báo cáo cấp KÊNH (1 kênh Zalo gắn nhiều phòng): TỔNG QUAN (cộng dồn các phòng, kèm
 * tách hãng) + từng PHÒNG (kèm tách hãng). Chỉ gom lead có sales_team_id thuộc seed.teams.
 * Phòng trong seed nhưng 0 lead vẫn xuất hiện (báo cáo số 0).
 */
export function buildChannelReport(
  leads: ReportLead[], dateLabel: string, now: Date, seed: ChannelReportSeed,
  modelBreakBrandIds: Set<string> = new Set(),
): ChannelReport {
  const teamIds = new Set(seed.teams.map((t) => t.id));
  const brandName = new Map((seed.brands ?? []).map((b) => [b.id, b.name]));
  const overview = newBucket(seed.headerName);
  const teamBuckets = new Map<string, Bucket>();
  // Phòng "theo dòng xe" khi MỌI hãng của phòng đều có cờ report_by_model (phòng Tải Bus chuyên biệt).
  const isModelTeam = (t: { brand_ids?: string[] }) =>
    (t.brand_ids ?? []).length > 0 && (t.brand_ids ?? []).every((bid) => modelBreakBrandIds.has(bid));
  overview.byModel = seed.teams.length > 0 && seed.teams.every(isModelTeam);
  for (const t of seed.teams) {
    const tb = newBucket(t.name);
    if (isModelTeam(t)) {
      // Dòng xe KHÔNG seed toàn danh mục → chỉ hiện dòng xe thực có lead + "Chưa xác định".
      tb.byModel = true;
    } else {
      // Seed sẵn hãng phòng bán (0 lead) → chi tiết hãng LUÔN xuất hiện.
      for (const bid of t.brand_ids ?? []) {
        seedBrand(tb, bid, brandName.get(bid) ?? 'Khác');
        seedBrand(overview, bid, brandName.get(bid) ?? 'Khác');
      }
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
    overview: { stats: overview.stats, brands: brandBreaks(overview), byModel: overview.byModel },
    phongs: [...teamBuckets.values()].map((b) => ({
      name: b.name, stats: b.stats, brands: brandBreaks(b), byModel: b.byModel, nonCompliant: nonCompliantOf(b),
    })),
  };
}

export interface ChannelPeriodPhong {
  name: string;
  cur: DailySrStats;
  prev: DailySrStats;
  brands: BrandBreak[];
  byModel: boolean;
}

export interface ChannelPeriodReport {
  dateLabel: string;
  prevLabel: string;
  headerName: string;
  overview: { cur: DailySrStats; prev: DailySrStats; brands: BrandBreak[]; byModel: boolean };
  phongs: ChannelPeriodPhong[];
}

/**
 * Báo cáo KỲ DÀI (TUẦN / THÁNG) cấp KÊNH nhóm bán hàng — tập trung KẾT QUẢ, KHÔNG "quá hạn".
 * Nhận lead kỳ hiện tại + kỳ trước (cùng độ dài) để so sánh. Chỉ gom lead có sales_team_id
 * thuộc seed.teams. Phòng trong seed nhưng 0 lead vẫn xuất hiện (báo cáo số 0).
 */
export function buildChannelPeriodReport(
  current: ReportLead[], previous: ReportLead[],
  dateLabel: string, prevLabel: string, now: Date, seed: ChannelReportSeed,
  modelBreakBrandIds: Set<string> = new Set(),
): ChannelPeriodReport {
  const teamIds = new Set(seed.teams.map((t) => t.id));
  const brandName = new Map((seed.brands ?? []).map((b) => [b.id, b.name]));
  const overviewCur = newBucket(seed.headerName);
  const overviewPrev = newBucket(seed.headerName);
  const curBuckets = new Map<string, Bucket>();
  const prevBuckets = new Map<string, Bucket>();
  const isModelTeam = (t: { brand_ids?: string[] }) =>
    (t.brand_ids ?? []).length > 0 && (t.brand_ids ?? []).every((bid) => modelBreakBrandIds.has(bid));
  overviewCur.byModel = seed.teams.length > 0 && seed.teams.every(isModelTeam);
  for (const t of seed.teams) {
    const cb = newBucket(t.name);
    if (isModelTeam(t)) {
      // Dòng xe KHÔNG seed toàn danh mục → chỉ hiện dòng xe thực có lead + "Chưa xác định".
      cb.byModel = true;
    } else {
      for (const bid of t.brand_ids ?? []) {
        seedBrand(cb, bid, brandName.get(bid) ?? 'Khác');
        seedBrand(overviewCur, bid, brandName.get(bid) ?? 'Khác');
      }
    }
    curBuckets.set(t.id, cb);
    prevBuckets.set(t.id, newBucket(t.name));
  }

  for (const l of current) {
    if (!l.sales_team_id || !teamIds.has(l.sales_team_id)) continue;
    accumulate(overviewCur, l, now);
    accumulate(curBuckets.get(l.sales_team_id)!, l, now);
  }
  for (const l of previous) {
    if (!l.sales_team_id || !teamIds.has(l.sales_team_id)) continue;
    accumulate(overviewPrev, l, now);
    accumulate(prevBuckets.get(l.sales_team_id)!, l, now);
  }

  return {
    dateLabel, prevLabel, headerName: seed.headerName,
    overview: { cur: overviewCur.stats, prev: overviewPrev.stats, brands: brandBreaks(overviewCur), byModel: overviewCur.byModel },
    phongs: seed.teams.map((t) => {
      const cb = curBuckets.get(t.id)!;
      return { name: cb.name, cur: cb.stats, prev: prevBuckets.get(t.id)!.stats, brands: brandBreaks(cb), byModel: cb.byModel };
    }),
  };
}

// Báo cáo cho nhóm BLĐ thương hiệu — DÙNG CHUNG cho cả 3 kỳ (chỉ khác dateLabel; caller đã
// lọc lead theo kỳ + company + brand_ids TRƯỚC khi truyền vào). KHÔNG so sánh kỳ trước.
// seed.brands = danh sách hãng phụ trách {id,name} → hãng 0 lead vẫn hiện khối (stats 0).
export function buildBrandReport(
  leads: ReportLead[],
  dateLabel: string,
  now: Date,
  seed: { headerName: string; brands: { id: string; name: string }[] },
): BrandReport {
  interface Acc {
    brandId: string;
    brandName: string;
    stats: DailySrStats;
    models: Map<string, { name: string; stats: DailySrStats }>;
  }
  const byBrand = new Map<string, Acc>();
  for (const b of seed.brands) {
    byBrand.set(b.id, { brandId: b.id, brandName: b.name, stats: emptyStats(), models: new Map() });
  }
  for (const l of leads) {
    if (!l.brand_id) continue;
    const acc = byBrand.get(l.brand_id);
    if (!acc) continue; // lead ngoài tập hãng phụ trách → bỏ qua (cô lập)
    addStats(acc.stats, l, now);
    const mKey = `m:${l.model_id ?? 'none'}`;
    const mSub = acc.models.get(mKey) ?? { name: l.model_name?.trim() || 'Chưa xác định', stats: emptyStats() };
    addStats(mSub.stats, l, now);
    acc.models.set(mKey, mSub);
  }
  const sortBreaks = (m: Map<string, { name: string; stats: DailySrStats }>): BrandBreak[] =>
    [...m.values()].sort((a, b) => b.stats.total - a.stats.total || a.name.localeCompare(b.name));
  const blocks: BrandBlock[] = seed.brands.map((b) => {
    const acc = byBrand.get(b.id)!;
    return { brandId: acc.brandId, brandName: acc.brandName, stats: acc.stats, models: sortBreaks(acc.models) };
  });
  return { dateLabel, headerName: seed.headerName, blocks };
}
