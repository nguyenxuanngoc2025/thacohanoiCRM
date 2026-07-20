import { NextResponse, type NextRequest } from 'next/server';
import { requirePlatformOwner } from '@/lib/platform-guard';
import { buildSampleReport, samplePeriodOfUnit } from '@/lib/report-sample';

export const dynamic = 'force-dynamic';

/**
 * Xem NỘI DUNG MẪU của tin báo cáo (ngày/tuần/tháng) cho 1 timer báo cáo.
 * Chỉ dựng từ dữ liệu giả (report-sample) — KHÔNG đọc dữ liệu thật, KHÔNG gửi tin.
 */
export async function GET(request: NextRequest) {
  const guard = await requirePlatformOwner();
  if (guard.error) return guard.error;

  const unit = new URL(request.url).searchParams.get('unit') ?? '';
  const period = samplePeriodOfUnit(unit);
  if (!period) {
    return NextResponse.json({ error: 'Tác vụ này không có nội dung mẫu.' }, { status: 400 });
  }
  const sections = buildSampleReport(period, new Date());
  return NextResponse.json({ period, sections });
}
