import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { gatherSystemHealth } from '@/lib/system-health';

export const dynamic = 'force-dynamic';

// Tổng hợp "Tình trạng hệ thống" cho công ty của admin đang đăng nhập.
// Cô lập đa tenant qua companyId của caller (gatherSystemHealth lọc theo company).
export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { companyId } = guard.ctx;
  try {
    const health = await gatherSystemHealth(companyId ?? '');
    return NextResponse.json(health);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Không tổng hợp được tình trạng hệ thống.' },
      { status: 500 },
    );
  }
}
