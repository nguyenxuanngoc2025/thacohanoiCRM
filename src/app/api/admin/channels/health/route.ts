import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { checkFacebookPageHealth } from '@/lib/facebook';

// Kiểm tra "sức khoẻ" 1 kênh kết nối (hiện hỗ trợ Facebook fanpage).
// Cô lập theo công ty qua showroom — giống /api/admin/channels.
export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { service, companyId } = guard.ctx;

  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'Thiếu id kênh.' }, { status: 400 });

    const { data: channel } = await service
      .from('channel_accounts')
      .select('id, platform, page_id, page_name, showroom_id')
      .eq('id', id)
      .maybeSingle();
    if (!channel) return NextResponse.json({ error: 'Không tìm thấy kênh.' }, { status: 404 });

    // Kênh phải gắn showroom thuộc công ty của admin.
    const { data: srRows } = await service.from('showrooms').select('id').eq('company_id', companyId);
    const companySrIds = ((srRows ?? []) as { id: string }[]).map((r) => r.id);
    if (!companySrIds.includes(channel.showroom_id as string)) {
      return NextResponse.json({ error: 'Kênh không thuộc công ty của bạn.' }, { status: 404 });
    }

    if (channel.platform !== 'facebook') {
      return NextResponse.json({
        ok: true,
        checks: [{ label: 'Kênh', status: 'warn', detail: 'Kiểm tra tự động hiện chỉ hỗ trợ Facebook fanpage.' }],
      });
    }

    const result = await checkFacebookPageHealth(String(channel.page_id));
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
