import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET: trả VAPID public key cho client đăng ký PushManager.
export async function GET() {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || '';
  return NextResponse.json({ publicKey: key });
}

// POST: lưu/ cập nhật đăng ký thiết bị. user_id + company_id lấy từ SESSION (không tin client).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const endpoint = body.endpoint?.trim();
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;
  if (!endpoint || !p256dh || !auth) return NextResponse.json({ error: 'thieu du lieu dang ky' }, { status: 400 });

  const service = createServiceClient();
  const { data: profile } = await service.from('users').select('company_id').eq('id', user.id).maybeSingle();
  const companyId = (profile?.company_id as string | null) ?? null;

  const { error } = await service.from('push_subscriptions').upsert({
    user_id: user.id,
    company_id: companyId,
    endpoint,
    p256dh,
    auth,
    user_agent: request.headers.get('user-agent'),
    last_seen_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true });
}
