/**
 * Sinh NỘI DUNG MẪU cho tin báo cáo (ngày / tuần / tháng) từ dữ liệu giả đại diện.
 * Dùng cho nút "Xem nội dung mẫu" ở trang quản lý cron — người vận hành xem trước
 * hình thức tin Zalo mà KHÔNG cần chờ tới giờ chạy và KHÔNG đụng dữ liệu thật.
 * Thuần (không I/O) → dễ test, luôn ra kết quả ổn định.
 */
import { buildPeriodReport, buildLongPeriodReport, buildChannelReport, buildChannelPeriodReport, type ReportLead } from './daily-report';
import { renderChannelDaily, renderChannelPeriod } from './notify-templates';

export type SamplePeriod = 'daily' | 'weekly' | 'monthly';

export interface SampleSection {
  label: string; // nơi tin được gửi tới (nhóm nào)
  text: string; // nội dung tin (marker <b>/<i>, xuống dòng như tin thật)
}

const SR_A = 'sr-a', SR_B = 'sr-b';
const TEAM_A = 'team-a', TEAM_B = 'team-b';
const B_KIA = 'b-kia', B_MAZDA = 'b-mazda';

function mk(p: Partial<ReportLead>): ReportLead {
  return {
    showroom_id: SR_A, showroom_name: 'Showroom Hà Nội 1',
    sales_team_id: TEAM_A, team_name: 'Phòng KIA–Mazda 1',
    brand_id: B_KIA, brand_name: 'KIA',
    company_id: null,
    model_id: null, model_name: null,
    last_contact_at: null, next_contact_at: null, status: null, assignee_name: null,
    ...p,
  };
}

// Bộ lead kỳ HIỆN TẠI (đủ trạng thái để tin mẫu có phễu chốt, tỷ lệ, quá hạn).
function currentLeads(contactedAt: string, overdueAt: string): ReportLead[] {
  return [
    mk({ last_contact_at: contactedAt, status: 'KHĐ', assignee_name: 'Nguyễn Văn An' }),
    mk({ last_contact_at: contactedAt, status: 'GDTD', assignee_name: 'Nguyễn Văn An' }),
    mk({ last_contact_at: contactedAt, status: 'KHQT', assignee_name: 'Lê Thị Bình' }),
    mk({ next_contact_at: overdueAt, assignee_name: 'Lê Thị Bình' }),
    mk({ brand_id: B_MAZDA, brand_name: 'Mazda', last_contact_at: contactedAt, status: 'KHĐ', assignee_name: 'Nguyễn Văn An' }),
    mk({ brand_id: B_MAZDA, brand_name: 'Mazda', last_contact_at: contactedAt, status: 'Fail', assignee_name: 'Lê Thị Bình' }),
    mk({ showroom_id: SR_B, showroom_name: 'Showroom Hà Nội 2', sales_team_id: TEAM_B, team_name: 'Phòng KIA–Mazda 2', last_contact_at: contactedAt, status: 'KHĐ', assignee_name: 'Trần Văn Cường' }),
    mk({ showroom_id: SR_B, showroom_name: 'Showroom Hà Nội 2', sales_team_id: TEAM_B, team_name: 'Phòng KIA–Mazda 2', last_contact_at: contactedAt, status: 'KHQT', assignee_name: 'Trần Văn Cường' }),
    mk({ showroom_id: SR_B, showroom_name: 'Showroom Hà Nội 2', sales_team_id: TEAM_B, team_name: 'Phòng KIA–Mazda 2', brand_id: B_MAZDA, brand_name: 'Mazda', next_contact_at: overdueAt, assignee_name: 'Phạm Thị Dung' }),
    mk({ showroom_id: SR_B, showroom_name: 'Showroom Hà Nội 2', sales_team_id: TEAM_B, team_name: 'Phòng KIA–Mazda 2', brand_id: B_MAZDA, brand_name: 'Mazda', last_contact_at: contactedAt, status: 'GDTD', assignee_name: 'Phạm Thị Dung' }),
  ];
}

// Bộ lead kỳ TRƯỚC (ít hơn, ít hợp đồng hơn) → tin tuần/tháng thấy mũi tên tăng ↑.
function previousLeads(contactedAt: string): ReportLead[] {
  return [
    mk({ last_contact_at: contactedAt, status: 'KHĐ' }),
    mk({ last_contact_at: contactedAt, status: 'KHQT' }),
    mk({ brand_id: B_MAZDA, brand_name: 'Mazda', last_contact_at: contactedAt, status: 'Fail' }),
    mk({ showroom_id: SR_B, showroom_name: 'Showroom Hà Nội 2', sales_team_id: TEAM_B, team_name: 'Phòng KIA–Mazda 2', last_contact_at: contactedAt, status: 'GDTD' }),
    mk({ showroom_id: SR_B, showroom_name: 'Showroom Hà Nội 2', sales_team_id: TEAM_B, team_name: 'Phòng KIA–Mazda 2', last_contact_at: contactedAt, status: 'KHQT' }),
  ];
}

