import { NextResponse, type NextRequest } from 'next/server';
import { requirePlatformOwner } from '@/lib/platform-guard';
import { buildSampleForUnit } from '@/lib/report-sample';

export const dynamic = 'force-dynamic';

/**
 * Xem NỘI DUNG MẪU của tin cho 1 timer có gửi tin (báo cáo ngày/tuần/tháng, nhắc
 * việc, nhắc lịch trực, báo sức khoẻ). Chỉ dựng từ dữ liệu giả (report-sample) —
 * KHÔNG đọc dữ liệu thật, KHÔNG gửi tin.
 */
export async function GET(request: NextRequest) {
  const guard = await requirePlatformOwner();
  if (guard.error) return guard.error;

  const unit = new URL(request.url).searchParams.get('unit') ?? '';
  const sections = buildSampleForUnit(unit, new Date());
  if (!sections) {
    return NextResponse.json({ error: 'Tác vụ này không có nội dung mẫu.' }, { status: 400 });
  }
  return NextResponse.json({ sections });
}
