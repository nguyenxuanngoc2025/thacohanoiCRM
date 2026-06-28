import { NextResponse, type NextRequest } from 'next/server';
import { requirePlatformOwner } from '@/lib/platform-guard';

// Cấu hình cấp nền tảng (key-value). Chỉ chủ nền tảng được ghi.
const ALLOWED_KEYS = new Set(['fb_business_id', 'google_oauth_client_id', 'google_api_key']);

export async function POST(request: NextRequest) {
  const guard = await requirePlatformOwner();
  if (guard.error) return guard.error;
  const { service } = guard.ctx;

  try {
    const body = await request.json();
    const key = String(body.key ?? '').trim();
    if (!ALLOWED_KEYS.has(key)) {
      return NextResponse.json({ error: 'Khoá cấu hình không hợp lệ.' }, { status: 400 });
    }
    const value = typeof body.value === 'string' ? body.value.trim() : '';

    const { error } = await service
      .from('platform_settings')
      .upsert({ key, value: value || null, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