const p2 = (n: number) => String(n).padStart(2, '0');
const dmVn = (d: Date) => `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}`;

const SHOWROOM_SEED = [{ id: SR_A, name: 'Showroom Hà Nội 1' }, { id: SR_B, name: 'Showroom Hà Nội 2' }];

/**
 * Dựng danh sách khối tin mẫu cho 1 kỳ báo cáo. Mỗi khối = 1 nơi nhận (nhóm Zalo).
 * now dùng để tính "quá hạn" (tin ngày) và nhãn ngày/tuần/tháng.
 */
export function buildSampleReport(period: SamplePeriod, now: Date): SampleSection[] {
  const todayVn = new Date(now.getTime() + 7 * 3600000);
  todayVn.setUTCHours(0, 0, 0, 0);
  const contactedAt = new Date(now.getTime() - 3 * 3600000).toISOString();
  const overdueAt = new Date(now.getTime() - 1 * 3600000).toISOString();
  const cur = currentLeads(contactedAt, overdueAt);
  const brandsCatalog = [{ id: B_KIA, name: 'KIA' }, { id: B_MAZDA, name: 'Mazda' }];

  if (period === 'daily') {
    const dateLabel = `NGÀY ${dmVn(todayVn)}`;
    const chan = buildChannelReport(cur, dateLabel, now, {
      headerName: 'Phòng KIA–Mazda 1',
      teams: [{ id: TEAM_A, name: 'Phòng KIA–Mazda 1', brand_ids: [B_KIA, B_MAZDA] }],
      brands: brandsCatalog,
    });
    const rep = buildPeriodReport(cur, dateLabel, now, { showrooms: SHOWROOM_SEED });
    return [
      { label: 'Nhóm Zalo phòng bán hàng', text: renderChannelDaily(chan) },
      { label: 'Nhóm BLĐ showroom (Showroom Hà Nội 1)', text: rep.perShowroom[0]?.text ?? '' },
      { label: 'Nhóm BLĐ công ty (bảng tổng hợp)', text: rep.management },
    ];
  }

  const prev = previousLeads(contactedAt);
  let dateLabel: string, prevLabel: string;
  if (period === 'weekly') {
    const curStart = new Date(todayVn.getTime() - 7 * 86400000);
    const prevStart = new Date(todayVn.getTime() - 14 * 86400000);
    dateLabel = `TUẦN ${dmVn(curStart)}–${dmVn(new Date(todayVn.getTime() - 86400000))}`;
    prevLabel = `TUẦN ${dmVn(prevStart)}–${dmVn(new Date(curStart.getTime() - 86400000))}`;
  } else {
    const curStart = new Date(Date.UTC(todayVn.getUTCFullYear(), todayVn.getUTCMonth() - 1, 1));
    const prevStart = new Date(Date.UTC(todayVn.getUTCFullYear(), todayVn.getUTCMonth() - 2, 1));
    dateLabel = `THÁNG ${p2(curStart.getUTCMonth() + 1)}/${curStart.getUTCFullYear()}`;
    prevLabel = `THÁNG ${p2(prevStart.getUTCMonth() + 1)}/${prevStart.getUTCFullYear()}`;
  }
  const chan = buildChannelPeriodReport(cur, prev, dateLabel, prevLabel, now, {
    headerName: 'Phòng KIA–Mazda 1',
    teams: [{ id: TEAM_A, name: 'Phòng KIA–Mazda 1', brand_ids: [B_KIA, B_MAZDA] }],
    brands: brandsCatalog,
  });
  const rep = buildLongPeriodReport(cur, prev, dateLabel, prevLabel, now, { showrooms: SHOWROOM_SEED });
  return [
    { label: 'Nhóm Zalo phòng bán hàng', text: renderChannelPeriod(chan) },
    { label: 'Nhóm BLĐ showroom (Showroom Hà Nội 1)', text: rep.perShowroom[0]?.text ?? '' },
    { label: 'Nhóm BLĐ công ty (bảng tổng hợp)', text: rep.management },
  ];
}

/** Map tên unit timer → kỳ báo cáo. Trả null nếu unit không phải timer báo cáo. */
export function samplePeriodOfUnit(unit: string): SamplePeriod | null {
  const base = unit.replace(/\.timer$/, '');
  if (base === 'cron-daily-report') return 'daily';
  if (base === 'cron-weekly-report') return 'weekly';
  if (base === 'cron-monthly-report') return 'monthly';
  return null;
}
